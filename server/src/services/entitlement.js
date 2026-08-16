import { one } from '../db/pool.js'
import { mintThumbnailKey } from '../lib/mediaToken.js'
import { signedThumbnailUrl } from '../lib/cloudflare.js'
import { capabilities } from '../config/env.js'

/**
 * What may this viewer actually watch of this video?
 *
 * This is the single place the paywall is decided, so the player, the signed
 * URL endpoint and the share preview all agree.
 */
export async function resolveAccess({ video, userId, userRole = null }) {
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

  /**
   * Staff can watch anything, without paying.
   *
   * Reviewing a video means watching it, and until now the review queue handed
   * an administrator a decision to make about a file they could not open. It
   * is not a loophole in the paywall: staff are the people who decide what is
   * published at all, and every one of their actions is recorded against their
   * name and email.
   */
  const isStaff = userRole === 'admin' || userRole === 'sub_admin'

  return {
    // full playback when it's free, already bought, your own, or you are staff
    canWatchFull: free || owned || Boolean(isOwner) || isStaff,
    owned,
    isOwner: Boolean(isOwner),
    isStaff,
    requiresPayment: !free && !owned && !isOwner && !isStaff,
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
    /**
     * Served through the API rather than linked straight to Cloudflare.
     *
     * These videos require signed URLs, so the raw thumbnail address answers
     * 401 — which is why every poster on the site was a broken image. A signed
     * one works but expires, so it cannot be stored. This path is stable, and
     * the API signs a fresh one on each request.
     *
     * Relative on purpose: the apps live on a different origin and prefix it
     * with their own API base, so one stored value works for both.
     */
    thumbnailUrl: thumbnailFor(v),
    durationSeconds: v.duration_seconds,
    accessType: v.access_type,
    priceTzs: v.price_tzs,
    freePreviewSeconds: v.free_preview_seconds,
    premiereDays: v.premiere_days,
    premiereEndsAt: v.premiere_ends_at,
    adsEnabled: v.ads_enabled,
    /* Editorial, not measured — see migration 010. */
    featured: v.featured ?? false,
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
    /**
      * The studio view is where unpublished videos are seen — the review queue
      * and a creator's own list. Their posters are not public, and an <img>
      * cannot authenticate, so the key rides in the URL.
      */
    thumbnailUrl: thumbnailFor(v),
    reviewStatus: v.review_status,
    rejectionReason: v.rejection_reason,
    submittedAt: v.submitted_at,
    reviewedAt: v.reviewed_at,
    isPublished: v.is_published,
    state: v.state,
    cloudflareUid: v.cloudflare_uid,
    previewUid: v.preview_uid,
    socialClipUid: v.social_clip_uid,
    // So the studio can show "you have set your own cover" and offer to undo it.
    customThumbnailUrl: v.custom_thumbnail_url || null,
    deletedAt: v.deleted_at,
    createdAt: v.created_at,
  }
}

/**
 * Where to fetch a video's poster.
 *
 * Public videos need nothing; anyone may see the picture of something anyone
 * may watch. Anything else carries a signed, expiring key scoped to this one
 * thumbnail — never the playback token, which would hand over the video too.
 */
export function thumbnailFor(v) {
  /**
   * A cover the creator chose beats the frame Cloudflare happened to grab,
   * which is very often a blur or a black gap between shots. Stored separately
   * so removing it falls straight back to the automatic one — nothing is lost
   * by trying.
   */
  if (v.custom_thumbnail_url) return v.custom_thumbnail_url
  if (!v.cloudflare_uid) return v.thumbnail_url

  const path = `/api/playback/${v.id}/thumbnail`
  const isPublic = v.is_published && v.review_status === 'approved' && !v.deleted_at

  /**
   * A public video's poster goes straight to Cloudflare's CDN. Signed here,
   * once, at the moment the list is built.
   *
   * It used to be this API's own path, and the browser then had to ask us for
   * every single card: a serverless invocation whose entire job was to sign a
   * token and answer 302, followed by a fresh connection to Cloudflare to
   * actually get the picture. Measured from a good connection that was 0.68s
   * for the redirect and 0.79s for the image — about 1.5s per card, and the
   * homepage shows eight.
   *
   * Worse, all eight redirects went to one host, and a browser will not open
   * more than about six connections to a host at a time, so they queued. On a
   * phone on mobile data, where every round trip costs four times as much, the
   * grid below the hero sat empty for the better part of ten seconds. That is
   * the delay the client kept reporting, and no amount of turning animations
   * off was ever going to touch it.
   *
   * Signing costs one RSA operation per video. The browser then fetches the
   * image directly from a CDN, in parallel, on connections it already has.
   */
  if (isPublic) {
    if (!capabilities.signedPlayback) return path

    /**
     * Sign against the preview, never the film.
     *
     * This signed `cloudflare_uid` — the full paid asset — and that was a
     * paywall bypass, not a detail. A Cloudflare Stream token authorises a
     * video, not a path: the same token that fetches
     * `/<token>/thumbnails/thumbnail.jpg` also fetches
     * `/<token>/manifest/video.m3u8`. Verified against production before this
     * change — an unauthenticated request for a TZS 5,000 video's poster came
     * back with a token that returned the full HLS master manifest, HTTP 200,
     * valid for 24 hours. Anybody who could see a card could watch the film.
     *
     * The preview is a separate Cloudflare asset that this viewer is entitled
     * to regardless, so a token for it grants nothing they did not already
     * have, and its poster frame is the same picture.
     *
     * A paid video with no preview asset yet — the window between upload and
     * `ensureClips` — falls back to this API's own route rather than reaching
     * for the full asset. That is slower for a handful of cards and cannot
     * leak. Free videos have no paywall to bypass, so their own asset is fine
     * when there is no preview to use.
     */
    const free = v.access_type === 'free_with_ads'
    const posterUid = v.preview_uid || (free ? v.cloudflare_uid : null)
    if (!posterUid) return path

    try {
      /* 400px tall: these are cards, not posters. 720 was four times the size
         any of them is ever displayed at. */
      return signedThumbnailUrl(posterUid, { height: 400 })
    } catch {
      return path // signing unavailable — the redirect still works
    }
  }

  /* Not public: the poster is as private as the video, so it keeps going
     through this API, where the key in the URL is what authorises it. */
  const key = mintThumbnailKey(v.id)
  return key ? `${path}?k=${encodeURIComponent(key)}` : path
}
