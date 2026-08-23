import { Router } from 'express'
import { one, many } from '../db/pool.js'
import { asyncHandler, notFound } from '../lib/errors.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { ensureClips } from './playback.routes.js'
import { thumbnailFor } from '../services/entitlement.js'
import * as cf from '../lib/cloudflare.js'
import { env, capabilities } from '../config/env.js'

import { slugFallbacks } from '../lib/videoKey.js'
import { publicWatchUrl } from '../lib/publicWatchUrl.js'
import { shareSourceKey, shareCardUrl } from '../lib/shareMeta.js'
import { handleShareCard } from '../lib/shareCardServe.js'
import { buildShareCard, rebuildShareCards } from '../lib/buildShareCard.js'
import { log } from '../lib/logger.js'

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

    if (!video.slug) throw notFound('Video not found')

    const deepLink = publicWatchUrl(env.publicWebUrl, video.slug)
    if (!deepLink) throw notFound('Video not found')
    const title = video.title
    const text = video.creator_name
      ? `${title} by ${video.creator_name}. Watch the free preview on MTONYO+.`
      : `Watch the free preview of "${title}" on MTONYO+.`
    const sourceKey = shareSourceKey(video)
    const cardUrl = shareCardUrl(video.slug, sourceKey)

    // The 60s promo clip, public so Instagram / TikTok can be handed a file.
    // WhatsApp still gets the watch URL only — attaching this MP4 there
    // replaces the Open Graph card with a raw video.
    let clip = null
    if (video.social_clip_uid && capabilities.cloudflareStream) {
      const urls = cf.playbackUrls(video.social_clip_uid)
      const mp4 = await cf.ensureMp4Download(video.social_clip_uid).catch(() => null)
      clip = {
        uid: video.social_clip_uid,
        /**
         * Served through this API rather than straight off Cloudflare.
         *
         * The direct download answers a 302 to a signed address, and a browser
         * runs its cross-origin check against that redirect, which carries no
         * allow-origin header. So `fetch` fails before it ever follows it, and
         * the share sheet had no file to hand over. Measured in Chrome:
         * "Access to fetch ... has been blocked by CORS policy", net::ERR_FAILED.
         *
         * The absolute Cloudflare address is still published as
         * `directDownloadUrl` for anything that wants to download rather than
         * read it.
         */
        downloadUrl: `/api/share/${encodeURIComponent(video.slug)}/clip.mp4`,
        directDownloadUrl: mp4?.url || `https://videodelivery.net/${video.social_clip_uid}/downloads/default.mp4`,
        downloadReady: mp4?.status === 'ready',
        hls: urls.hls,
        thumbnailUrl: urls.thumbnail,
        durationSeconds: Math.min(60, video.duration_seconds || 60),
      }
    }

    // URL alone. Extra caption text makes WhatsApp send a paragraph plus a
    // tiny webpage icon instead of fetching the Open Graph poster card.
    const encoded = encodeURIComponent(deepLink)

    // Card must already exist at publish time; self-heal only via share-meta.
    if (!video.social_clip_uid) ensureClips(video.id).catch(() => {})

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
        sourceKey,
      },
      cardUrl,
      sourceKey,
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
        'og:type': 'video.other',
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

/** @deprecated use buildShareCard from ../lib/buildShareCard.js */
export async function warmShareCardById(id) {
  const result = await buildShareCard(id)
  return result.ok ? result : null
}

/** Awaited build with a 15s ceiling for admin approve/publish. */
export async function warmShareCardSoon(id) {
  try {
    await Promise.race([
      buildShareCard(id),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ])
  } catch (err) {
    log.error(`warmShareCardSoon id=${id}:`, err.message)
  }
}

export async function warmAllShareCards() {
  const { scanned, results } = await rebuildShareCards({ all: true, concurrency: 3 })
  const stored = results.filter((r) => r.status === 'built').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed').length
  log.info(`og-card warm-all stored=${stored} skipped=${skipped} failed=${failed} scanned=${scanned}`)
  return { scanned, stored, skipped, failed }
}

export async function warmMissingShareCards({ limit = 6 } = {}) {
  const { results } = await rebuildShareCards({ stale: true, concurrency: 3 })
  const limited = limit ? results.slice(0, limit) : results
  const stored = limited.filter((r) => r.status === 'built').length
  const failed = limited.filter((r) => r.status === 'failed').length
  return { scanned: limited.length, stored, failed }
}

async function legacyShareCard(req, res) {
  req.params = { slug: String(req.params.id || '').replace(/\.jpe?g$/i, '') }
  return handleShareCard(req, res)
}

router.get('/:id/card.jpg', asyncHandler(legacyShareCard))
router.get('/:id/card', asyncHandler(legacyShareCard))
router.head('/:id/card.jpg', asyncHandler(legacyShareCard))
router.head('/:id/card', asyncHandler(legacyShareCard))

router.post(
  '/warm-missing',
  requireAuth(),
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') throw notFound('Video not found')
    const result = await warmAllShareCards()
    res.json({ ok: true, ...result })
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

/**
 * The 60-second promo clip, from this origin.
 *
 * Instagram and TikTok take a video, not a link, and the only way to hand
 * them one from a web page is `navigator.share` with a File — which means the
 * page has to be able to read the bytes. Cloudflare's own download address
 * redirects, and the browser's cross-origin check is applied to the redirect,
 * which carries no allow-origin header, so reading it from the page is
 * impossible however long you wait.
 *
 * This streams the same file back under our own origin, where CORS is already
 * configured, so the fetch succeeds and the share sheet has something real to
 * pass to the app.
 */
router.get(
  '/:id/clip.mp4',
  asyncHandler(async (req, res) => {
    const keys = slugFallbacks(req.params.id)
    const video = await one(
      `select slug, social_clip_uid, is_published, review_status
         from videos
        where (id::text = any($1) or slug = any($1)) and deleted_at is null`,
      [keys]
    )
    if (!video?.social_clip_uid) throw notFound('No clip for this video')
    if (!(video.is_published && video.review_status === 'approved')) {
      throw notFound('No clip for this video')
    }

    const mp4 = await cf.ensureMp4Download(video.social_clip_uid).catch(() => null)
    const source =
      mp4?.url || `https://videodelivery.net/${video.social_clip_uid}/downloads/default.mp4`

    const upstream = await fetch(source, { redirect: 'follow' })
    if (!upstream.ok || !upstream.body) throw notFound('The clip is still being prepared')

    const filename = `${video.slug || 'promo'}-promo.mp4`
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    const len = upstream.headers.get('content-length')
    if (len) res.setHeader('Content-Length', len)

    const reader = upstream.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
  })
)

/**
 * The Open Graph document is served by a function in the frontend project,
 * which has no database connection, so it reports its crawler hits here.
 *
 * Deliberately unauthenticated: it is called by our own edge function on
 * every preview crawl, and adding a secret would mean putting one in the
 * frontend's environment for no protection worth having. Nothing here is
 * read back into the product — it is a log staff can query — and every field
 * is length-capped and the asset type is constrained, so the worst a stranger
 * can do is add rows to a table nobody makes decisions from without looking.
 */
router.post(
  '/crawl-hit',
  asyncHandler(async (req, res) => {
    const b = req.body || {}
    recordCrawlerHit({
      // The caller says which half of the chain it is; the poster is reported
      // by the frontend's image proxy, where the real User-Agent still exists.
      asset: b.asset === 'image' ? 'image' : 'html',
      slug: b.slug,
      queryString: b.query,
      userAgent: b.userAgent,
      status: b.status,
      ms: b.ms,
      cache: b.cache,
      region: b.region,
    })
    // Answer immediately; the caller must never wait on telemetry.
    res.status(202).end()
  })
)

export default router
