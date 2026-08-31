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

export function publicWebOrigin() {
  const raw =
    process.env.PUBLIC_WEB_URL || 'https://video-monetization-platform-chi.vercel.app'
  return String(raw).replace(/\/$/, '')
}
