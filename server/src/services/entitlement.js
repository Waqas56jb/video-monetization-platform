import { one } from '../db/pool.js'

/**
 * What may this viewer actually watch of this video?
 *
 * This is the single place the paywall is decided, so the player, the signed
 * URL endpoint and the share preview all agree.
 */
export async function resolveAccess({ video, userId }) {
  const free = video.access_type === 'free_with_ads'

  let purchase = null
  if (userId) {
    purchase = await one(
      `select id, purchased_at from purchases
        where user_id = $1 and video_id = $2 and status = 'active'`,
      [userId, video.id]
    )
  }

  const owned = Boolean(purchase)
  const isOwner = userId && video.creator_id === userId

  return {
    // full playback is allowed when it's free, already bought, or your own
    canWatchFull: free || owned || Boolean(isOwner),
    owned,
    isOwner: Boolean(isOwner),
    requiresPayment: !free && !owned && !isOwner,
    freePreviewSeconds: free ? null : video.free_preview_seconds,
    priceTzs: free ? 0 : video.price_tzs,
    showsAds: free && video.ads_enabled,
    purchasedAt: purchase?.purchased_at ?? null,
  }
}

/** A public-safe view of a video row. */
export function publicVideo(v, access = null) {
  return {
    id: v.id,
    slug: v.slug,
    title: v.title,
    description: v.description,
    category: v.category,
    thumbnailUrl: v.thumbnail_url,
    durationSeconds: v.duration_seconds,
    accessType: v.access_type,
    priceTzs: v.price_tzs,
    freePreviewSeconds: v.free_preview_seconds,
    premiereDays: v.premiere_days,
    premiereEndsAt: v.premiere_ends_at,
    adsEnabled: v.ads_enabled,
    views: v.views,
    paidUnlocks: v.paid_unlocks,
    publishedAt: v.published_at,
    creator: v.creator_id
      ? { id: v.creator_id, name: v.creator_name ?? null, avatarUrl: v.creator_avatar ?? null }
      : null,
    ...(access ? { access } : {}),
  }
}

/** The creator/admin view, which also carries moderation fields. */
export function studioVideo(v) {
  return {
    ...publicVideo(v),
    reviewStatus: v.review_status,
    rejectionReason: v.rejection_reason,
    submittedAt: v.submitted_at,
    reviewedAt: v.reviewed_at,
    isPublished: v.is_published,
    state: v.state,
    cloudflareUid: v.cloudflare_uid,
    previewUid: v.preview_uid,
    socialClipUid: v.social_clip_uid,
    deletedAt: v.deleted_at,
    createdAt: v.created_at,
  }
}
