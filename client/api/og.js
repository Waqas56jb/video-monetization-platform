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

/** The commit serving this, so a stale deploy is visible instead of puzzling. */
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)

const API =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  'https://video-monetization-platform-server.vercel.app'

import { startReport, settleReport } from './_lib/report.js'

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


export default async function handler(req, res) {
  const raw = String((req.query && (req.query.slug || req.query.videoId)) || '')
  const slug = raw.replace(/\.jpe?g$/i, '').replace(/^\/og\//, '').replace(/\/$/, '')

  if (!isPublicSlug(slug)) {
    res.status(404)
    return res.end()
  }

  /**
   * The API cannot record this one itself: this handler proxies the image, so
   * by the time the request reaches the API the User-Agent is this proxy's and
   * every poster fetch looked like an ordinary visitor. Whether WhatsApp
   * fetches the card at all, and when relative to the document, is half the
   * question -- so it is reported from here, where the real caller is still
   * visible, and started before the fetch so it costs nothing.
   */
  const pending = startReport(API, req, { asset: 'image', slug })

  const started = Date.now()
  const poster = await fetchPoster(slug)
  if (!poster) {
    console.log(`og-jpeg slug=${slug} status=404 ms=${Date.now() - started}`)
    await settleReport(pending)
    res.status(404)
    return res.end()
  }

  console.log(`og-jpeg slug=${slug} status=200 ms=${Date.now() - started} bytes=${poster.buf.length}`)
  res.setHeader('Content-Type', poster.type)
  res.setHeader('X-Build', BUILD)
  /**
   * Kept, but not for the reason first written here. The original note claimed
   * WhatsApp Web fetched these bytes from inside the browser, and that CORS
   * was therefore the missing piece; that model turned out to be wrong --
   * every WhatsApp client crawls server-side, where CORS does not apply. The
   * header still earns its place for the in-app browser and for anything else
   * that reads the card cross-origin, so it stays with an honest reason.
   */
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
  res.setHeader('Content-Disposition', 'inline; filename="poster.jpg"')
  await settleReport(pending)
  res.status(200)
  return res.end(poster.buf)
}
