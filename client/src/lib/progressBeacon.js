/**
 * Send a resume position from a page that is going away.
 *
 * `fetch` and XHR are cancelled when a document unloads. So the `pagehide`
 * handler that flushed the position through the normal API client was, on a
 * phone, usually writing nothing at all: the tab closed, the request went with
 * it, and the viewer came back to a position up to ten seconds stale — or, if
 * they had been watching for less than ten seconds, to nothing. That is the
 * write path the whole Continue Watching row rests on, so it is worth getting
 * right before the row is built on top of it.
 *
 * `navigator.sendBeacon` is the one transport the platform promises to deliver
 * after the page is gone. It is fire-and-forget: no response, and no headers.
 *
 * NO HEADERS IS THE CONSTRAINT, AND IT DECIDES THE SHAPE OF THIS.
 * A beacon cannot carry `Authorization`. Adding one would make the request need
 * a CORS preflight, which sendBeacon also cannot do — the browser drops it
 * without a word. So the token travels in the body, over the same TLS, and is
 * checked by the same `optionalAuth` on the server. The alternative, a cookie
 * session, is a much larger change to how this API authenticates, for one route.
 *
 * `keepalive: true` on fetch does the same job and does carry headers, but
 * Safari did not support it until 16.4 — and Safari is the reason this exists.
 * So: beacon first, keepalive fetch as the fallback.
 */

/**
 * What to send, decided without touching the browser, so it can be tested.
 *
 * Returns `null` when there is nothing worth sending: no video, no token, or a
 * position inside the first second — which is the difference between "they
 * watched none of it" and "they watched the first second", and not worth a row.
 */
export function progressBeaconRequest(apiBase, videoId, seconds, token) {
  if (!videoId || !token) return null
  const s = Math.floor(Number(seconds) || 0)
  if (s < 1) return null
  return {
    url: `${apiBase}/api/playback/${encodeURIComponent(videoId)}/progress`,
    body: JSON.stringify({ seconds: s, token }),
    /**
     * `text/plain`, not `application/json`.
     *
     * A beacon with a JSON content type is not a "simple request", so the
     * browser wants to preflight it — and sendBeacon cannot preflight, so the
     * whole thing is dropped silently. `text/plain` keeps it simple; the server
     * parses the body itself.
     */
    contentType: 'text/plain;charset=UTF-8',
  }
}

/**
 * The base URL and the token are passed IN rather than imported.
 *
 * `api.js` cannot be loaded by the test runner — its own imports are
 * extensionless, which Vite resolves and Node does not — so a module that
 * imports it cannot be tested at all. Everything here is decided from its
 * arguments, which is why the cases below are covered by real assertions
 * instead of by reading the source.
 */
export function beaconProgress(options = {}) {
  const { apiBase, token, videoId, seconds } = options
  /* `in`, not `??`: a test that passes `nav: null` is describing a browser that
     has no sendBeacon, and `??` would helpfully substitute the real one — so the
     "neither transport available" case would quietly test the opposite. */
  const navigatorRef = 'nav' in options ? options.nav : typeof navigator === 'undefined' ? null : navigator
  const sendRef = 'send' in options ? options.send : typeof fetch === 'undefined' ? null : fetch

  const req = progressBeaconRequest(apiBase, videoId, seconds, token)
  if (!req) return false

  try {
    if (navigatorRef && typeof navigatorRef.sendBeacon === 'function') {
      const payload =
        typeof Blob === 'function' ? new Blob([req.body], { type: req.contentType }) : req.body
      if (navigatorRef.sendBeacon(req.url, payload)) return true
    }
  } catch {
    /* fall through to keepalive */
  }

  try {
    if (!sendRef) return false
    sendRef(req.url, {
      method: 'PUT',
      keepalive: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ seconds: Math.floor(Number(seconds) || 0) }),
    })?.catch?.(() => {})
    return true
  } catch {
    return false
  }
}
