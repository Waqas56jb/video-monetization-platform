/**
 * Per-video link previews for /watch/:slug.
 *
 * WhatsApp / Facebook / X do not run JavaScript. They read the HTML we return.
 * Crawlers get a tiny document with only the video's Open Graph tags.
 * Browsers still get the app.
 */

import {
  cardFor,
  canonicalWatchPath,
  crawlerDocument,
  isLinkPreviewBot,
  isPublicSlug,
  isUnfurlFetch,
  notFoundDocument,
  previewCopy,
  slugFrom,
  escapeAttr,
  experimentToken,
  withToken,
} from './_lib/ogDocument.js'
import { startReport, settleReport } from './_lib/report.js'

/**
 * Which commit is actually serving this.
 *
 * Twice now a fault has been chased in code that production was not running:
 * the deploy had not landed and the old build was still answering. Reporting
 * the commit turns that from an hour of confusion into one glance at a header.
 */
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)

const API =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  'https://video-monetization-platform-backend.vercel.app'

const videoMemo = new Map()
const VIDEO_MEMO_MS = 10 * 60 * 1000

function setMeta(html, attr, key, value) {
  if (!value) return html
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(value)}">`
  const existing = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*>`, 'i')
  if (existing.test(html)) return html.replace(existing, tag)
  return html.replace('</head>', `${tag}\n</head>`)
}

async function loadVideo(slug) {
  if (!isPublicSlug(slug)) return null
  const hit = videoMemo.get(slug)
  if (hit && Date.now() - hit.at < VIDEO_MEMO_MS) return hit.video
  const urls = [
    `${API}/api/share/${encodeURIComponent(slug)}`,
    `${API}/api/videos/${encodeURIComponent(slug)}`,
  ]
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) continue
      const body = await r.json()
      const video = body?.video || null
      if (video) {
        videoMemo.set(slug, { video, at: Date.now() })
        return video
      }
    } catch {
      /* try the next source */
    }
  }
  return hit?.video || null
}


export default async function handler(req, res) {
  const started = Date.now()
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const origin = `${proto}://${host}`
  const requested = slugFrom(req)

  /**
   * Started here, deliberately, so it overlaps the video lookup below rather
   * than being tacked on at the end where the function freezes underneath it.
   * Only unfurl fetches are reported; people are the overwhelming majority of
   * this route's traffic and are not what the table is for.
   */
  const pending = isUnfurlFetch(req)
    ? startReport(API, req, { asset: 'html', slug: requested })
    : null

  const video = await loadVideo(requested)
  const publicSlug = video?.slug || requested
  const path = canonicalWatchPath(publicSlug)
  const token = experimentToken(req)
  const canonical = withToken(
    path ? `${origin}${path}` : `${origin}/watch/${requested || ''}`,
    token
  )
  const ua = req.headers['user-agent'] || ''
  const { title, description } = previewCopy(video)
  const image = withToken(cardFor(origin, video, publicSlug), token)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Vary', 'User-Agent')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('X-Build', BUILD)

  if (isUnfurlFetch(req)) {
    const bot = isLinkPreviewBot(ua)
    res.setHeader(
      'Cache-Control',
      bot
        ? 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400'
        : 'private, no-store'
    )
    if (!path || !image) {
      console.log(
        `og-html slug=${requested || 'empty'} status=404 ms=${Date.now() - started} kind=unfurl`
      )
      await settleReport(pending)
      res.status(404)
      return res.end(notFoundDocument())
    }
    console.log(
      `og-html slug=${publicSlug} status=200 ms=${Date.now() - started} kind=${bot ? 'bot' : 'cors'}`
    )
    await settleReport(pending)
    res.status(200)
    return res.end(crawlerDocument({ canonical, title, description, image }))
  }

  res.setHeader('Cache-Control', 'private, no-store, must-revalidate')

  let shell
  try {
    const r = await fetch(`${origin}/index.html`, { headers: { 'x-og-shell': '1' } })
    if (!r.ok) throw new Error(`shell ${r.status}`)
    shell = await r.text()
  } catch {
    res.status(302).setHeader('Location', '/index.html')
    return res.end()
  }

  let html = shell.replace(/<!--[\s\S]*?-->/g, '')
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeAttr(title)} - MTONYO+</title>`
  )
  html = setMeta(html, 'name', 'description', description)
  html = setMeta(html, 'property', 'og:site_name', 'MTONYO+')
  html = setMeta(html, 'property', 'og:type', 'video.other')
  html = setMeta(html, 'property', 'og:title', title)
  html = setMeta(html, 'property', 'og:description', description)
  html = setMeta(html, 'property', 'og:url', canonical)
  html = setMeta(html, 'name', 'twitter:card', 'summary_large_image')
  html = setMeta(html, 'name', 'twitter:title', title)
  html = setMeta(html, 'name', 'twitter:description', description)

  if (image) {
    html = setMeta(html, 'property', 'og:image', image)
    html = setMeta(html, 'property', 'og:image:url', image)
    html = setMeta(html, 'property', 'og:image:secure_url', image)
    html = setMeta(html, 'property', 'og:image:type', 'image/jpeg')
    html = setMeta(html, 'property', 'og:image:width', '1200')
    html = setMeta(html, 'property', 'og:image:height', '630')
    html = setMeta(html, 'property', 'og:image:alt', `${title} - Watch free preview on MTONYO+`)
    html = setMeta(html, 'name', 'twitter:image', image)
  }

  if (!/rel=["']canonical["']/.test(html)) {
    html = html.replace(
      '</head>',
      `<link rel="canonical" href="${escapeAttr(canonical)}">\n</head>`
    )
  }

  html = html.replace(
    /(<meta[^>]*property=["']og:image["'][^>]*content=["'])(\/[^"']*)(["'])/i,
    `$1${origin}$2$3`
  )

  res.status(200)
  return res.end(html)
}
