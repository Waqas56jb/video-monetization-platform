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
  try {
    const r = await fetch(`${API}/api/share/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    })
    if (!r.ok) return null
    const body = await r.json()
    return body?.video || null
  } catch {
    return null
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

  if (isLinkPreviewBot(ua)) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60')
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
