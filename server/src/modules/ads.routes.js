import { Router } from 'express'
import { z } from 'zod'
import { one, many } from '../db/pool.js'
import { asyncHandler, notFound, badRequest } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { optionalAuth } from '../middleware/auth.js'
import { adBreaksFor, adEligibility, pickCampaign, adPayload, recordImpression } from '../services/ads.js'
import { getSettings } from '../services/settings.js'
import { slugFallbacks } from '../lib/videoKey.js'
import { expireIfDue } from '../jobs/premiere.js'

const router = Router()

/**
 * Find the video by whichever identifier the caller has.
 *
 * The watch page's URL carries the slug, so that is what reaches these routes.
 * Matching on `id` alone meant the player asked for its ad breaks using a slug,
 * got nothing back, and silently played the video with no advertising at all —
 * the free tier earning nothing while looking like it worked.
 */
const videoForAds = (idOrSlug) =>
  one(
    `select id, title, creator_id, category, access_type, ads_enabled, is_published,
            duration_seconds, premiere_ends_at
       from videos where (id::text = $1 or slug = any($2::text[])) and deleted_at is null`,
    [idOrSlug, slugFallbacks(idOrSlug)]
  )

/**
 * Every ad break for this video, in one call.
 *
 * The player needs to know about the mid-roll before it gets to the middle;
 * asking for it on the way past would stall the video mid-sentence.
 */
router.get(
  '/breaks/:videoId',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    let video = await videoForAds(req.params.videoId)
    if (!video) throw notFound('Video not found')

    video = await expireIfDue(video)

    const { ads, reason } = await adBreaksFor({
      video,
      userId: req.user?.id,
      userRole: req.user?.role,
    })
    res.json({ ads, reason })
  })
)

/**
 * The pre-roll on its own.
 *
 * Kept because it is the older shape of this endpoint and something may still
 * be calling it; `/breaks` is what the player uses now.
 */
router.get(
  '/preroll/:videoId',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    let video = await videoForAds(req.params.videoId)
    if (!video) throw notFound('Video not found')

    video = await expireIfDue(video)

    const check = await adEligibility({
      video,
      userId: req.user?.id,
      userRole: req.user?.role,
    })
    if (!check.eligible) return res.json({ ad: null, reason: check.reason })
    if (!check.settings.preroll_enabled) {
      return res.json({ ad: null, reason: 'Pre-roll advertising is switched off' })
    }

    const campaign = await pickCampaign({ video, placement: 'pre_roll' })
    if (!campaign) return res.json({ ad: null, reason: 'No campaign is targeting this video' })

    res.json({
      ad: adPayload(campaign, {
        placement: 'pre_roll',
        skipAfterSeconds: check.settings.preroll_skip_after_secs,
      }),
    })
  })
)

/**
 * Record that an advert played, and credit the creator their share.
 *
 * This is what "an expired premiere keeps earning" means in practice. An
 * advertiser is only billed for an advert that actually finished — `completed`
 * decides whether this impression carries money or is logged as delivered but
 * abandoned.
 */
router.post(
  '/impression',
  optionalAuth(),
  validate(
    z.object({
      videoId: z.string().uuid(),
      campaignId: z.string().uuid().optional(),
      placement: z.enum(['pre_roll', 'mid_roll', 'post_roll']).default('pre_roll'),
      /** One playback generates one id, so a retry cannot be paid for twice. */
      playId: z.string().uuid().optional(),
      secondsWatched: z.coerce.number().int().min(0).max(3600).default(0),
      completed: z.boolean().default(false),
    })
  ),
  asyncHandler(async (req, res) => {
    const video = await videoForAds(req.body.videoId)
    if (!video) throw notFound('Video not found')

    const check = await adEligibility({
      video,
      userId: req.user?.id,
      userRole: req.user?.role,
    })
    if (!check.eligible) throw badRequest(check.reason)

    const result = await recordImpression({
      video,
      campaignId: req.body.campaignId,
      userId: req.user?.id,
      placement: req.body.placement,
      playId: req.body.playId,
      secondsWatched: req.body.secondsWatched,
      completed: req.body.completed,
    })

    res.status(202).json(result)
  })
)

/** Which campaigns are live right now — used by the admin preview. */
router.get(
  '/campaigns',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings()
    const rows = await many(
      `select id, name, advertiser, cpm_tzs, placements::text[] as placements,
              starts_at, ends_at, duration_seconds
         from ad_campaigns
        where active = true
          and cloudflare_uid is not null
          and (starts_at is null or starts_at <= now())
          and (ends_at   is null or ends_at   >= now())
        order by name`
    )
    res.json({
      campaigns: rows,
      placements: {
        preRoll: settings.preroll_enabled,
        midRoll: settings.midroll_enabled,
        postRoll: settings.postroll_enabled,
      },
    })
  })
)

export default router
