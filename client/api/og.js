/**
 * Same-origin JPEG for WhatsApp / Facebook / X.
 *
 * WhatsApp drops `og:image` when it is a tokenised Cloudflare URL, when it
 * lives on another host, or when the path has no `.jpg`. This route sits on
 * the public site as `/og/<slug>.jpg`, fetches the API poster, and returns
 * the bytes so the crawler never has to leave this origin.
 */

const API =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  'https://video-monetization-platform-backend.vercel.app'

export default async function handler(req, res) {
  const raw = String((req.query && (req.query.slug || req.query.videoId)) || '')
  const slug = raw.replace(/\.jpe?g$/i, '').replace(/^\/og\//, '').replace(/\/$/, '')

  const fail = async () => {
    try {
      const host = req.headers['x-forwarded-host'] || req.headers.host
      const proto = req.headers['x-forwarded-proto'] || 'https'
      const icon = await fetch(`${proto}://${host}/icons/icon-512.png`)
      if (icon.ok) {
        const buf = Buffer.from(await icon.arrayBuffer())
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'public, max-age=300')
        res.status(200)
        return res.end(buf)
      }
    } catch {
      /* fall through */
    }
    res.status(404)
    return res.end()
  }

  if (!slug) return fail()

  try {
    const r = await fetch(`${API}/api/share/${encodeURIComponent(slug)}/card.jpg`)
    if (!r.ok) {
      const fallback = await fetch(`${API}/api/share/${encodeURIComponent(slug)}/card`)
      if (!fallback.ok) return fail()
      const type = fallback.headers.get('content-type') || 'image/jpeg'
      const buf = Buffer.from(await fallback.arrayBuffer())
      if (!buf.length) return fail()
      res.setHeader('Content-Type', type.startsWith('image/') ? type : 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
      res.status(200)
      return res.end(buf)
    }
    const type = r.headers.get('content-type') || 'image/jpeg'
    const buf = Buffer.from(await r.arrayBuffer())
    if (!buf.length) return fail()
    res.setHeader('Content-Type', type.startsWith('image/') ? type : 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
    res.status(200)
    return res.end(buf)
  } catch {
    return fail()
  }
}
