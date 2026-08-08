import { Router } from 'express'
import { one, query } from '../db/pool.js'
import { asyncHandler, notFound, forbidden } from '../lib/errors.js'
import { optionalAuth } from '../middleware/auth.js'
import { resolveAccess } from '../services/entitlement.js'
import { getSettings } from '../services/settings.js'
import * as cf from '../lib/cloudflare.js'
import { capabilities } from '../config/env.js'

const router = Router()

/** Short-lived by design: a link copied out of devtools dies quickly. */
const FULL_TOKEN_TTL = 60 * 60 // 1 hour
const PREVIEW_TOKEN_TTL = 15 * 60 // 15 minutes

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
    if (!(video.is_published && video.review_status === 'approved') && !isOwnerOrAdmin) {
      throw notFound('Video not found')
    }

    const access = await resolveAccess({ video, userId: req.user?.id })
    const settings = await getSettings()

    const payload = {
      videoId: video.id,
      title: video.title,
      durationSeconds: video.duration_seconds,
      accessType: video.access_type,
      access,
      thumbnailUrl: video.thumbnail_url,
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
      return res.json({
        ...payload,
        playback: {
          kind: 'full',
          expiresInSeconds: FULL_TOKEN_TTL,
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

    res.json({
      ...payload,
      playback: {
        kind: 'preview',
        expiresInSeconds: PREVIEW_TOKEN_TTL,
        stopsAtSeconds: video.free_preview_seconds,
        ...cf.playbackUrls(token),
      },
      paywall: {
        priceTzs: video.price_tzs,
        heading: 'Want to keep watching?',
        subheading: "You've reached the end of your free preview.",
        terms: 'One-time payment • Yours forever',
        cta: `UNLOCK & CONTINUE — TZS ${Number(video.price_tzs).toLocaleString()}`,
        methods: ['M-Pesa', 'Airtel Money'],
      },
    })
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
