import { Router } from 'express'
import { one, many } from '../db/pool.js'
import { asyncHandler } from '../lib/errors.js'
import { getSettings } from '../services/settings.js'
import { env } from '../config/env.js'

/**
 * Public figures for the landing page.
 *
 * Deliberately counts rather than estimates, and deliberately returns zero when
 * the answer is zero. The landing page decides what to *show* — a brand-new
 * platform should lead with what it promises rather than with "0 creators",
 * but that is a presentation decision, and it can only be made honestly if the
 * number underneath is the real one.
 *
 * Nothing here identifies anybody: totals and public creator names only.
 */
const router = Router()

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings()

    const [people, videos, money, earning] = await Promise.all([
      /* People and money obey the demo-content switch, like creatorsEarning
         below: with it off, "Earned by creators" was 223,124 of which the
         real creators had earned 52,920 — the rest was demo and smoke-test
         ledger (final audit I3). Published videos are not filtered: that
         figure counts the catalogue people can actually see. */
      one(
        `select count(*) filter (where role = 'creator')::int as creators,
                count(*) filter (where role = 'viewer')::int   as viewers
           from profiles where status = 'active' and ($1::boolean or not is_demo)`,
        [Boolean(settings.show_demo_content_in_stats)]
      ),
      one(`select count(*)::int as published,
                  coalesce(sum(views),0)::int as views,
                  coalesce(sum(paid_unlocks),0)::int as unlocks
             from videos
            where is_published and review_status = 'approved' and deleted_at is null`),
      one(
        `select coalesce(sum(e.creator_tzs),0)::int as to_creators,
                coalesce(sum(e.gross_tzs),0)::int   as gross
           from earnings e join profiles p on p.id = e.creator_id
          where ($1::boolean or not p.is_demo)`,
        [Boolean(settings.show_demo_content_in_stats)]
      ),
      /**
       * Creators who have actually earned something, as distinct from
       * creators who exist. The homepage used to caption the second number
       * "Creators earning" — 31, of whom most had earned TZS 0 (client's
       * Sep 17 review). Respects the demo-content switch the same way
       * /top-creators does.
       */
      one(
        `select count(distinct e.creator_id)::int as n
           from earnings e join profiles p on p.id = e.creator_id
          where e.creator_tzs > 0 and p.status = 'active'
            and ($1::boolean or not p.is_demo)`,
        [Boolean(settings.show_demo_content_in_stats)]
      ),
    ])

    res.json({
      creators: people.creators,
      creatorsEarning: earning.n,
      viewers: people.viewers,
      /** The ONE Creator Capital eligibility rule (migration 040), for the
          public explainer and the homepage's illustrative status card. */
      capitalMonthsRequired: Number(settings.capital_months_required) || 6,
      publishedVideos: videos.published,
      totalViews: videos.views,
      paidUnlocks: videos.unlocks,
      paidToCreatorsTzs: money.to_creators,
      grossTzs: money.gross,
      creatorSplitPercent: settings.creator_split_percent,

      /**
       * Which payment provider is live. The apps use this to decide whether to
       * explain the test outcomes — guidance that would be nonsense, and
       * alarming, on a site taking real money.
       */
      paymentProvider: env.payments.provider,

      /**
       * Has anything actually happened here yet? The landing page uses this to
       * choose between real figures and what the platform offers, rather than
       * printing a row of zeroes at a first-time visitor.
       */
      hasActivity: videos.published > 0,
    })
  })
)

/**
 * Creators worth putting on the front page — the ones people are actually
 * paying. Empty until somebody has earned something, which is correct.
 */
router.get(
  '/top-creators',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings()
    const rows = await many(
      `select p.id,
              coalesce(cp.display_name, p.full_name) as name,
              p.avatar_url, cp.verified, cp.location,
              (select count(*)::int from videos v
                where v.creator_id = p.id and v.is_published and v.deleted_at is null) as videos,
              coalesce(sum(e.creator_tzs), 0)::int as earned_tzs
         from profiles p
         join creator_profiles cp on cp.user_id = p.id
         left join earnings e on e.creator_id = p.id
        where p.status = 'active'
          and ($1::boolean or not p.is_demo)
        group by p.id, cp.display_name, p.full_name, p.avatar_url, cp.verified, cp.location
       having coalesce(sum(e.creator_tzs), 0) > 0
        order by earned_tzs desc
        limit 6`,
      [Boolean(settings.show_demo_content_in_stats)]
    )

    res.json({
      creators: rows.map((r) => ({
        id: r.id,
        name: r.name,
        avatarUrl: r.avatar_url,
        verified: r.verified,
        location: r.location,
        videos: r.videos,
        earnedTzs: r.earned_tzs,
      })),
    })
  })
)

export default router
