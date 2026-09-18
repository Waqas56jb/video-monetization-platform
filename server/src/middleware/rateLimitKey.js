import { userFromToken } from '../lib/supabase.js'

/**
 * Which bucket a request draws from.
 *
 * A signed-in person is rate-limited as THEMSELVES; everyone else as their
 * address. Measured reason (2026-09-18, report2.txt SEP 18): once the limiter
 * saw real addresses again, a 20-minute walk of the site from this machine
 * still hit 429 — the walk itself made 14 requests in that minute, and the
 * other ~106 came from other activity on the same public IP. A per-address
 * bucket is shared by everyone behind one router: an office of testers, a
 * family on one Wi-Fi, a phone hot-spotting a laptop. Keying signed-in
 * traffic by the person gives each of them their own 120 a minute wherever
 * they sit, and leaves the address bucket to anonymous visitors.
 *
 * Only a VERIFIED token buys a personal bucket — the same local signature
 * check the auth middleware does — so a forged or expired token falls back to
 * the address it came from and cannot mint fresh buckets. The result is
 * memoised per token for a minute: one verification a minute per token, valid
 * or not, and the map is capped so a flood of junk tokens cannot grow it.
 */
const bearer = (req) => {
  const h = req.headers?.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

export function createRateLimitKey({ verify, ttlMs = 60_000, max = 5000, now = Date.now } = {}) {
  if (typeof verify !== 'function') throw new TypeError('createRateLimitKey needs a verify(token) function')
  /**
   * token -> { userId | null, until }. The VERDICT is memoised, never an
   * address: a token that failed to verify must be billed to whichever
   * address presents it NOW, not the first one it was seen from — otherwise
   * one junk token replayed from many places would funnel them all into one
   * bucket, and a phone that changed networks would carry its old address's
   * bucket around for a minute. (Caught by the unit test before it shipped.)
   */
  const memo = new Map()

  const remember = (token, userId, until) => {
    if (memo.size >= max) memo.delete(memo.keys().next().value) // oldest first
    memo.set(token, { userId, until })
  }

  return async function rateLimitKey(req) {
    const ipKey = `ip:${req.ip}`
    const token = bearer(req)
    if (!token) return ipKey

    const t = now()
    const hit = memo.get(token)
    if (hit && hit.until > t) return hit.userId ? `user:${hit.userId}` : ipKey

    let userId = null
    try {
      const user = await verify(token)
      if (user?.id) userId = String(user.id)
    } catch {
      /* not a token we issued, or no longer valid — the address pays */
    }
    remember(token, userId, t + ttlMs)
    return userId ? `user:${userId}` : ipKey
  }
}

/** The production key: the same verifier the auth middleware trusts. */
export const rateLimitKey = createRateLimitKey({ verify: userFromToken })
