import api from '@/lib/api'

export const STREAM_SDK = 'https://embed.cloudflarestream.com/embed/sdk.latest.js'

/** Same dynamic import App.jsx uses for React.lazy — one Vite chunk. */
export function loadWatchPage() {
  return import('../pages/Watch.jsx')
}

export function loadLandingPage() {
  return import('../pages/Landing.jsx')
}

let chunkDone = false
let sdkPromise = null

function existingSdkScript() {
  if (typeof document === 'undefined') return null
  return (
    document.querySelector('script[data-cf-stream-sdk]') ||
    document.querySelector('script[src*="embed.cloudflarestream.com/embed/sdk"]')
  )
}

function preloadStreamSdk() {
  if (typeof document === 'undefined') return
  if (!document.querySelector('link[data-cf-stream-sdk]')) {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'script'
    link.href = STREAM_SDK
    link.dataset.cfStreamSdk = '1'
    document.head.appendChild(link)
  }
  if (existingSdkScript()) return
  const el = document.createElement('script')
  el.src = STREAM_SDK
  el.async = true
  el.dataset.cfStreamSdk = '1'
  document.head.appendChild(el)
}

/** One Stream SDK script for the whole app — index.html, idle prefetch, or player. */
export function ensureStreamSdk() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.Stream) return Promise.resolve(window.Stream)
  if (sdkPromise) return sdkPromise

  preloadStreamSdk()

  sdkPromise = new Promise((resolve) => {
    const finish = (value) => resolve(value)
    if (window.Stream) return finish(window.Stream)
    const el = existingSdkScript()
    if (el) {
      el.addEventListener('load', () => finish(window.Stream || null), { once: true })
      el.addEventListener('error', () => finish(null), { once: true })
    }
    const t0 = Date.now()
    const poll = () => {
      if (window.Stream) return finish(window.Stream)
      if (Date.now() - t0 > 10000) return finish(null)
      setTimeout(poll, 40)
    }
    poll()
  })
  return sdkPromise
}

/** Prefetch the Watch route chunk (no-op after first success). */
export function prefetchWatchChunk() {
  if (chunkDone) return
  chunkDone = true
  ensureStreamSdk()
  loadWatchPage().catch(() => {
    chunkDone = false
  })
}

/** In-flight / resolved video payloads keyed by slug or id. */
const videoCache = new Map()
const playbackCache = new Map()
const adsCache = new Map()

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

export function warmAds(idOrSlug) {
  return cacheGet(adsCache, idOrSlug, (id) => api.ads.breaks(id))
}

function takeFrom(map, idOrSlug) {
  if (!idOrSlug) return null
  const key = String(idOrSlug)
  const p = map.get(key) || null
  if (p) map.delete(key)
  return p
}

/** Promise already warming, or null. Consumed so a later reload cannot reuse it. */
export function takeWarmedVideo(idOrSlug) {
  return takeFrom(videoCache, idOrSlug)
}

export function takeWarmedPlayback(idOrSlug) {
  return takeFrom(playbackCache, idOrSlug)
}

export function takeWarmedAds(idOrSlug) {
  return takeFrom(adsCache, idOrSlug)
}

/** Drop a warmed payload so the next fetch is live (full film after payment). */
export function dropWarmedPlayback(idOrSlug) {
  if (!idOrSlug) return
  playbackCache.delete(String(idOrSlug))
}

export function dropWarmedVideo(idOrSlug) {
  if (!idOrSlug) return
  videoCache.delete(String(idOrSlug))
}

export function dropWarmedWatch(idOrSlug) {
  dropWarmedPlayback(idOrSlug)
  dropWarmedVideo(idOrSlug)
}

/** Chunk + video + signed playback — call from card pointerdown / Explore. */
export function prefetchWatch(idOrSlug) {
  prefetchWatchChunk()
  if (idOrSlug) {
    warmVideo(idOrSlug)
    warmPlayback(idOrSlug)
    warmAds(idOrSlug)
  }
}

export function idlePrefetchWatch() {
  const run = () => {
    prefetchWatchChunk()
    loadLandingPage().catch(() => {})
  }
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 1)
  }
}
