import api from '@/lib/api'

/** Same dynamic import App.jsx uses for React.lazy — one Vite chunk. */
export function loadWatchPage() {
  return import('../pages/Watch.jsx')
}

let chunkDone = false

/** Prefetch the Watch route chunk (no-op after first success). */
export function prefetchWatchChunk() {
  if (chunkDone) return
  chunkDone = true
  loadWatchPage().catch(() => {
    chunkDone = false
  })
}

/** In-flight / resolved video payloads keyed by slug or id. */
const videoCache = new Map()

/**
 * Start fetching video JSON on pointerdown so the request is ~100 ms ahead of
 * Watch mount. Returns the same Promise useApi will await.
 */
export function warmVideo(idOrSlug) {
  if (!idOrSlug) return null
  const key = String(idOrSlug)
  if (videoCache.has(key)) return videoCache.get(key)
  const p = api.videos.one(key).catch((err) => {
    videoCache.delete(key)
    throw err
  })
  videoCache.set(key, p)
  return p
}

/** Promise already warming, or null. */
export function takeWarmedVideo(idOrSlug) {
  if (!idOrSlug) return null
  return videoCache.get(String(idOrSlug)) || null
}

/** Chunk + optional video warm — call from card pointerdown / Explore idle. */
export function prefetchWatch(idOrSlug) {
  prefetchWatchChunk()
  if (idOrSlug) warmVideo(idOrSlug)
}

export function idlePrefetchWatch() {
  const run = () => prefetchWatchChunk()
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 1)
  }
}
