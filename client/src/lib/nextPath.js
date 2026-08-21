/**
 * Where to send someone once they have signed in.
 *
 * The destination travels in the URL — `/login?next=/watch/some-video` — rather
 * than only in router state, because router state does not survive the three
 * things that actually happen:
 *
 *   · a full page load (a shared link, a refresh, a restored tab)
 *   · the detour through Sign up and back to Log in
 *   · an already-signed-in visitor being bounced off the login page
 *
 * All three were losing it, which is why a viewer who tapped Unlock on a video
 * ended up on the dashboard wondering where their video went.
 */

/**
 * Only ever return an internal path.
 *
 * `?next=https://elsewhere.example` would otherwise turn our login page into a
 * redirector for anybody who can get a link in front of a user. A leading `//`
 * is the same attack wearing a hat — the browser reads it as protocol-relative.
 */
export function safeNext(value) {
  if (!value || typeof value !== 'string') return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  if (value.includes('://') || value.includes('\\')) return null
  if (/[\s]/.test(value)) return null
  if (value.startsWith('/login') || value.startsWith('/signup')) return null
  if (value.length > 512) return null
  return value
}

/** The destination from the URL, falling back to router state. */
export function nextFrom(location) {
  const fromQuery = new URLSearchParams(location.search || '').get('next')
  return safeNext(fromQuery) || safeNext(location.state?.from) || null
}

/** Build a login (or signup) URL that remembers where the person was going. */
export function authUrl(page, next, extra = {}) {
  const params = new URLSearchParams()
  const target = safeNext(next)
  if (target) params.set('next', target)
  for (const [k, v] of Object.entries(extra)) if (v != null) params.set(k, String(v))
  const qs = params.toString()
  return `/${page}${qs ? `?${qs}` : ''}`
}
