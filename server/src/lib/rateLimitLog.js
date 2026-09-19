import { query } from '../db/pool.js'
import { log } from './logger.js'
import { rateLimitKey } from '../middleware/rateLimitKey.js'

/**
 * What the rate limiter refused, and why — written down.
 *
 * 2026-09-19: the client kept seeing "Too many requests" after two fixes that
 * were each proven from this side. Their traffic could only be reasoned
 * about, because Railway's request log is not reachable from here. This is
 * the log that matters: for every refused request, the bucket it was billed
 * to (`user:<id>` or `ip:<address>`), the raw forwarding chain it arrived
 * with, and what it asked for. Read back through
 * GET /api/admin/rate-limit-hits. It was this kind of record that would have
 * named the progress storm on day one instead of day three.
 *
 * Fire-and-forget, at most one row per bucket per second: a storm of a
 * thousand refusals costs a handful of rows, never a write storm of its own.
 * The response is exactly what express-rate-limit would have sent.
 */
const THROTTLE_MS = 1000
const MAX_TRACKED_BUCKETS = 2000

export function createRateLimitExceededHandler({ keyFor = rateLimitKey, write = query, now = Date.now, throttleMs = THROTTLE_MS } = {}) {
  const lastWrite = new Map() // bucket -> ms of the last row written

  return async function rateLimitExceeded(req, res, _next, options) {
    let bucket = `ip:${req.ip}`
    try {
      bucket = await keyFor(req)
    } catch {
      /* the address is the honest fallback */
    }

    const t = now()
    if (t - (lastWrite.get(bucket) || 0) >= throttleMs) {
      lastWrite.set(bucket, t)
      if (lastWrite.size > MAX_TRACKED_BUCKETS) lastWrite.delete(lastWrite.keys().next().value)

      const forwardedFor = String(req.headers['x-forwarded-for'] || '')
      const hops = forwardedFor.split(',').filter(Boolean).length
      const retryAfter = Number.parseInt(res.getHeader('Retry-After'), 10)
      Promise.resolve(
        write(
          `insert into rate_limit_hits
             (bucket, ip, forwarded_for, hops, method, path, user_id, user_agent, retry_after_s)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            bucket,
            req.ip || null,
            forwardedFor || null,
            hops,
            req.method,
            String(req.originalUrl || req.url || '').split('?')[0].slice(0, 300),
            bucket.startsWith('user:') ? bucket.slice(5) : null,
            String(req.headers['user-agent'] || '').slice(0, 400),
            Number.isFinite(retryAfter) ? retryAfter : null,
          ]
        )
      ).catch((err) => log.error(`rate_limit_hits insert failed: ${err.message}`))
    }

    res.status(options?.statusCode || 429).json(options?.message)
  }
}

export const rateLimitExceeded = createRateLimitExceededHandler()
