/**
 * /og/card/:slug.jpg — same-origin JPEG for WhatsApp / Facebook.
 *
 * og:image must look like a file on the watch origin, not `/api/share-card`.
 * Bytes come from the public CDN when the card was uploaded at publish time,
 * otherwise from the API cache (already a JPEG, never Sharp on this path).
 */

import { apiOrigin } from './_lib/apiOrigin.js'
import { SHARE_CARD_BUCKET, readCardPath } from './_lib/shareCardObjectPath.js'

/**
 * How long the bucket leg is trusted after it starts refusing.
 *
 * This path tries the public Supabase object first and falls back to the API's
 * own cache. That is the right order when the bucket has the file — but when it
 * does not, the miss is not cheap and it is not rare: measured against
 * production at 1.43s for an HTTP 400, on every single card fetch, because
 * SUPABASE_SERVICE_ROLE_KEY was unset so nothing had ever been uploaded. The
 * fallback then served the card correctly in 0.57s, which is why nobody noticed
 * a fault — only slowness, and only on the WhatsApp poster path where 2.5s is
 * the difference between a card and a bare link.
 *
 * The failure is per-deployment rather than per-slug (no key means no object for
 * anything), so a per-slug memo would still pay it once for every slug. This
 * trips on the second consecutive refusal and re-probes after ten minutes, so
 * the leg costs ~2 requests per instance while it is broken and switches itself
 * back on within ten minutes of the key landing — no redeploy needed.
 */
const BUCKET_TIMEOUT_MS = 2000
const BUCKET_TRIP_AFTER = 2
const BUCKET_REPROBE_MS = 10 * 60 * 1000
const bucket = { failures: 0, openUntil: 0 }

const bucketWorthTrying = () => Date.now() >= bucket.openUntil

function noteBucket(ok) {
  if (ok) {
    bucket.failures = 0
    bucket.openUntil = 0
    return
  }
  bucket.failures += 1
  if (bucket.failures >= BUCKET_TRIP_AFTER) {
    bucket.openUntil = Date.now() + BUCKET_REPROBE_MS
    bucket.failures = 0
  }
}

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

  /**
   * Ask for the exact card, not the convenient one.
   *
   * og:image is emitted as `/og/card/{slug}.jpg?v={sourceKey}`, so this handler
   * is told precisely which card the page is claiming. It used to ignore that
   * and read `{slug}.jpg`, which Supabase serves with an hour of cache: after a
   * poster or title change the versioned URL busts every cache downstream and
   * then landed on a stale object anyway, showing the old card for up to an
   * hour. `{slug}-{sourceKey}.jpg` is immutable and cannot be stale — and it is
   * already written on every upload, so this costs nothing.
   */
  const sourceKey = String((req.query && req.query.v) || '')
  const object = readCardPath(slug, sourceKey)
  const cdn = `${String(SUPABASE).replace(/\/$/, '')}/storage/v1/object/public/${SHARE_CARD_BUCKET}/${encodeURIComponent(object)}`
  let bucketState = 'skipped'
  if (bucketWorthTrying()) {
    try {
      const fromCdn = await fetchJpeg(cdn, BUCKET_TIMEOUT_MS)
      if (fromCdn) {
        noteBucket(true)
        sendJpeg(res, fromCdn, { 'X-Share-Card': 'cdn', 'X-Bucket': 'hit' })
        return
      }
      /* A non-2xx returns null rather than throwing, so this is the missing
         object / missing bucket case as well as the wrong-content-type one. */
      noteBucket(false)
      bucketState = 'miss'
    } catch {
      /* Unreachable or timed out. Same conclusion, same fallback. */
      noteBucket(false)
      bucketState = 'error'
    }
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
    /* X-Bucket says why the fast leg did not serve this — 'skipped' means the
       breaker is open, which is how you tell "no key yet" from "key landed but
       this slug is not uploaded". */
    sendJpeg(res, buf, { 'X-Share-Card': tag || 'api', 'X-Bucket': bucketState })
  } catch {
    res.status(502).end()
  }
}
