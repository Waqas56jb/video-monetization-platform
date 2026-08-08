import { Router } from 'express'
import { z } from 'zod'
import { one, many, transaction } from '../db/pool.js'
import { asyncHandler, notFound, badRequest } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { optionalAuth } from '../middleware/auth.js'
import { getSettings, splitPercentFor, applySplit } from '../services/settings.js'

const router = Router()

/**
 * The pre-roll a free-with-ads video plays before it starts.
 *
 * Only free videos carry ads — a paid video the customer unlocked stays
 * ad-free forever, which is the promise made at the paywall.
 */
router.get(
  '/preroll/:videoId',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const video = await one(
      `select id, access_type, ads_enabled, is_published from videos
        where id = $1 and deleted_at is null`,
      [req.params.videoId]
    )
    if (!video) throw notFound('Video not found')

    const settings = await getSettings()
    const eligible =
      video.is_published && video.access_type === 'free_with_ads' && video.ads_enabled && settings.preroll_enabled

    if (!eligible) return res.json({ ad: null, reason: 'This video does not carry ads' })

    // Someone who bought it before it went free keeps their ad-free copy.
    if (req.user) {
      const owned = await one(
        `select id from purchases where user_id = $1 and video_id = $2 and status = 'active'`,
        [req.user.id, video.id]
      )
      if (owned) return res.json({ ad: null, reason: 'You own this video — no ads' })
    }

    const campaign = await one(
      `select * from ad_campaigns where active = true order by random() limit 1`
    )
    if (!campaign) return res.json({ ad: null, reason: 'No active campaign' })

    res.json({
      ad: {
        campaignId: campaign.id,
        name: campaign.name,
        advertiser: campaign.advertiser,
        skipAfterSeconds: settings.preroll_skip_after_secs,
      },
    })
  })
)

/**
 * Record that an ad played, and credit the creator their share of it.
 *
 * This is what "continues earning ad revenue" means in practice: an expired
 * premiere keeps paying its creator through this ledger entry.
 */
router.post(
  '/impression',
  optionalAuth(),
  validate(
    z.object({
      videoId: z.string().uuid(),
      campaignId: z.string().uuid().optional(),
      completed: z.boolean().default(false),
    })
  ),
  asyncHandler(async (req, res) => {
    const { videoId, campaignId, completed } = req.body
    const video = await one(
      `select id, creator_id, access_type, ads_enabled from videos where id = $1 and deleted_at is null`,
      [videoId]
    )
    if (!video) throw notFound('Video not found')
    if (video.access_type !== 'free_with_ads' || !video.ads_enabled) {
      throw badRequest('This video does not carry ads')
    }

    const settings = await getSettings()
    const campaign = campaignId ? await one('select * from ad_campaigns where id = $1', [campaignId]) : null

    // CPM: revenue per thousand impressions, so one impression is cpm/1000.
    const cpm = campaign?.cpm_tzs ?? 0
    const revenue = completed ? Math.max(0, Math.round(cpm / 1000)) : 0

    const percent = settings.share_ad_revenue ? await splitPercentFor(video.creator_id) : 0
    const split = applySplit(revenue, percent)

    await transaction(async (client) => {
      await client.query(
        `insert into ad_impressions (video_id, campaign_id, user_id, revenue_tzs)
         values ($1,$2,$3,$4)`,
        [video.id, campaign?.id ?? null, req.user?.id ?? null, revenue]
      )
      if (revenue > 0) {
        await client.query(
          `insert into earnings
             (creator_id, video_id, source, gross_tzs, creator_tzs, platform_tzs, split_percent)
           values ($1,$2,'ad',$3,$4,$5,$6)`,
          [video.creator_id, video.id, revenue, split.creator, split.platform, split.percent]
        )
      }
    })

    res.status(202).json({ recorded: true, revenueTzs: revenue, creatorTzs: split.creator })
  })
)

/** Public list of active campaigns, for the admin preview and reporting. */
router.get(
  '/campaigns',
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `select id, name, advertiser, cpm_tzs, active from ad_campaigns where active order by name`
    )
    res.json({ campaigns: rows })
  })
)

export default router
