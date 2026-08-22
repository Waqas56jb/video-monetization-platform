/**
 * Same-origin JPEG for WhatsApp / Facebook / X.
 *
 * WhatsApp drops `og:image` when it is a tokenised Cloudflare URL, when it
 * lives on another host, or when the path has no `.jpg`. This route sits on
 * the public site as `/og/card/<slug>.jpg`, fetches the API poster, and
 * returns the bytes so the crawler never has to leave this origin.
 *
 * The API burns title, creator, WATCH FREE PREVIEW and MTONYO+ onto a
 * 1200×630 JPEG. Keep that file small — WhatsApp drops a slow/huge PNG
 * and shows a tiny webpage icon instead.
 */

const API =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  'https://video-monetization-platform-backend.vercel.app'

const posterMemo = new Map()
const POSTER_MEMO_MS = 24 * 60 * 60 * 1000

function isPublicSlug(slug) {
  const s = String(slug || '').trim()
  if (!s) return false
  if (s === 'undefined' || s === 'null') return false
  if (s.length > 200) return false
  return true
}

async function fetchPoster(slug) {
  const hit = posterMemo.get(slug)
  if (hit && Date.now() - hit.at < POSTER_MEMO_MS) return hit.poster

  const urls = [
    `${API}/api/share/${encodeURIComponent(slug)}/card.jpg`,
    `${API}/api/share/${encodeURIComponent(slug)}/card`,
  ]
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(12000) })
        if (!r.ok) continue
        const type = (r.headers.get('content-type') || '').split(';')[0]
        if (!/^image\/(jpeg|jpg|webp)/i.test(type) && type !== 'application/octet-stream') continue
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length < 1000) continue
        const poster = { buf, type: type.startsWith('image/') ? type : 'image/jpeg' }
        posterMemo.set(slug, { poster, at: Date.now() })
        return poster
      } catch {
        /* retry */
      }
    }
  }
  return hit?.poster || null
}


/**
 * Report who fetched the poster.
 *
 * The API cannot tell: this function proxies the image, so by the time the
 * request reaches the API the User-Agent is this proxy's, not WhatsApp's, and
 * every poster fetch was being classified as an ordinary visitor and dropped.
 * Whether WhatsApp actually fetched the image, and when relative to the HTML,
 * is half the question being investigated — so it is reported from here,
 * where the real User-Agent still exists.
 *
 * Fire and forget: the crawler is answered first and never waits on this.
 */
function reportImageCrawl(req, { slug, status, ms, cache }) {
  try {
    fetch(`${API}/api/share/crawl-hit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        asset: 'image',
        slug,
        query: (req.url || '').split('?')[1] || null,
        userAgent: req.headers['user-agent'] || null,
        status,
        ms,
        cache,
        region: process.env.VERCEL_REGION || null,
      }),
      signal: AbortSignal.timeout(2000),
    }).catch(() => {})
  } catch {
    /* telemetry is never worth an error */
  }
}

export default async function handler(req, res) {
  const raw = String((req.query && (req.query.slug || req.query.videoId)) || '')
  const slug = raw.replace(/\.jpe?g$/i, '').replace(/^\/og\//, '').replace(/\/$/, '')

  if (!isPublicSlug(slug)) {
    res.status(404)
    return res.end()
  }

  const started = Date.now()
  const poster = await fetchPoster(slug)
  if (!poster) {
    console.log(`og-jpeg slug=${slug} status=404 ms=${Date.now() - started}`)
    res.status(404)
    return res.end()
  }

  console.log(`og-jpeg slug=${slug} status=200 ms=${Date.now() - started} bytes=${poster.buf.length}`)
  res.setHeader('Content-Type', poster.type)
  /**
   * WhatsApp Web reads these bytes from inside the browser to build its
   * thumbnail, so the fetch is cross-origin and is refused without this. It
   * is why a laptop share showed the title and description but no picture,
   * while the same link from a phone showed the whole card.
   */
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
  res.setHeader('Content-Disposition', 'inline; filename="poster.jpg"')
  reportImageCrawl(req, {
    slug,
    status: 200,
    ms: Date.now() - started,
    cache: res.getHeader('X-OG-Cache') || null,
  })
  res.status(200)
  return res.end(poster.buf)
}
