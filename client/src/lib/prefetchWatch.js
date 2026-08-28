import api from '@/lib/api'

const STREAM_SDK = 'https://embed.cloudflarestream.com/embed/sdk.latest.js'

/** Same dynamic import App.jsx uses for React.lazy — one Vite chunk. */
export function loadWatchPage() {
  return import('../pages/Watch.jsx')
}

let chunkDone = false

function preloadStreamSdk() {
  if (typeof document === 'undefined') return
  if (document.querySelector('link[data-cf-stream-sdk], script[data-cf-stream-sdk]')) return
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'script'
  link.href = STREAM_SDK
  link.dataset.cfStreamSdk = '1'
  document.head.appendChild(link)
  const el = document.createElement('script')
  el.src = STREAM_SDK
  el.async = true
  el.dataset.cfStreamSdk = '1'
  document.head.appendChild(el)
}

/** Prefetch the Watch route chunk (no-op after first success). */
export function prefetchWatchChunk() {
  if (chunkDone) return
  chunkDone = true
  preloadStreamSdk()
  loadWatchPage().catch(() => {
    chunkDone = false
  })
}

/** In-flight / resolved video payloads keyed by slug or id. */
const videoCache = new Map()
const playbackCache = new Map()

function cacheGet(map, key, fetch) {
  if (!key) return null
  const id = String(key)
  if (map.has(id)) return map.get(id)
  const p = fetch(id).catch((err) => {
    map.delete(id)
    throw err
  })
  map.set(id, p)
  return p
}

/**
 * Start fetching video JSON on pointerdown so the request is ~100 ms ahead of
 * Watch mount. Returns the same Promise useApi will await.
 */
export function warmVideo(idOrSlug) {
  return cacheGet(videoCache, idOrSlug, (id) => api.videos.one(id))
}

export function warmPlayback(idOrSlug) {
  return cacheGet(playbackCache, idOrSlug, (id) => api.playback(id))
}

/** Promise already warming, or null. */
export function takeWarmedVideo(idOrSlug) {
  if (!idOrSlug) return null
  return videoCache.get(String(idOrSlug)) || null
}

export function takeWarmedPlayback(idOrSlug) {
  if (!idOrSlug) return null
  return playbackCache.get(String(idOrSlug)) || null
}

/** Chunk + video + signed playback — call from card pointerdown / Explore. */
export function prefetchWatch(idOrSlug) {
  prefetchWatchChunk()
  if (idOrSlug) {
    warmVideo(idOrSlug)
    warmPlayback(idOrSlug)
  }
}

export function idlePrefetchWatch() {
  const run = () => prefetchWatchChunk()
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 1)
  }
}
