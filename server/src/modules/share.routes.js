import { Router } from 'express'
import { one } from '../db/pool.js'
import { asyncHandler, notFound } from '../lib/errors.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { ensureClips } from './playback.routes.js'
import { thumbnailFor } from '../services/entitlement.js'
import * as cf from '../lib/cloudflare.js'
import { env, capabilities } from '../config/env.js'

import { slugFallbacks } from '../lib/videoKey.js'
import { brandShareCard } from '../lib/shareCard.js'

const router = Router()

async function videoByKey(key) {
  const keys = slugFallbacks(key)
  return one(
    `select v.*, coalesce(cp.display_name, p.full_name) as creator_name
       from videos v
       join profiles p on p.id = v.creator_id
       left join creator_profiles cp on cp.user_id = v.creator_id
      where v.deleted_at is null
        and (v.id::text = $1 or v.slug = any($2::text[]))`,
    [key, keys]
  )
}

/**
 * Everything a creator needs to promote one video.
 *
 * The client's model: "Video → Share Preview → 60-second promotional video +
 * thumbnail/title + MTONYO+ link → viewer taps → lands directly on that
 * video's watch/purchase page."
 *
 * Each network allows something different, so we return the best available
 * method for each and let the app pick:
 *   - WhatsApp: the watch URL. Open Graph on that page is what draws the card
 *     (poster, title, creator). Do not attach the clip file — WhatsApp then
 *     sends a raw video instead of fetching the preview.
 *   - Instagram / TikTok: the OS share sheet; neither has a public web API.
 *   - Facebook / X: a link-share URL, which reads the page's Open Graph tags.
 */
router.get(
  '/:id',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const video = await videoByKey(req.params.id)
    if (!video) throw notFound('Video not found')

    const isOwner = req.user && (req.user.id === video.creator_id || req.user.role === 'admin')
    if (!(video.is_published && video.review_status === 'approved') && !isOwner) {
      throw notFound('Video not found')
    }

    // The deep link: opens this exact video's watch & purchase page.
    const pathKey = video.slug || video.id
    const deepLink = `${env.publicWebUrl}/watch/${pathKey}`
    const title = video.title
    const text = video.creator_name
      ? `${title} by ${video.creator_name}. Watch the free preview on MTONYO+.`
      : `Watch the free preview of "${title}" on MTONYO+.`
    const cardUrl = `/api/share/${encodeURIComponent(pathKey)}/card.jpg`

    // The 60s promo clip, public so Instagram / TikTok can be handed a file.
    // WhatsApp still gets the watch URL only — attaching this MP4 there
    // replaces the Open Graph card with a raw video.
    let clip = null
    if (video.social_clip_uid && capabilities.cloudflareStream) {
      const urls = cf.playbackUrls(video.social_clip_uid)
      const mp4 = await cf.ensureMp4Download(video.social_clip_uid).catch(() => null)
      clip = {
        uid: video.social_clip_uid,
        downloadUrl: mp4?.url || `https://videodelivery.net/${video.social_clip_uid}/downloads/default.mp4`,
        downloadReady: mp4?.status === 'ready',
        hls: urls.hls,
        thumbnailUrl: urls.thumbnail,
        durationSeconds: Math.min(60, video.duration_seconds || 60),
      }
    }

    // URL alone. Extra caption text makes WhatsApp send a paragraph plus a
    // tiny webpage icon instead of fetching the Open Graph poster card.
    const encoded = encodeURIComponent(deepLink)

    res.json({
      // `creator` and `description` are here for the link-preview renderer
      // (client/api/watch.js), which builds the Open Graph card a shared link
      // produces. The name was already being read for `text` below and simply
      // never returned, so preview cards could not say whose video it was.
      video: {
        id: video.id,
        slug: video.slug,
        title,
        description: video.description || null,
        creator: video.creator_name ? { name: video.creator_name } : null,
        thumbnailUrl: thumbnailFor(video),
      },
      cardUrl,
      deepLink,
      title,
      text,
      clip,
      targets: {
        // Best on mobile: the OS sheet lists WhatsApp, Instagram and TikTok.
        native: {
          method: 'web-share',
          supportsFiles: Boolean(clip?.downloadUrl),
          payload: { url: deepLink },
          note: 'Share the URL only so WhatsApp/Facebook/X fetch the Open Graph card',
        },
        whatsapp: { method: 'url', url: `https://wa.me/?text=${encoded}` },
        facebook: {
          method: 'url',
          url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(deepLink)}`,
        },
        x: { method: 'url', url: `https://twitter.com/intent/tweet?url=${encoded}` },
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
        'og:description': video.creator_name
          ? `WATCH FREE PREVIEW · ${video.creator_name} · MTONYO+`
          : 'WATCH FREE PREVIEW · MTONYO+',
        'og:image': cardUrl,
        'og:url': deepLink,
        'og:type': 'website',
      },
    })
  })
)

/**
 * A short, public poster URL for WhatsApp / Facebook / X.
 *
 * Link previews fail when `og:image` is a Cloudflare signed token — those
 * JWTs are hundreds of characters, WhatsApp truncates them, and the card
 * renders as a bare URL. This path stays short, returns a real JPEG, and
 * signs Cloudflare on the server so the crawler never has to.
 *
 * `.jpg` on the path matters: WhatsApp often ignores an image URL that
 * looks like an API route.
 */
async function fetchPosterBytes(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const img = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) })
      if (!img.ok) continue
      const type = (img.headers.get('content-type') || '').split(';')[0]
      if (!/^image\//i.test(type) && type !== 'application/octet-stream') continue
      const buf = Buffer.from(await img.arrayBuffer())
      if (buf.length < 1000) continue
      return buf
    } catch {
      /* try again */
    }
  }
  return null
}

async function sendShareCard(req, res) {
  const video = await videoByKey(String(req.params.id || '').replace(/\.jpe?g$/i, ''))
  if (!video) throw notFound('Video not found')
  if (!(video.is_published && video.review_status === 'approved')) {
    throw notFound('Video not found')
  }

  let poster = null
  if (video.custom_thumbnail_url && /^https?:\/\//i.test(video.custom_thumbnail_url)) {
    poster = await fetchPosterBytes(video.custom_thumbnail_url)
  }
  if (!poster) {
    const posterUid = video.preview_uid || video.cloudflare_uid
    if (posterUid && capabilities.signedPlayback) {
      const token = cf.signPlaybackToken(posterUid, { expiresInSeconds: 3600 })
      const src = `https://videodelivery.net/${token}/thumbnails/thumbnail.jpg?time=15s&width=1200&height=630&fit=crop`
      poster = await fetchPosterBytes(src)
    }
  }
  if (!poster && video.thumbnail_url && /^https?:\/\//i.test(video.thumbnail_url)) {
    poster = await fetchPosterBytes(video.thumbnail_url)
  }
  if (!poster) throw notFound('No poster available')

  const card = await brandShareCard(poster, {
    title: video.title,
    creator: video.creator_name,
  })

  res.set('Content-Type', 'image/jpeg')
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=604800')
  res.set('Content-Disposition', 'inline; filename="poster.jpg"')
  res.send(card)
}

router.get('/:id/card.jpg', asyncHandler(sendShareCard))
router.get('/:id/card', asyncHandler(sendShareCard))

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
