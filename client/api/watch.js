/**
 * Per-video link previews for /watch/:slug.
 *
 * WhatsApp / Facebook / X do not run JavaScript. They read the HTML we return.
 * The SPA shell is noisy (comments that mention og:image, default platform
 * tags, fonts). WhatsApp Desktop then often gives up and shows only the domain.
 *
 * Crawlers get a tiny document with only the video's Open Graph tags — same
 * title, description and poster a person would see. Browsers still get the app.
 */

const API =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  'https://video-monetization-platform-backend.vercel.app'

const PREVIEW_BOT =
  /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|Googlebot|bingbot|Applebot/i

const videoMemo = new Map()
const VIDEO_MEMO_MS = 10 * 60 * 1000

/**
 * Only the link-preview *bot* should get the tiny OG document.
 *
 * WhatsApp's in-app browser (the person who tapped the card) still has
 * "WhatsApp" in its User-Agent, plus Mozilla/AppleWebKit. Treating that as a
 * crawler is why tapping the share opened a blank page of title + description
 * instead of Watch.
 */
function isLinkPreviewBot(ua) {
  if (!PREVIEW_BOT.test(ua || '')) return false
  if (/Mozilla\//i.test(ua) && /AppleWebKit|Chrome|CriOS|Firefox|Safari|Mobile/i.test(ua)) {
    return false
  }
  return true
}

/**
 * WhatsApp Web / Desktop paste does not send a WhatsApp User-Agent. It is a
 * CORS fetch from Chrome. That used to receive the full SPA shell, which is
 * slow and noisy, so the laptop preview timed out into a bare URL.
 *
 * A real person opening Watch is a navigation (document + navigate). Leave
 * that on the SPA. Everything else that asks for this URL wants the card.
 */
function isUnfurlFetch(req) {
  const ua = req.headers['user-agent'] || ''
  if (isLinkPreviewBot(ua)) return true
  const dest = String(req.headers['sec-fetch-dest'] || '')
  const mode = String(req.headers['sec-fetch-mode'] || '')
  if (dest === 'document' || mode === 'navigate') return false
  if (mode === 'cors' || dest === 'empty') return true
  return false
}

const escapeAttr = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function setMeta(html, attr, key, value) {
  if (!value) return html
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(value)}">`
  const existing = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*>`, 'i')
  if (existing.test(html)) return html.replace(existing, tag)
  return html.replace('</head>', `${tag}\n</head>`)
}

function slugFrom(req) {
  const q = req.query || {}
  if (q.slug || q.videoId) return q.slug || q.videoId
  return String(req.url || '')
    .split('?')[0]
    .replace(/^\/s\//, '')
    .replace(/^\/watch\//, '')
    .replace(/\/$/, '')
}

function publicPath(req, slug) {
  const share = String((req.query && req.query.share) || '') === '1'
  return `${share ? '/s' : '/watch'}/${slug}`
}

async function loadVideo(slug) {
  if (!slug) return null
  const hit = videoMemo.get(slug)
  if (hit && Date.now() - hit.at < VIDEO_MEMO_MS) return hit.video
  try {
    const r = await fetch(`${API}/api/share/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const body = await r.json()
    const video = body?.video || null
    if (video) videoMemo.set(slug, { video, at: Date.now() })
    return video
  } catch {
    return hit?.video || null
  }
}

function cardFor(origin, video, slug) {
  const key = video?.slug || (video ? slug : null)
  return key ? `${origin}/og/card/${encodeURIComponent(key)}.jpg` : null
}

function previewCopy(video) {
  const title = video?.title || 'MTONYO+'
  const creator = video?.creator?.name || video?.creatorName
  const description = creator
    ? `WATCH FREE PREVIEW · ${creator} · MTONYO+`
    : 'WATCH FREE PREVIEW · MTONYO+'
  return { title, description }
}

function crawlerDocument({ origin, canonical, title, description, image }) {
  const img = image
    ? `<meta property="og:image" content="${escapeAttr(image)}">
<meta property="og:image:url" content="${escapeAttr(image)}">
<meta property="og:image:secure_url" content="${escapeAttr(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeAttr(`${title} - Watch free preview on MTONYO+`)}">
<meta name="twitter:image" content="${escapeAttr(image)}">
<link rel="image_src" href="${escapeAttr(image)}">`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeAttr(title)} - MTONYO+</title>
<meta name="description" content="${escapeAttr(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MTONYO+">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${escapeAttr(canonical)}">
${img}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${escapeAttr(description)}">
<link rel="canonical" href="${escapeAttr(canonical)}">
</head>
<body>
<h1>${escapeAttr(title)}</h1>
<p>${escapeAttr(description)}</p>
<p><a href="${escapeAttr(canonical)}">Watch the free preview on MTONYO+</a></p>
</body>
</html>`
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const origin = `${proto}://${host}`
  const slug = slugFrom(req)
  const canonical = `${origin}${publicPath(req, slug)}`
  const ua = req.headers['user-agent'] || ''
  const video = await loadVideo(slug)
  const { title, description } = previewCopy(video)
  const image = cardFor(origin, video, slug)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Vary', 'User-Agent')

  /**
   * Readable from another origin, whichever document this turns out to be.
   *
   * This header used to sit inside the bot branch below, which looked right
   * and was not. WhatsApp Web builds its preview inside the browser, and that
   * fetch carries the browser's own User-Agent — Chrome, not WhatsApp — so it
   * never took the bot branch and never saw the header. The browser refused
   * the response and the preview came out as a bare domain, while the same
   * link from a phone was fine because the phone app fetches server-side,
   * where cross-origin rules do not apply at all.
   *
   * Proved by fetching this URL from a page on a different origin: the card
   * image came back 200 and the document came back "Failed to fetch".
   *
   * Nothing here is private in either branch. The bot document is a title, a
   * line of description and a poster; the other is the public application
   * shell that anyone can request directly.
   */
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (isUnfurlFetch(req)) {
    /**
     * And give it something to read without waiting.
     *
     * Bots (WhatsApp app, Facebook) may be cached at the edge. Chrome CORS
     * fetches from WhatsApp Web are not — Vercel does not reliably Vary on
     * Sec-Fetch, and caching the tiny document under /watch/:slug would
     * serve it to real viewers. The JPEG is what was slow; that is cached.
     */
    const bot = isLinkPreviewBot(ua)
    res.setHeader(
      'Cache-Control',
      bot
        ? 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400'
        : 'private, no-store'
    )
    res.status(200)
    return res.end(
      crawlerDocument({ origin, canonical, title, description, image })
    )
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

  // Comments in the shell mention og:image; some preview parsers trip on that.
  let html = shell.replace(/<!--[\s\S]*?-->/g, '')
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeAttr(title)} - MTONYO+</title>`
  )
  html = setMeta(html, 'name', 'description', description)
  html = setMeta(html, 'property', 'og:site_name', 'MTONYO+')
  html = setMeta(html, 'property', 'og:type', 'website')
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
