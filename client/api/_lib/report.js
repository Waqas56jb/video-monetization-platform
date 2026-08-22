/**
 * Tell the API who asked us for a link preview.
 *
 * These two routes run in the frontend project, which has no database, so the
 * record is posted across to the API.
 *
 * It used to be sent fire-and-forget, which looked free and was not: a
 * serverless function is frozen the instant its response ends, and a POST
 * still in flight is killed along with it. Measured against production, that
 * lost 30% of document hits and half of the poster hits -- so a missing row
 * meant nothing at all, which is the one thing a measurement must never mean.
 *
 * So it is started early, before the work the handler was going to do anyway,
 * and awaited at the end. By then it has almost always finished, and the
 * crawler waits for nothing. What it costs is `ms` and `status`: they are not
 * known that early. That is a fair trade -- our own response times are already
 * measured and not in question, whereas who crawled us, and when, could not be
 * established any other way.
 */

const CAP_MS = 1500

export function startReport(api, req, { asset, slug }) {
  try {
    return fetch(`${api}/api/share/crawl-hit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        asset,
        slug,
        query: (req.url || '').split('?')[1] || null,
        userAgent: req.headers['user-agent'] || null,
        region: process.env.VERCEL_REGION || null,
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
