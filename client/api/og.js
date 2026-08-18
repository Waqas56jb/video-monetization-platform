/**
 * Same-origin JPEG for WhatsApp / Facebook / X.
 *
 * WhatsApp drops `og:image` when it is a tokenised Cloudflare URL, when it
 * lives on another host, or when the path has no `.jpg`. This route sits on
 * the public site as `/og/<slug>.jpg`, fetches the API poster, and returns
 * the bytes so the crawler never has to leave this origin.
 *
 * Do not fall back to the 512×512 app icon. WhatsApp treats that square as a
 * tiny webpage thumbnail, and a slow/huge PNG (branded card) times out on
 * copy-paste so the preview never appears at all. A 1200×630 JPEG under 100KB
 * is what actually produces the large poster card.
 */

const API =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  'https://video-monetization-platform-backend.vercel.app'

async function fetchPoster(slug) {
  const urls = [
    `${API}/api/share/${encodeURIComponent(slug)}/card.jpg`,
    `${API}/api/share/${encodeURIComponent(slug)}/card`,
  ]
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!r.ok) continue
        const type = (r.headers.get('content-type') || '').split(';')[0]
        if (!/^image\/(jpeg|jpg|webp)/i.test(type) && type !== 'application/octet-stream') continue
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length < 1000) continue
        return { buf, type: type.startsWith('image/') ? type : 'image/jpeg' }
      } catch {
        /* retry */
      }
    }
  }
  return null
}

export default async function handler(req, res) {
  const raw = String((req.query && (req.query.slug || req.query.videoId)) || '')
  const slug = raw.replace(/\.jpe?g$/i, '').replace(/^\/og\//, '').replace(/\/$/, '')

  if (!slug) {
    res.status(404)
    return res.end()
  }

  const poster = await fetchPoster(slug)
  if (!poster) {
    res.status(404)
    return res.end()
  }

  res.setHeader('Content-Type', poster.type)
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
  res.setHeader('Content-Disposition', 'inline; filename="poster.jpg"')
  res.status(200)
  return res.end(poster.buf)
}
