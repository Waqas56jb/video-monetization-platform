import { Router } from 'express'
import { one, query } from '../db/pool.js'
import { asyncHandler, notFound, forbidden } from '../lib/errors.js'
import { optionalAuth } from '../middleware/auth.js'
import { resolveAccess, thumbnailFor } from '../services/entitlement.js'
import { getSettings } from '../services/settings.js'
import * as cf from '../lib/cloudflare.js'
import { verifyThumbnailKey } from '../lib/mediaToken.js'
import { capabilities } from '../config/env.js'

const router = Router()

/** Short-lived by design: a link copied out of devtools dies quickly. */
const FULL_TOKEN_TTL = 60 * 60 // 1 hour
const PREVIEW_TOKEN_TTL = 15 * 60 // 15 minutes

/** Don't resume from the first breath of a video, or from its dying seconds. */
const RESUME_MIN_SECONDS = 8
const RESUME_END_MARGIN = 15

/**
 * Where this viewer should pick up from.
 *
 * Returns 0 rather than a position when resuming would be unhelpful: barely
 * started, or effectively finished — landing someone at 10:48 of a 10:53 film
 * because that is where they stopped is technically correct and useless.
 *
 * For a viewer who has just paid, the stored position is the second the preview
 * cut out, which is exactly the "resume from the paywall position" the client
 * asked for — and because it lives in the database rather than the page, it
 * survives the reload that happens after payment.
 */
async function resumePointFor({ videoId, userId, durationSeconds, capAt = null }) {
  if (!userId) return 0

  const row = await one(
    'select seconds from watch_progress where user_id = $1 and video_id = $2',
    [userId, videoId]
  )
  let seconds = Number(row?.seconds || 0)
  if (seconds < RESUME_MIN_SECONDS) return 0

  const total = Number(durationSeconds || 0)
  if (total > 0 && seconds > total - RESUME_END_MARGIN) return 0

  // A preview must never be told to start beyond its own end.
  if (capAt != null) seconds = Math.min(seconds, Math.max(0, Number(capAt) - 3))
  return seconds < RESUME_MIN_SECONDS ? 0 : Math.floor(seconds)
}

/**
 * The paywall, decided server-side.
 *
 * The free preview and the full video are two SEPARATE Cloudflare assets. If
 * the viewer has not paid, the full video's playback token is never generated
 * and never reaches the browser — so there is nothing to bypass. This is why
 * the paywall cannot be defeated with devtools, unlike a client-side timer.
 */
router.get(
  '/:id/playback',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const video = await one(
      `select * from videos where (id::text = $1 or slug = $1) and deleted_at is null`,
      [req.params.id]
    )
    if (!video) throw notFound('Video not found')

    const isOwnerOrAdmin = req.user && (req.user.id === video.creator_id || req.user.role === 'admin')
    const access = await resolveAccess({ video, userId: req.user?.id, userRole: req.user?.role })

    /**
     * Somebody who paid keeps what they paid for, published or not.
     *
     * The gate admitted the creator and administrators only, so a creator
     * unpublishing a video revoked it from every buyer — the library still
     * listed it and this endpoint answered "Video not found". Entitlement is
     * resolved first now and a held purchase passes.
     *
     * `deleted_at is null` on the row above still applies, so a real takedown
     * still stops everybody.
     */
    if (!(video.is_published && video.review_status === 'approved') && !isOwnerOrAdmin && !access.owned) {
      throw notFound('Video not found')
    }
    const settings = await getSettings()

    const payload = {
      videoId: video.id,
      title: video.title,
      durationSeconds: video.duration_seconds,
      accessType: video.access_type,
      access,
      /* The player's poster. This was the raw Cloudflare address, which needs a
         signature these videos require — so the frame behind the play button
         was blank while the video itself played perfectly. */
      thumbnailUrl: thumbnailFor(video),
      // Ads only ever run on free-with-ads videos.
      preroll:
        access.showsAds && settings.preroll_enabled
          ? { enabled: true, skipAfterSeconds: settings.preroll_skip_after_secs }
          : { enabled: false },
    }

    if (!capabilities.cloudflareStream) {
      return res.json({ ...payload, playback: null, note: 'Cloudflare Stream is not configured yet' })
    }

    if (access.canWatchFull) {
      if (!video.cloudflare_uid) throw notFound('This video has no media attached yet')
      const token = capabilities.signedPlayback
        ? cf.signPlaybackToken(video.cloudflare_uid, { expiresInSeconds: FULL_TOKEN_TTL })
        : video.cloudflare_uid

      const resumeFromSeconds = await resumePointFor({
        videoId: video.id,
        userId: req.user?.id,
        durationSeconds: video.duration_seconds,
      })

      return res.json({
        ...payload,
        playback: {
          kind: 'full',
          expiresInSeconds: FULL_TOKEN_TTL,
          /* Someone who just paid picks up at the second the preview stopped. */
          resumeFromSeconds,
          ...cf.playbackUrls(token),
        },
      })
    }

    // Locked: hand back only the preview asset.
    const previewUid = video.preview_uid || null
    if (!previewUid) {
      return res.json({
        ...payload,
        playback: null,
        note: 'The free preview clip is still being generated',
      })
    }

    const token = capabilities.signedPlayback
      ? cf.signPlaybackToken(previewUid, { expiresInSeconds: PREVIEW_TOKEN_TTL })
      : previewUid

    const resumeFromSeconds = await resumePointFor({
      videoId: video.id,
      userId: req.user?.id,
      durationSeconds: video.free_preview_seconds,
      capAt: video.free_preview_seconds,
    })

    res.json({
      ...payload,
      playback: {
        kind: 'preview',
        expiresInSeconds: PREVIEW_TOKEN_TTL,
        stopsAtSeconds: video.free_preview_seconds,
        resumeFromSeconds,
        ...cf.playbackUrls(token),
      },
      paywall: {
        priceTzs: video.price_tzs,
        heading: 'Want to keep watching?',
        subheading: "You've reached the end of your free preview.",
        terms: 'One-time payment • Stays in your library',
        cta: `UNLOCK & CONTINUE — TZS ${Number(video.price_tzs).toLocaleString()}`,
        methods: ['M-Pesa', 'Airtel Money'],
      },
    })
  })
)

/**
 * Remember where this viewer got to.
 *
 * Deliberately forgiving: it takes whatever position the player reports and
 * never fails the request in a way the page has to handle. Losing a resume point
 * is a small annoyance; an error here interrupting somebody's film is not.
 *
 * It grants nothing. Recording that a viewer reached 5:00 of a video says
 * nothing about whether they may watch 5:01 — that is decided from `purchases`,
 * per user and per video, every time playback is requested.
 */
router.put(
  '/:id/progress',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    if (!req.user) return res.status(202).json({ saved: false, reason: 'not signed in' })

    const seconds = Math.max(0, Math.floor(Number(req.body?.seconds) || 0))
    const video = await one(
      `select id, duration_seconds from videos
        where (id::text = $1 or slug = $1) and deleted_at is null`,
      [req.params.id]
    )
    if (!video) throw notFound('Video not found')

    // Cap at the running time; a player occasionally reports a position slightly
    // past the end, and a stored position beyond the film is meaningless.
    const capped = video.duration_seconds
      ? Math.min(seconds, Number(video.duration_seconds))
      : seconds

    await query(
      `insert into watch_progress (user_id, video_id, seconds, updated_at)
       values ($1,$2,$3, now())
       on conflict (user_id, video_id)
       do update set seconds = excluded.seconds, updated_at = now()`,
      [req.user.id, video.id, capped]
    )

    res.status(202).json({ saved: true, seconds: capped })
  })
)

/**
 * A video's poster image.
 *
 * These videos require signed URLs, so Cloudflare answers 401 to the raw
 * thumbnail address — which is why every poster on the site rendered as a
 * broken image. A signed URL works but expires, so it cannot be stored in the
 * database and handed out later.
 *
 * So the address stored is this route, which never expires, and the signature
 * is minted per request and redirected to. The browser caches the image; the
 * redirect is cheap.
 */
router.get(
  '/:id/thumbnail',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const video = await one(
      `select id, cloudflare_uid, thumbnail_url, creator_id, is_published, review_status, deleted_at
         from videos where id::text = $1 or slug = $1`,
      [req.params.id]
    )
    if (!video) throw notFound('Video not found')

    // An unpublished video's poster is as private as the video itself.
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'sub_admin'
    const isOwner = req.user && req.user.id === video.creator_id
    const isPublic = video.is_published && video.review_status === 'approved' && !video.deleted_at

    // An <img> cannot send an Authorization header, so a signed key in the
    // query string is the only way a browser can prove it may see this poster.
    const hasKey = verifyThumbnailKey(video.id, req.query.k)

    if (!isPublic && !isOwner && !isStaff && !hasKey) throw notFound('Video not found')

    if (!video.cloudflare_uid || !capabilities.cloudflareStream) {
      if (video.thumbnail_url) return res.redirect(302, video.thumbnail_url)
      throw notFound('This video has no thumbnail yet')
    }

    // Short-lived: long enough for the browser to fetch it, not long enough to
    // be worth passing around.
    const token = capabilities.signedPlayback
      ? cf.signPlaybackToken(video.cloudflare_uid, { expiresInSeconds: 3600 })
      : video.cloudflare_uid

    // The signed URL changes every hour, so the redirect itself must not be
    // cached for longer than the token it points at.
    res.set('Cache-Control', 'private, max-age=1800')
    res.redirect(302, cf.playbackUrls(token).thumbnail)
  })
)

/**
 * Cloudflare tells us when a video has finished processing. That is when we
 * learn its real duration and can cut the preview and social clips.
 */
router.post(
  '/webhooks/cloudflare',
  asyncHandler(async (req, res) => {
    const signature = req.headers['webhook-signature']
    if (!cf.verifyWebhookSignature(signature, req.rawBody || JSON.stringify(req.body))) {
      throw forbidden('Invalid webhook signature')
    }

    const body = req.body || {}
    const uid = body.uid
    if (!uid) return res.json({ ok: true, ignored: 'no uid' })

    const video = await one('select * from videos where cloudflare_uid = $1', [uid])
    if (!video) return res.json({ ok: true, ignored: 'unknown video' })

    const state = body.status?.state
    if (state !== 'ready') {
      await query(`update videos set state = $2 where id = $1`, [
        video.id,
        state === 'error' ? 'failed' : 'processing',
      ])
      return res.json({ ok: true, state })
    }

    const duration = Math.floor(body.duration || 0) || null
    const thumbnail = body.thumbnail || null

    await query(
      `update videos set state = 'ready', duration_seconds = coalesce($2, duration_seconds),
                         thumbnail_url = coalesce($3, thumbnail_url)
        where id = $1`,
      [video.id, duration, thumbnail]
    )

    // Generate the two derived assets once the source is ready.
    await ensureClips(video.id).catch(() => {})
    res.json({ ok: true, state: 'ready' })
  })
)

/**
 * Cut the free-preview clip and the 60-second social promo from the source.
 *
 * Cloudflare does the clipping, so there is no FFmpeg worker to run or scale —
 * the "automatic social preview generation" requirement with no extra server.
 */
export async function ensureClips(videoId) {
  const video = await one('select * from videos where id = $1', [videoId])
  if (!video?.cloudflare_uid || !capabilities.cloudflareStream) return null
  if (video.state !== 'ready') return null

  const duration = video.duration_seconds || 0
  const results = {}

  if (!video.preview_uid && duration > 0) {
    const end = Math.min(video.free_preview_seconds || 300, Math.max(1, duration - 1))
    const clip = await cf.createClip({
      uid: video.cloudflare_uid,
      startSeconds: 0,
      endSeconds: end,
      requireSignedURLs: true,
      name: `${video.title} — free preview`,
    })
    results.preview = clip?.uid
    if (clip?.uid) await query('update videos set preview_uid = $2 where id = $1', [video.id, clip.uid])
  }

  if (!video.social_clip_uid && duration > 0) {
    const end = Math.min(60, Math.max(1, duration - 1))
    const clip = await cf.createClip({
      uid: video.cloudflare_uid,
      startSeconds: 0,
      endSeconds: end,
      requireSignedURLs: false, // must be public so social platforms can fetch it
      name: `${video.title} — 60s promo`,
    })
    results.social = clip?.uid
    if (clip?.uid) await query('update videos set social_clip_uid = $2 where id = $1', [video.id, clip.uid])
  }

  return results
}

export default router
