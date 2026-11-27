/**
 * Canonical API origin — never a retired backend hostname.
 *
 * The API has moved twice. It was `…-backend.vercel.app`, then
 * `…-server.vercel.app`, and as of 2026-08-31 it is on Railway. Both Vercel
 * hosts are dead: the first answers DEPLOYMENT_NOT_FOUND, and the second stops
 * being deployed once the move completes.
 *
 * The rewrite is not tidiness. `VITE_API_URL` is baked into a build, and builds
 * outlive deployments — a Vercel project env still holding an old value, a
 * cached bundle in a viewer's browser, a stale preview. Anything naming a host
 * we no longer run is redirected here rather than left to fail as an opaque
 * network error, which is how a dead API reads to a user.
 *
 * The frontends are still on Vercel. Only the API moved.
 */
const RAILWAY = 'https://video-monetization-platform-production.up.railway.app'

/** Hosts that used to serve this API and no longer do. */
const RETIRED = [
  /video-monetization-platform-backend\.vercel\.app/i,
  /video-monetization-platform-server\.vercel\.app/i,
]

export function apiOrigin() {
  const raw = String(process.env.VITE_API_URL || process.env.API_URL || RAILWAY)
  if (RETIRED.some((re) => re.test(raw))) return RAILWAY
  return (raw || RAILWAY).replace(/\/$/, '')
}

/**
 * The host the site is actually served from. The bare domain answers with a
 * 308 to www, and every address inside a share preview (og:url, canonical,
 * og:image) must be the final one: WhatsApp does not follow a redirect for the
 * card image, so it drops the whole preview and sends a plain link, and
 * Facebook re-scrapes og:url and lands on the redirect.
 */
const SERVED_WEB = 'https://www.mtonyoplus.com'

export function publicWebOrigin() {
  const raw = String(process.env.PUBLIC_WEB_URL || SERVED_WEB).replace(/\/$/, '')
  return /^https?:\/\/mtonyoplus\.com$/i.test(raw) ? SERVED_WEB : raw
}
