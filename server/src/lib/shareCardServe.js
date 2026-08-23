import { one } from '../db/pool.js'
import { recordCrawlerHit } from './crawlerLog.js'
import { getFallbackShareCard } from './shareCardFallback.js'
import { SLUG_RE } from './shareMeta.js'

const building = new Set()

function asBuffer(value) {
  if (!value) return null
  return Buffer.isBuffer(value) ? value : Buffer.from(value)
}

function sendJpeg(res, buf, { built, sourceKey, isHead }) {
  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Content-Length', String(buf.length))
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Accept-Ranges', 'none')
  res.setHeader('X-Share-Card', built ? 'built' : 'fallback')
  if (sourceKey) res.setHeader('ETag', `"${sourceKey}"`)
  if (built) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  }
  res.status(200)
  if (isHead) return res.end()
  return res.end(buf)
}

function parseSlug(raw) {
  const slug = String(raw || '')
    .replace(/\.jpe?g$/i, '')
    .trim()
  return SLUG_RE.test(slug) ? slug : null
}

function queueBuild(slug) {
  if (building.has(slug)) return
  building.add(slug)
  import('../modules/share.routes.js')
    .then((m) => m.warmShareCardById(slug))
    .catch(() => {})
    .finally(() => building.delete(slug))
}

/** Hot path: DB read only. Never await Sharp here. */
export async function handleShareCard(req, res) {
  const slug = parseSlug(req.params.slug)
  const started = Date.now()
  const isHead = req.method === 'HEAD'

  if (!slug) {
    res.status(404).end()
    return
  }

  if (slug === 'fallback') {
    const fallback = await getFallbackShareCard()
    sendJpeg(res, fallback, { built: false, isHead })
    return
  }

  let row = null
  try {
    row = await one('select jpeg, source_key from share_card_cache where slug = $1', [slug])
  } catch {
    /* table may not exist on a fresh deploy */
  }

  const jpeg = asBuffer(row?.jpeg)
  if (jpeg && jpeg.length > 1000) {
    sendJpeg(res, jpeg, { built: true, sourceKey: row.source_key, isHead })
    recordCrawlerHit({
      asset: 'image',
      slug,
      queryString: req.originalUrl.split('?')[1] || null,
      userAgent: req.get('user-agent'),
      status: 200,
      ms: Date.now() - started,
      cache: 'hit',
      region: process.env.VERCEL_REGION || null,
    })
    return
  }

  queueBuild(slug)
  const fallback = await getFallbackShareCard()
  sendJpeg(res, fallback, { built: false, isHead })
  recordCrawlerHit({
    asset: 'image',
    slug,
    queryString: req.originalUrl.split('?')[1] || null,
    userAgent: req.get('user-agent'),
    status: 200,
    ms: Date.now() - started,
    cache: 'fallback',
    region: process.env.VERCEL_REGION || null,
  })
}
