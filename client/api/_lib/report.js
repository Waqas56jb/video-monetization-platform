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
 * WHEN IT IS SENT, AND WHY THIS TOOK THREE TRIES TO GET RIGHT. A Vercel Node
 * function is frozen within a beat of its response finishing, not when the
 * async handler eventually returns — so a fetch merely STARTED before the
 * response, then awaited after, only survives if something else already ran
 * long enough in between to give it a head start. The version before this one
 * tried exactly that (fire early, ride `loadShareMeta`'s own network call for
 * cover) and measured as reliable in one live check — then failed completely
 * on the very next one, because that "cover" evaporates the instant
 * `loadShareMeta`'s in-memory memo is warm, which it very often is on a
 * function instance Vercel has kept alive: no network call, no delay, no
 * cover, same race as fire-and-forget. Relying on an incidental delay
 * elsewhere in the handler is not a mechanism, it is luck.
 *
 * So for the CRAWLER document, and for preflights, this is awaited BEFORE
 * the caller responds, every time, not merely started before and hoped for
 * after. That costs the crawler a real, if small, slice of latency on every
 * request — CAP_MS below bounds the worst case tightly enough that it is
 * not a second `loadShareMeta`-sized wait. Reliability was chosen over
 * shaving that slice off, because the entire point of this file is to be
 * trustworthy evidence about what actually fetched a page — a log that is
 * fast and sometimes wrong is worse than a log that is slightly slower and
 * right.
 *
 * The SHELL — a person's own page load — is the one exception: it is not
 * evidence about crawling, and it is the only response whose latency a
 * person feels, so there the report is started before and settled after,
 * best effort, and the page never waits on it.
 */

const CAP_MS = 700
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
 * Start the report. Returns the promise `settleReport` must be awaited on
 * BEFORE the caller responds — see the file comment above for why "before"
 * rather than "after" is not a stylistic choice here.
 *
 *   asset     'html' | 'image'
 *   doc       what was served: crawler | shell | fallback | preflight |
 *             cdn | api | 404 | 502 | bad-slug
 *   decision  the rule that chose it (see ogDocument.js `unfurlReason`), with
 *             the share-meta source appended for a document
 */
export function reportCrawl(api, req, { asset, slug, doc, status, ms, cache, decision }) {
  try {
    const shape = captureRequest(req)
    return fetch(`${api}/api/share/crawl-hit`, {
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
    }).catch(() => {})
  } catch {
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
