/* =========================================================================
   MTONYO+ service worker
   Goal for V1: make the app installable and resilient on the patchy mobile
   connections this platform is built for — not to cache video, which is
   served (and access-controlled) by the streaming provider.
   ========================================================================= */

/**
 * The version comes from the query string the page registers with, and that
 * changes on every build.
 *
 * It used to be a constant. Because the cache names are built from it, and
 * `activate` only deletes caches whose name does not start with it, nothing was
 * ever deleted: a device could keep booting a months-old bundle against a
 * backend that had moved on, and the only symptom is a screen that "sometimes
 * breaks". Hashed asset files are immutable, so caching them hard is right —
 * but only until the build they belong to is gone.
 */
const VERSION = `mtonyo-${new URL(self.location.href).searchParams.get('v') || 'dev'}`
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`
const IMAGE_CACHE = `${VERSION}-images`

const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

/** Let the page trigger an immediate update after a new deploy. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

const isAsset = (url) => url.pathname.startsWith('/assets/')
const isImage = (req) => req.destination === 'image'
const isFont = (req) => req.destination === 'font' || req.destination === 'style'

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  /* --- navigations: network first, cached shell when offline (SPA fallback) --- */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only keep a copy worth serving later. Caching an error page as the
          // app shell is how a device ends up permanently broken offline.
          if (res && res.ok) {
            /**
             * Stored under its own URL, not under '/'.
             *
             * This wrote every successful navigation to the key '/', so opening
             * one video replaced the offline home page with that video's
             * document — and /watch/:slug is server-rendered per video, so the
             * two are genuinely different pages, not one shell. Going offline
             * afterwards and opening the site gave you whatever film you last
             * looked at.
             *
             * '/' is still populated, by the SHELL precache on install, so the
             * fallback below keeps working for a URL never visited online.
             */
            const copy = res.clone()
            caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(() => {})
          }
          return res
        })
        .catch(() =>
          caches
            .match(request)
            .then((exact) => exact || caches.match('/'))
            .then((cached) => cached || Response.error())
        )
    )
    return
  }

  /* --- hashed build assets are immutable: cache first --- */
  if (url.origin === self.location.origin && isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            /**
             * `res.ok`, for the same reason the navigation branch checks it.
             *
             * This branch is cache-first with an exact-URL match, so whatever is
             * stored here is served for the whole life of this build version and
             * is never revalidated. Without the guard a 404 or a 502 body — an
             * edge briefly serving a chunk from a build that has just been
             * replaced is the realistic case — is written under the asset URL
             * and then handed back as JavaScript to every subsequent load. The
             * app breaks for that visitor until the next deploy changes VERSION,
             * and a reload cannot clear it because the cache is the first thing
             * consulted.
             */
            if (res && res.ok) {
              const copy = res.clone()
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy)).catch(() => {})
            }
            return res
          })
      )
    )
    return
  }

  /* --- images + fonts: serve cached instantly, refresh in the background --- */
  if (isImage(request) || isFont(request)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              const copy = res.clone()
              caches.open(IMAGE_CACHE).then((c) => c.put(request, copy)).catch(() => {})
            }
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
  }
})
