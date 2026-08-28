/**
 * /og/card/:slug.jpg — same-origin JPEG for WhatsApp / Facebook.
 *
 * og:image must look like a file on the watch origin, not `/api/share-card`.
 * Bytes come from the public CDN when the card was uploaded at publish time,
 * otherwise from the API cache (already a JPEG, never Sharp on this path).
 */

import { apiOrigin } from './_lib/apiOrigin.js'

const API = apiOrigin()
const SUPABASE =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://azkytxxvmcvsqmnbtfkh.supabase.co'

function sendJpeg(res, buf, extra = {}) {
  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Content-Length', String(buf.length))
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  for (const [k, v] of Object.entries(extra)) if (v) res.setHeader(k, v)
  res.status(200).end(buf)
}

async function fetchJpeg(url, ms) {
  const upstream = await fetch(url, { signal: AbortSignal.timeout(ms) })
  if (!upstream.ok) return null
  const type = (upstream.headers.get('content-type') || '').split(';')[0]
  if (type && !/^image\/jpeg/i.test(type) && type !== 'application/octet-stream') return null
  const buf = Buffer.from(await upstream.arrayBuffer())
  return buf.length > 1000 ? buf : null
}

export default async function handler(req, res) {
  const raw = String((req.query && (req.query.slug || req.query.videoId)) || '')
  const slug = raw.replace(/\.jpe?g$/i, '').replace(/^\/og\//, '').replace(/\/$/, '')
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    res.status(404).end()
    return
  }

  const cdn = `${String(SUPABASE).replace(/\/$/, '')}/storage/v1/object/public/share-cards/${encodeURIComponent(slug)}.jpg`
  try {
    const fromCdn = await fetchJpeg(cdn, 2000)
    if (fromCdn) {
      sendJpeg(res, fromCdn, { 'X-Share-Card': 'cdn' })
      return
    }
  } catch {
    /* bucket missing or empty — fall through to API cache */
  }

  const query = String(req.url || '').includes('?') ? `?${String(req.url).split('?')[1]}` : ''
  const target = `${API}/api/share-card/${encodeURIComponent(slug)}.jpg${query}`
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(8000) })
    if (!upstream.ok) {
      res.status(upstream.status).end()
      return
    }
    const buf = Buffer.from(await upstream.arrayBuffer())
    if (buf.length < 1000) {
      res.status(502).end()
      return
    }
    const tag = upstream.headers.get('x-share-card')
    sendJpeg(res, buf, { 'X-Share-Card': tag || 'api' })
  } catch {
    res.status(502).end()
  }
}
