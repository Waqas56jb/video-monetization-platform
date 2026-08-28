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

/**
 * A warmed payload is only good for as long as what is inside it.
 *
 * A preview playback token lives fifteen minutes. Cards warm themselves when
 * they scroll into view, so browsing Explore for a quarter of an hour and then
 * tapping a title handed the player a JWT that had already expired: a black
 * frame, "Connecting to player…", a twelve second timeout, and a Try again that
 * re-used the very same dead promise. Ten minutes leaves comfortable margin.
 */
const WARM_TTL_MS = 10 * 60 * 1000

function cacheGet(map, key, fetch) {
  if (!key) return null
  const id = String(key)
  const hit = map.get(id)
  if (hit && Date.now() - hit.at < WARM_TTL_MS) return hit.promise
  const promise = fetch(id).catch((err) => {
    map.delete(id)
    throw err
  })
  map.set(id, { promise, at: Date.now() })
  return promise
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
  const hit = map.get(key)
  if (!hit) return null
  map.delete(key)
  /* Stale means the token inside it may already be refused. Better to spend a
     round trip than to hand the player a JWT it cannot use. */
  return Date.now() - hit.at < WARM_TTL_MS ? hit.promise : null
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

/** Chunk + video + signed playback — real intent, i.e. a finger on a card. */
export function prefetchWatch(idOrSlug) {
  prefetchWatchChunk()
  if (idOrSlug) {
    warmVideo(idOrSlug)
    warmPlayback(idOrSlug)
    warmAds(idOrSlug)
  }
}

/**
 * The cheap half, for a card that has merely scrolled past.
 *
 * The full warm is three requests, and every card in view was firing all three
 * on idle: twenty-four on the home page, up to seventy-two on Explore, all
 * competing with the card thumbnails that are the page's largest paint. Only
 * one of the three decides when the film can start — the signed playback URL is
 * what the iframe is built from — so that is the one worth spending on
 * speculatively. The video row and the ad breaks are fetched on the tap, which
 * is where the intent actually is.
 */
export function prefetchWatchLight(idOrSlug) {
  prefetchWatchChunk()
  if (idOrSlug) warmPlayback(idOrSlug)
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
