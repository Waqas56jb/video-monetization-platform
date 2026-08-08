import { Router } from 'express'
import { one } from '../db/pool.js'
import { asyncHandler, notFound } from '../lib/errors.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { ensureClips } from './playback.routes.js'
import * as cf from '../lib/cloudflare.js'
import { env, capabilities } from '../config/env.js'

const router = Router()

/**
 * Everything a creator needs to promote one video.
 *
 * The client's model: "Video → Share Preview → 60-second promotional video +
 * thumbnail/title + MTONYO+ link → viewer taps → lands directly on that
 * video's watch/purchase page."
 *
 * Each network allows something different, so we return the best available
 * method for each and let the app pick:
 *   - WhatsApp / Instagram / TikTok: the OS share sheet, ideally carrying the
 *     actual clip file (Web Share Level 2). Only the device can post to
 *     Instagram and TikTok — neither has a public web publishing API.
 *   - Facebook / X: a link-share URL, which reads the page's Open Graph tags.
 */
router.get(
  '/:id',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const video = await one(
      `select v.*, coalesce(cp.display_name, p.full_name) as creator_name
         from videos v
         join profiles p on p.id = v.creator_id
         left join creator_profiles cp on cp.user_id = v.creator_id
        where (v.id::text = $1 or v.slug = $1) and v.deleted_at is null`,
      [req.params.id]
    )
    if (!video) throw notFound('Video not found')

    const isOwner = req.user && (req.user.id === video.creator_id || req.user.role === 'admin')
    if (!(video.is_published && video.review_status === 'approved') && !isOwner) {
      throw notFound('Video not found')
    }

    // The deep link: opens this exact video's watch & purchase page.
    const deepLink = `${env.publicWebUrl}/watch/${video.slug || video.id}`
    const title = video.title
    const text = `Watch "${title}" by ${video.creator_name} on MTONYO+`

    // The 60s promo clip, public so social platforms can fetch it.
    let clip = null
    if (video.social_clip_uid && capabilities.cloudflareStream) {
      const urls = cf.playbackUrls(video.social_clip_uid)
      clip = {
        uid: video.social_clip_uid,
        // A real MP4 the app can download and hand to the share sheet as a file
        downloadUrl: `https://videodelivery.net/${video.social_clip_uid}/downloads/default.mp4`,
        hls: urls.hls,
        thumbnailUrl: urls.thumbnail,
        durationSeconds: Math.min(60, video.duration_seconds || 60),
      }
    }

    const encoded = encodeURIComponent(`${text} ${deepLink}`)

    res.json({
      video: { id: video.id, slug: video.slug, title, thumbnailUrl: video.thumbnail_url },
      deepLink,
      title,
      text,
      clip,
      targets: {
        // Best on mobile: the OS sheet lists WhatsApp, Instagram and TikTok.
        native: {
          method: 'web-share',
          supportsFiles: Boolean(clip?.downloadUrl),
          payload: { title, text, url: deepLink },
          note: 'Use navigator.share; attach the clip file when the browser supports files',
        },
        whatsapp: { method: 'url', url: `https://wa.me/?text=${encoded}` },
        facebook: {
          method: 'url',
          url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(deepLink)}`,
        },
        x: { method: 'url', url: `https://twitter.com/intent/tweet?text=${encoded}` },
        instagram: {
          method: 'native-only',
          note: 'Instagram has no web publishing API — share the clip through the OS sheet',
        },
        tiktok: {
          method: 'native-only',
          note: 'TikTok has no web publishing API — share the clip through the OS sheet',
        },
        copy: { method: 'clipboard', value: deepLink },
      },
      // Consumed by the app (or an edge function) to render link previews.
      openGraph: {
        'og:title': title,
        'og:description': video.description?.slice(0, 200) || text,
        'og:image': video.thumbnail_url || clip?.thumbnailUrl || '',
        'og:url': deepLink,
        'og:type': 'video.other',
        ...(clip ? { 'og:video': clip.downloadUrl, 'og:video:type': 'video/mp4' } : {}),
      },
    })
  })
)

/** Force the preview and promo clips to be generated (or regenerated). */
router.post(
  '/:id/generate',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.creator_id !== req.user.id && req.user.role !== 'admin') {
      throw notFound('Video not found')
    }

    const result = await ensureClips(video.id)
    const fresh = await one('select preview_uid, social_clip_uid, state from videos where id = $1', [
      video.id,
    ])

    res.json({
      generated: result,
      previewUid: fresh.preview_uid,
      socialClipUid: fresh.social_clip_uid,
      state: fresh.state,
      message: result
        ? 'Clips are being generated — they appear within a minute'
        : 'Nothing to generate yet (the video is still processing)',
    })
  })
)

export default router
