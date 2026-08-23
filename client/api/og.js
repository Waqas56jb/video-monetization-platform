/**
 * Legacy /og/card/:slug.jpg — proxy bytes from the API share-card endpoint.
 */

const API =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  'https://video-monetization-platform-server.vercel.app'

export default async function handler(req, res) {
  const raw = String((req.query && (req.query.slug || req.query.videoId)) || '')
  const slug = raw.replace(/\.jpe?g$/i, '').replace(/^\/og\//, '').replace(/\/$/, '')
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    res.status(404).end()
    return
  }
  const query = String(req.url || '').includes('?') ? `?${String(req.url).split('?')[1]}` : ''
  const target = `${API}/api/share-card/${encodeURIComponent(slug)}.jpg${query}`

  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(12000) })
    if (!upstream.ok) {
      res.status(upstream.status).end()
      return
    }
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Content-Length', String(buf.length))
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400')
    res.setHeader('Access-Control-Allow-Origin', '*')
    const tag = upstream.headers.get('x-share-card')
    if (tag) res.setHeader('X-Share-Card', tag)
    res.status(200).end(buf)
  } catch {
    res.status(502).end()
  }
}
