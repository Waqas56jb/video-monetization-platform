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

    const [people, videos, money] = await Promise.all([
      one(`select count(*) filter (where role = 'creator')::int as creators,
                  count(*) filter (where role = 'viewer')::int   as viewers
             from profiles where status = 'active'`),
      one(`select count(*)::int as published,
                  coalesce(sum(views),0)::int as views,
                  coalesce(sum(paid_unlocks),0)::int as unlocks
             from videos
            where is_published and review_status = 'approved' and deleted_at is null`),
      one(`select coalesce(sum(creator_tzs),0)::int as to_creators,
                  coalesce(sum(gross_tzs),0)::int   as gross
             from earnings`),
    ])

    res.json({
      creators: people.creators,
      viewers: people.viewers,
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
        group by p.id, cp.display_name, p.full_name, p.avatar_url, cp.verified, cp.location
       having coalesce(sum(e.creator_tzs), 0) > 0
        order by earned_tzs desc
        limit 6`
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
