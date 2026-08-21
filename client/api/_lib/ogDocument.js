/**
 * Open Graph HTML for WhatsApp / Facebook / X.
 * Kept out of the Vercel handler so it can be unit-tested.
 */

export const PREVIEW_BOT =
  /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|Googlebot|bingbot|Applebot/i

export function isPublicSlug(slug) {
  const s = String(slug || '').trim()
  if (!s) return false
  if (s === 'undefined' || s === 'null') return false
  if (s.length > 200) return false
  return true
}

export function isLinkPreviewBot(ua) {
  if (!PREVIEW_BOT.test(ua || '')) return false
  if (/Mozilla\//i.test(ua) && /AppleWebKit|Chrome|CriOS|Firefox|Safari|Mobile/i.test(ua)) {
    return false
  }
  return true
}

export function isUnfurlFetch(req) {
  const ua = req.headers['user-agent'] || ''
  if (isLinkPreviewBot(ua)) return true
  const dest = String(req.headers['sec-fetch-dest'] || '')
  const mode = String(req.headers['sec-fetch-mode'] || '')
  if (dest === 'document' || mode === 'navigate') return false
  if (mode === 'cors' || dest === 'empty') return true
  return false
}

export const escapeAttr = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function slugFrom(req) {
  const q = req.query || {}
  const raw = q.slug || q.videoId || ''
  if (raw) {
    return String(raw)
      .split('?')[0]
      .replace(/\/$/, '')
  }
  return String(req.url || '')
    .split('?')[0]
    .replace(/^\/s\//, '')
    .replace(/^\/watch\//, '')
    .replace(/\/$/, '')
}

/** Always /watch/{slug} — never /s/, never a UUID fallback in og:url. */
export function canonicalWatchPath(slug) {
  if (!isPublicSlug(slug)) return null
  return `/watch/${slug}`
}

export function cardFor(origin, video, slug) {
  const key = video?.slug || (isPublicSlug(slug) ? slug : null)
  if (!isPublicSlug(key)) return null
  return `${origin}/og/card/${encodeURIComponent(key)}.jpg`
}

export function previewCopy(video) {
  const title = video?.title || 'MTONYO+'
  const creator = video?.creator?.name || video?.creatorName
  const description = creator
    ? `WATCH FREE PREVIEW · ${creator} · MTONYO+`
    : 'WATCH FREE PREVIEW · MTONYO+'
  return { title, description }
}

export function crawlerDocument({ canonical, title, description, image }) {
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
<meta property="og:type" content="video.other">
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

export function notFoundDocument() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Not found - MTONYO+</title>
<meta name="robots" content="noindex">
</head>
<body>
<h1>Not found</h1>
</body>
</html>`
}
