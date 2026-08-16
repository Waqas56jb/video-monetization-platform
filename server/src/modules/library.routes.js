import { Router } from 'express'
import { one, many } from '../db/pool.js'
import { asyncHandler, notFound } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { thumbnailFor } from '../services/entitlement.js'
import { env } from '../config/env.js'

const router = Router()

/**
 * "My Library" — everything this account has paid for.
 *
 * Entitlements live in the database against the user id, so they survive
 * logging out, changing phone or clearing the browser. That is the client's
 * "purchase remains unlocked after logout/login" requirement.
 */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `select pu.id as purchase_id, pu.purchased_at, pu.amount_tzs,
              pay.method, pay.provider_ref,
              v.id, v.slug, v.title, v.description, v.category,
              -- Everything thumbnailFor() needs to decide how this poster is
              -- addressed. Selecting only thumbnail_url is what left My Library
              -- showing empty cards: that column holds Cloudflare's raw
              -- address, and these videos require a signed one, so the browser
              -- was asking for something that answers 401.
              -- preview_uid because the poster is signed against the preview
              -- asset, not the film; without it these cards fall back to the
              -- slower redirect route.
              v.thumbnail_url, v.custom_thumbnail_url, v.cloudflare_uid, v.preview_uid,
              v.is_published, v.review_status, v.deleted_at,
              v.duration_seconds, v.access_type, v.price_tzs, v.views,
              coalesce(cp.display_name, p.full_name) as creator_name,
              p.avatar_url as creator_avatar, v.creator_id
         from purchases pu
         join videos v   on v.id = pu.video_id
         join profiles p on p.id = v.creator_id
         left join creator_profiles cp on cp.user_id = v.creator_id
         left join payments pay on pay.id = pu.payment_id
        where pu.user_id = $1 and pu.status = 'active'
        order by pu.purchased_at desc`,
      [req.user.id]
    )

    res.json({
      videos: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        description: r.description,
        category: r.category,
        thumbnailUrl: thumbnailFor(r),
        durationSeconds: r.duration_seconds,
        accessType: r.access_type,
        views: r.views,
        creator: { id: r.creator_id, name: r.creator_name, avatarUrl: r.creator_avatar },
        purchase: {
          id: r.purchase_id,
          purchasedAt: r.purchased_at,
          amountTzs: r.amount_tzs,
          method: r.method,
          reference: r.provider_ref,
        },
        watchUrl: `${env.publicWebUrl}/watch/${r.slug || r.id}`,
      })),
    })
  })
)

/** Purchase receipts, for the "My Purchases" screen. */
router.get(
  '/purchases',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `select pu.*, v.title as video_title, v.slug,
              coalesce(cp.display_name, p.full_name) as creator_name,
              pay.method, pay.status as payment_status
         from purchases pu
         join videos v on v.id = pu.video_id
         join profiles p on p.id = v.creator_id
         left join creator_profiles cp on cp.user_id = v.creator_id
         left join payments pay on pay.id = pu.payment_id
        where pu.user_id = $1
        order by pu.purchased_at desc`,
      [req.user.id]
    )

    const stats = await one(
      `select count(*)::int as owned,
              coalesce(sum(amount_tzs),0)::int as spent
         from purchases where user_id = $1 and status = 'active'`,
      [req.user.id]
    )

    res.json({
      stats: { videosOwned: stats.owned, totalSpentTzs: stats.spent },
      purchases: rows.map((r) => ({
        id: r.id,
        videoId: r.video_id,
        videoTitle: r.video_title,
        videoSlug: r.slug,
        creatorName: r.creator_name,
        amountTzs: r.amount_tzs,
        method: r.method,
        status: r.status,
        purchasedAt: r.purchased_at,
      })),
    })
  })
)

/** Does this account own a specific video? Used by the player on load. */
router.get(
  '/entitlement/:videoId',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const video = await one('select id, access_type from videos where id = $1 and deleted_at is null', [
      req.params.videoId,
    ])
    if (!video) throw notFound('Video not found')

    const purchase = await one(
      `select id, purchased_at from purchases
        where user_id = $1 and video_id = $2 and status = 'active'`,
      [req.user.id, video.id]
    )

    res.json({
      videoId: video.id,
      owned: Boolean(purchase),
      free: video.access_type === 'free_with_ads',
      purchasedAt: purchase?.purchased_at ?? null,
    })
  })
)

export default router
