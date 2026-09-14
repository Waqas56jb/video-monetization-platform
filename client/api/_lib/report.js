/**
 * Tell the API who asked us for a link preview — and exactly how.
 *
 * These routes run in the frontend project, which has no database, so the
 * record is posted across to the API.
 *
 * WHAT IS CAPTURED, AND WHY EVERYTHING. Four separate rounds of "sharing from
 * a desktop shows a bare link" were investigated with telemetry that recorded
 * only requests whose User-Agent named a known crawler. A desktop WhatsApp
 * client that fetches the preview from the user's own machine — an Electron
 * shell, a Catalyst app, a browser tab — carries an ordinary browser
 * User-Agent, so it classified as `human` and was thrown away before it was
 * ever written. The one request that could have explained the fault was the
 * one request the log was designed not to keep. So this now records every
 * request shape the two functions see: method, every Sec-Fetch-* header,
 * Accept, Origin, Referer, the client-hints, the client IP and the country
 * and city Vercel resolved it to (a fetch from Dar es Salaam is the user's
 * app; a fetch from Menlo Park is Meta's crawler), which document we chose
 * and the precise rule that chose it, and how long we took.
 *
 * WHEN IT IS SENT. A serverless function is frozen the instant its response
 * ends, and a POST still in flight is killed along with it — measured against
 * production, fire-and-forget lost 30% of document hits and half the poster
 * hits. So the report is started immediately BEFORE `res.end()`, once every
 * fact about the response is known, and awaited immediately after. The
 * crawler waits for nothing: the bytes go out the same tick the POST does.
 */

const CAP_MS = 1500
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)

/**
 * Every request header that could plausibly decide, or explain, which
 * document a preview fetch receives. User-Agent is carried separately (it has
 * its own column). Values are capped so a hostile header cannot bloat a row.
 */
const CAPTURE = [
  'accept',
  'accept-language',
  'accept-encoding',
  'origin',
  'referer',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'upgrade-insecure-requests',
  'purpose',
  'x-purpose',
  'sec-purpose',
  'range',
  'if-none-match',
  'if-modified-since',
  'cache-control',
  'pragma',
  'dnt',
  'via',
  'x-forwarded-proto',
  'x-vercel-ip-country-region',
  'x-vercel-ip-timezone',
  'x-vercel-proxied-for',
  'access-control-request-method',
  'access-control-request-headers',
]

const decode = (v) => {
  try {
    return decodeURIComponent(String(v))
  } catch {
    return String(v)
  }
}

/** The request as it arrived: method, the headers above, and where from. */
export function captureRequest(req) {
  const h = req?.headers || {}
  const headers = {}
  for (const k of CAPTURE) if (h[k] != null) headers[k] = String(h[k]).slice(0, 300)
  const forwarded = String(h['x-forwarded-for'] || '')
  return {
    method: String(req?.method || 'GET').toUpperCase(),
    ip: forwarded.split(',')[0].trim() || null,
    country: h['x-vercel-ip-country'] ? String(h['x-vercel-ip-country']) : null,
    city: h['x-vercel-ip-city'] ? decode(h['x-vercel-ip-city']) : null,
    headers,
  }
}

/**
 * Start the report. Returns the in-flight promise for `settleReport`.
 *
 *   asset     'html' | 'image'
 *   doc       what was served: crawler | shell | fallback | preflight |
 *             cdn | api | 404 | 502 | bad-slug
 *   decision  the rule that chose it (see ogDocument.js `unfurlReason`), with
 *             the share-meta source appended for a document
 */
/**
 * TEMPORARY (2026-09-14): the last thing this promise resolved with, so a
 * request carrying `?__reportdebug=1` can expose it via a response header.
 * Direct POSTs to /api/share/crawl-hit succeed with this exact body shape;
 * /watch/:slug requests stopped producing rows sometime after ~01:05 UTC
 * today with no code change to this file since. Remove once found.
 */
export let __lastReportOutcome = null

export function reportCrawl(api, req, { asset, slug, doc, status, ms, cache, decision }) {
  try {
    const shape = captureRequest(req)
    const p = fetch(`${api}/api/share/crawl-hit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        asset,
        slug: slug || null,
        query: (req.url || '').split('?')[1] || null,
        userAgent: req.headers['user-agent'] || null,
        region: process.env.VERCEL_REGION || null,
        build: BUILD,
        status: status ?? null,
        ms: ms ?? null,
        cache: cache || null,
        doc: doc || null,
        decision: decision || null,
        ...shape,
      }),
      signal: AbortSignal.timeout(CAP_MS),
    })
      .then((r) => {
        __lastReportOutcome = `ok status=${r.status}`
        return r
      })
      .catch((e) => {
        __lastReportOutcome = `fetch-rejected: ${e && e.name}: ${e && e.message}`
      })
    return p
  } catch (e) {
    __lastReportOutcome = `sync-throw: ${e && e.name}: ${e && e.message}`
    // Telemetry is never worth an error on the path it is measuring.
    return Promise.resolve()
  }
}

/** Wait for a started report, but never longer than it is worth. */
export async function settleReport(pending) {
  if (!pending) return
  try {
    await pending
  } catch {
    /* already handled */
  }
}
