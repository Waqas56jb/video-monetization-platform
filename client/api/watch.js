/**
 * Per-video link previews for /watch/:slug.
 *
 * The site advertises "Auto Social Previews", and until now that claim was not
 * true. This is a Vite single-page app: every route is served the same static
 * `index.html`, and the per-video `document.title` in Watch.jsx is written by
 * React after the bundle has run. WhatsApp, Facebook and X do not run the
 * bundle. They read the HTML they are handed, so every shared video produced
 * the same generic card — platform title, platform description, and an
 * `og:image` of `/icons/icon-512.png` that was a root-relative path where the
 * Open Graph spec requires an absolute URL, so the card had no picture either.
 *
 * The fix is to serve the same shell with the right tags already in it. This
 * function takes the deployed `index.html`, asks the API what the video is, and
 * rewrites the handful of meta tags that a preview card reads. Nothing about
 * the app changes — the same bundle boots on the same markup.
 *
 * Both crawlers and people get the identical response, so there is no cloaking
 * to go stale or get penalised. The cost of the extra hop is paid once per
 * video: the response is cacheable at the edge by URL, and the URL already
 * contains the slug.
 */

const API =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  'https://video-monetization-platform-backend.vercel.app'

const escapeAttr = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Replace a meta tag's content, or add the tag when the shell does not carry
 * one. Matching on the whole tag rather than just the value keeps this working
 * if the attribute order in index.html ever changes.
 */
function setMeta(html, attr, key, value) {
  if (!value) return html
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(value)}">`
  const existing = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*>`, 'i')
  if (existing.test(html)) return html.replace(existing, tag)
  return html.replace('</head>', `${tag}\n</head>`)
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const origin = `${proto}://${host}`

  const slug =
    (req.query && (req.query.slug || req.query.videoId)) ||
    String(req.url || '')
      .split('?')[0]
      .replace(/^\/watch\//, '')
      .replace(/\/$/, '')

  let shell
  try {
    const r = await fetch(`${origin}/index.html`, { headers: { 'x-og-shell': '1' } })
    if (!r.ok) throw new Error(`shell ${r.status}`)
    shell = await r.text()
  } catch {
    res.status(302).setHeader('Location', '/index.html')
    return res.end()
  }

  let video = null
  let cardUrl = null
  if (slug) {
    try {
      const r = await fetch(`${API}/api/share/${encodeURIComponent(slug)}`)
      if (r.ok) {
        const body = await r.json()
        video = body?.video || null
        const slugKey = video?.slug || slug
        cardUrl = `${origin}/og/${encodeURIComponent(slugKey)}.png`
      }
    } catch {
      /* Preview is a nicety; the page still boots. */
    }
  }

  let html = shell
  const canonical = `${origin}/watch/${slug}`

  if (video) {
    const creator = video.creator?.name || video.creatorName
    const title = video.title
    const ogTitle = title
    const description = creator
      ? `Watch the free preview · ${creator} · MTONYO+`
      : 'Watch the free preview on MTONYO+'

    html = html.replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${escapeAttr(title)} — MTONYO+</title>`
    )
    html = setMeta(html, 'name', 'description', description)
    html = setMeta(html, 'property', 'og:site_name', 'MTONYO+')
    html = setMeta(html, 'property', 'og:type', 'website')
    html = setMeta(html, 'property', 'og:title', ogTitle)
    html = setMeta(html, 'property', 'og:description', description)
    html = setMeta(html, 'property', 'og:url', canonical)
    if (!/rel=["']canonical["']/.test(html)) {
      html = html.replace(
        '</head>',
        `<link rel="canonical" href="${escapeAttr(canonical)}">\n</head>`
      )
    }
    html = setMeta(html, 'name', 'twitter:card', 'summary_large_image')
    html = setMeta(html, 'name', 'twitter:title', ogTitle)
    html = setMeta(html, 'name', 'twitter:description', description)

    if (cardUrl) {
      html = setMeta(html, 'property', 'og:image', cardUrl)
      html = setMeta(html, 'property', 'og:image:url', cardUrl)
      html = setMeta(html, 'property', 'og:image:secure_url', cardUrl)
      html = setMeta(html, 'property', 'og:image:type', 'image/png')
      html = setMeta(html, 'property', 'og:image:width', '1200')
      html = setMeta(html, 'property', 'og:image:height', '630')
      html = setMeta(html, 'property', 'og:image:alt', `${title} — Watch free preview on MTONYO+`)
      html = setMeta(html, 'itemprop', 'image', cardUrl)
      html = setMeta(html, 'name', 'twitter:image', cardUrl)
      if (!/rel=["']image_src["']/.test(html)) {
        html = html.replace('</head>', `<link rel="image_src" href="${escapeAttr(cardUrl)}">\n</head>`)
      }
    }
  } else {
    html = setMeta(html, 'property', 'og:url', canonical)
    html = setMeta(html, 'property', 'og:type', 'website')
  }

  html = html.replace(
    /(<meta[^>]*property=["']og:image["'][^>]*content=["'])(\/[^"']*)(["'])/i,
    `$1${origin}$2$3`
  )

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=86400')
  res.status(200)
  return res.end(html)
}
