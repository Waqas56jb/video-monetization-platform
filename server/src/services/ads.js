/**
 * Which advert, if any, runs against this video.
 *
 * Two rules sit above everything else here, and both come from promises made to
 * people who paid:
 *
 *  1. Only a free-with-ads video carries advertising. A Paid Premiere still
 *     inside its window is being sold, not monetised by ads.
 *  2. Anyone who bought the video keeps it ad-free forever, including after the
 *     premiere expires and it turns free for everyone else. They paid to skip
 *     exactly this, and a premiere expiring is not permission to renege.
 *
 * Everything below is selection detail. These two are the product.
 */
import { one, many, query, transaction } from '../db/pool.js'
import { getSettings, splitPercentFor, applySplit } from './settings.js'
import * as cf from '../lib/cloudflare.js'
import { capabilities } from '../config/env.js'

/** A CPM is priced per thousand impressions; micro-TZS keeps that exact. */
const MICRO = 1_000_000
export const microPerImpression = (cpmTzs) => Math.max(0, Math.round((Number(cpmTzs) || 0) * 1000))
export const microToTzs = (micro) => Math.round(Number(micro || 0) / MICRO)

/**
 * Is this video allowed to carry advertising at all, for this viewer?
 *
 * Returns a reason when it is not, because "no ad played" and "ads are switched
 * off for this video" look identical from the outside and are diagnosed very
 * differently.
 */
export async function adEligibility({ video, userId }) {
  const settings = await getSettings()

  if (!video.is_published) return { eligible: false, reason: 'This video is not published' }
  if (video.access_type !== 'free_with_ads') {
    return { eligible: false, reason: 'Only free-with-ads videos carry advertising' }
  }
  if (!video.ads_enabled) return { eligible: false, reason: 'Advertising is off for this video' }

  if (userId) {
    const owned = await one(
      `select id from purchases where user_id = $1 and video_id = $2 and status = 'active'`,
      [userId, video.id]
    )
    // The whole point of having paid.
    if (owned) return { eligible: false, reason: 'You bought this video — it stays ad-free' }
  }

  return { eligible: true, settings }
}

/**
 * Pick a campaign for one placement.
 *
 * Targeting is deliberately permissive: an empty target list means "anywhere",
 * so a campaign created without targeting runs everywhere it is allowed rather
 * than nowhere at all. Ties are broken at random so a single campaign does not
 * monopolise every video the moment it is created.
 */
export async function pickCampaign({ video, placement }) {
  const rows = await many(
    `select * from ad_campaigns
      where active = true
        and cloudflare_uid is not null
        and $2 = any(placements)
        and (starts_at is null or starts_at <= now())
        and (ends_at   is null or ends_at   >= now())
        and (cardinality(target_video_ids)   = 0 or $1 = any(target_video_ids))
        and (cardinality(target_creator_ids) = 0 or $3 = any(target_creator_ids))
        and (cardinality(target_categories)  = 0 or lower(coalesce($4,'')) = any(
              select lower(c) from unnest(target_categories) c))
      order by random()
      limit 1`,
    [video.id, placement, video.creator_id, video.category]
  )
  return rows[0] ?? null
}

/** The advert, shaped for the player, with a signed token if the account needs one. */
export function adPayload(campaign, { placement, skipAfterSeconds }) {
  const token = capabilities.signedPlayback
    ? cf.signPlaybackToken(campaign.cloudflare_uid, { expiresInSeconds: 3600 })
    : campaign.cloudflare_uid

  return {
    campaignId: campaign.id,
    placement,
    name: campaign.name,
    advertiser: campaign.advertiser,
    durationSeconds: campaign.duration_seconds || null,
    skipAfterSeconds:
      campaign.skip_after_seconds != null ? campaign.skip_after_seconds : skipAfterSeconds,
    ...cf.playbackUrls(token),
  }
}

/**
 * Every placement this viewer should see for this video, in one answer.
 *
 * One request rather than three: the player needs to know about the mid-roll
 * before it reaches the middle, and asking mid-playback would stall the video
 * at the worst possible moment.
 */
export async function adBreaksFor({ video, userId }) {
  const check = await adEligibility({ video, userId })
  if (!check.eligible) return { ads: [], reason: check.reason }

  const s = check.settings
  const wanted = []
  if (s.preroll_enabled) wanted.push({ placement: 'pre_roll', at: 0 })
  // A mid-roll needs a middle to sit in. Short videos get none.
  if (s.midroll_enabled && Number(video.duration_seconds || 0) > Number(s.midroll_after_secs || 300)) {
    wanted.push({ placement: 'mid_roll', at: Math.floor(Number(video.duration_seconds) / 2) })
  }
  if (s.postroll_enabled) wanted.push({ placement: 'post_roll', at: null })

  const ads = []
  for (const w of wanted) {
    const campaign = await pickCampaign({ video, placement: w.placement })
    if (!campaign) continue
    ads.push({
      ...adPayload(campaign, { placement: w.placement, skipAfterSeconds: s.preroll_skip_after_secs }),
      atSeconds: w.at,
    })
  }

  return { ads, reason: ads.length ? null : 'No campaign is currently targeting this video' }
}

/**
 * Record that an advert played, and credit it.
 *
 * The earnings row is a per-day rollup recomputed from the impressions it covers
 * rather than incremented, so it cannot drift away from them — the same reason
 * the view and unlock counters became triggers in migration 006.
 */
export async function recordImpression({
  video,
  campaignId,
  userId,
  placement,
  playId,
  secondsWatched = 0,
  completed = false,
}) {
  const settings = await getSettings()
  const campaign = campaignId
    ? await one('select * from ad_campaigns where id = $1', [campaignId])
    : null

  // An advert abandoned after two seconds was not delivered, and an advertiser
  // should not be billed for it.
  const billable = completed && campaign != null
  const micro = billable ? microPerImpression(campaign.cpm_tzs) : 0

  const percent = settings.share_ad_revenue ? await splitPercentFor(video.creator_id) : 0
  const creatorMicro = Math.round((micro * percent) / 100)
  const platformMicro = micro - creatorMicro

  const inserted = await transaction(async (client) => {
    const { rows } = await client.query(
      `insert into ad_impressions
         (video_id, campaign_id, user_id, creator_id, placement, play_id,
          seconds_watched, completed, revenue_tzs,
          revenue_micro_tzs, creator_micro_tzs, platform_micro_tzs, split_percent)
       values ($1,$2,$3,$4,$5::ad_placement,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (campaign_id, video_id, placement, play_id)
         where play_id is not null
         do nothing
       returning id`,
      [
        video.id,
        campaign?.id ?? null,
        userId ?? null,
        video.creator_id,
        placement,
        playId ?? null,
        secondsWatched,
        completed,
        microToTzs(micro),
        micro,
        creatorMicro,
        platformMicro,
        percent,
      ]
    )

    // Already counted for this playback — say so rather than paying twice.
    if (!rows.length) return { duplicate: true }

    if (campaign && micro > 0) {
      // Recompute the day's totals from the impressions themselves.
      await client.query(
        /**
         * Round twice, subtract once.
         *
         * Rounding gross, creator and platform independently lets them disagree
         * by a shilling — the admin's Revenue screen then shows a split that
         * does not add up to its own total, which makes every figure on the page
         * look untrustworthy. So the platform share is whatever is left after
         * the creator's, and the three always reconcile.
         */
        `insert into earnings
           (creator_id, video_id, campaign_id, ad_day, source,
            gross_tzs, creator_tzs, platform_tzs, split_percent)
         select $1, $2, $3, current_date, 'ad',
                round(sum(revenue_micro_tzs) / 1000000.0)::int,
                round(sum(creator_micro_tzs) / 1000000.0)::int,
                round(sum(revenue_micro_tzs) / 1000000.0)::int
                  - round(sum(creator_micro_tzs) / 1000000.0)::int,
                $4
           from ad_impressions
          where video_id = $2 and campaign_id = $3
            and created_at >= current_date
         on conflict (video_id, campaign_id, ad_day) where source = 'ad' and ad_day is not null
         do update set gross_tzs    = excluded.gross_tzs,
                       creator_tzs  = excluded.creator_tzs,
                       platform_tzs = excluded.platform_tzs`,
        [video.creator_id, video.id, campaign.id, percent]
      )
    }
    return { duplicate: false }
  })

  return {
    recorded: !inserted.duplicate,
    duplicate: inserted.duplicate,
    billable,
    revenueMicroTzs: micro,
    creatorMicroTzs: creatorMicro,
    splitPercent: percent,
  }
}

/** How a campaign is actually performing, straight from its impressions. */
export async function campaignPerformance(campaignId = null) {
  const rows = await many(
    `select c.id,
            count(i.id)::int                                        as impressions,
            count(i.id) filter (where i.completed)::int              as completed,
            count(distinct i.video_id)::int                          as videos,
            coalesce(sum(i.revenue_micro_tzs), 0)::bigint            as revenue_micro,
            coalesce(sum(i.creator_micro_tzs), 0)::bigint            as creator_micro,
            coalesce(sum(i.platform_micro_tzs), 0)::bigint           as platform_micro,
            max(i.created_at)                                       as last_served
       from ad_campaigns c
       left join ad_impressions i on i.campaign_id = c.id
      where ($1::uuid is null or c.id = $1)
      group by c.id`,
    [campaignId]
  )

  const byId = new Map()
  for (const r of rows) {
    byId.set(r.id, {
      impressions: r.impressions,
      completed: r.completed,
      videos: r.videos,
      revenueTzs: microToTzs(r.revenue_micro),
      creatorTzs: microToTzs(r.creator_micro),
      platformTzs: microToTzs(r.platform_micro),
      lastServedAt: r.last_served,
    })
  }
  return byId
}

/** Keep `updated_at` honest whenever a campaign is edited. */
export const touchCampaign = (id) =>
  query('update ad_campaigns set updated_at = now() where id = $1', [id])
