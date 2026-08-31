/**
 * Where the live deployments are.
 *
 * The API moved off Vercel to Railway on 2026-08-31. The two frontends did not —
 * they are still Vercel projects, and `publicApp` / `adminApp` are still the
 * origins the API's CORS list and its outbound links are built from.
 *
 * `legacyApis` matters more than it looks. `VITE_API_URL` is baked in at build
 * time, so a bundle already sitting in someone's browser cache, or a Vercel
 * project env that still holds an old value, will keep naming a host that no
 * longer answers. `resolveApiBase` in lib/api.js maps any of these onto `api`
 * instead of letting the request fail as an opaque network error — which is
 * indistinguishable, to a viewer, from the whole product being down.
 */
export const DEPLOY = {
  api: 'https://video-monetization-platform-production.up.railway.app',
  publicApp: 'https://video-monetization-platform-chi.vercel.app',
  adminApp: 'https://video-monetization-platform-admin.vercel.app',
  /** Hosts that used to serve the API. Order does not matter; all map to `api`. */
  legacyApis: [
    'https://video-monetization-platform-server.vercel.app',
    'https://video-monetization-platform-backend.vercel.app',
  ],
}
