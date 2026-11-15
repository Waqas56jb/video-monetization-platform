/**
 * Our own adaptive player for the film: Cloudflare's HLS stream, played by hls.js.
 *
 * Why not Cloudflare's embedded player (still used for adverts and as the
 * fallback here)? Measured 2026-11-15 on a 1080p source, Chromium throttled
 * (scratchpad abr-measure; numbers in FINAL-AUDIT.md "Playback on weak networks"):
 *
 *   - it starts every film at its TOP rendition, because that is the first one in
 *     Cloudflare's playlist and the bandwidth is not known yet. On 3G the first
 *     frame took 12.2s; on slow 4G 9.4s.
 *   - it reacts slowly to a drop: 37s after the connection fell to 600 kbps it was
 *     still on 720p, surviving on buffer. It offers no setting for any of this.
 *
 * Here the start is low and the climb is fast — quality may drop for a moment,
 * playback keeps moving. Same signed Cloudflare URLs, same edge, nothing proxied
 * through our server.
 */

let hlsPromise = null
/** The library is its own chunk; Watch starts this import while the API call runs. */
export const loadHls = () => {
  if (!hlsPromise) {
    hlsPromise = import('hls.js/dist/hls.light.mjs').then((m) => m.default).catch((err) => {
      hlsPromise = null
      throw err
    })
  }
  return hlsPromise
}

export const HLS_CONFIG = {
  // Pick the first rendition ourselves (see startLevelFor) instead of trusting
  // the playlist order.
  startLevel: -1,
  abrEwmaDefaultEstimate: 400_000,
  testBandwidth: true,
  // Never download more pixels than the player can show (the player's size
  // times the screen's pixel ratio, re-checked on fullscreen).
  capLevelToPlayerSize: true,
  // Headroom: climb only when the link clearly carries the next rendition, and
  // judge the link on recent fragments so a drop is noticed in seconds.
  abrBandWidthFactor: 0.8,
  abrBandWidthUpFactor: 0.7,
  abrEwmaFastVoD: 2,
  abrEwmaSlowVoD: 6,
  // A fragment that is late by more than this switches down instead of waiting.
  maxStarvationDelay: 2,
  maxLoadingDelay: 2,
  // A 30–60 s buffer rides out the dips of a mobile connection; 30 s kept behind
  // the playhead lets a viewer step back without refetching.
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  backBufferLength: 30,
  startFragPrefetch: true,
  // Retry a failed fragment or playlist rather than failing the film.
  fragLoadPolicy: { default: { maxTimeToFirstByteMs: 10_000, maxLoadTimeMs: 60_000, timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 }, errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 } } },
}

/**
 * The first rendition: the best one that fits in half of what the device says
 * its connection is (Chrome and Android report it), else the lowest. Starting low
 * costs a second of soft picture on Wi-Fi; starting high cost twelve seconds of
 * nothing on 3G.
 */
export function startLevelFor(levels, downlinkMbps) {
  const ranked = levels
    .map((l, i) => ({ i, bps: l.averageBitrate || l.bitrate || 0 }))
    .sort((a, b) => a.bps - b.bps)
  if (!ranked.length) return -1
  const fit = downlinkMbps > 0 ? ranked.filter((l) => l.bps <= downlinkMbps * 1e6 * 0.5).pop() : null
  return (fit || ranked[0]).i
}

/**
 * Which engine this browser gets for the film.
 *   'native' — iPhone / iPad: Apple's own HLS player (its adaptive logic is the
 *              platform's, and it is what every app there uses).
 *   'hls'    — anything with Media Source Extensions: hls.js, tuned above.
 *   'iframe' — neither: Cloudflare's embedded player.
 */
export function pickEngine(env = typeof window === 'undefined' ? null : window) {
  if (!env) return 'iframe'
  const nav = env.navigator || {}
  const appleMobile = /iPhone|iPad|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  if (appleMobile) {
    const probe = env.document?.createElement?.('video')
    if (probe?.canPlayType?.('application/vnd.apple.mpegurl')) return 'native'
  }
  if (env.MediaSource || env.ManagedMediaSource) return 'hls'
  return 'iframe'
}

/**
 * Attach the film to a <video>. Resolves once the source is attached; `onFatal`
 * is called if playback cannot continue so the caller can fall back.
 */
export async function attachHls(video, src, { startAt = 0, engine = 'hls', onFatal } = {}) {
  // Muted before anything loads: the one autoplay every browser allows.
  video.muted = true
  if (engine === 'native') {
    video.src = src
    return { destroy: () => { video.removeAttribute('src'); video.load() } }
  }
  const Hls = await loadHls()
  if (!Hls.isSupported()) throw new Error('hls.js not supported')
  const hls = new Hls({ ...HLS_CONFIG, startPosition: startAt > 0 ? startAt : -1 })
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    const down = Number(globalThis.navigator?.connection?.downlink) || 0
    const level = startLevelFor(hls.levels, down)
    if (level >= 0) hls.startLevel = level
  })
  let recoveries = 0
  hls.on(Hls.Events.ERROR, (_e, data) => {
    if (!data?.fatal) return
    // A playlist that will not load cannot be recovered by restarting the
    // download — hand over to Cloudflare's player at once.
    if (/^(manifest|level)/i.test(String(data.details || ''))) {
      onFatal?.(data)
      return
    }
    // A fragment that failed after its retries: recover in place, a few times.
    if (recoveries < 3 && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      recoveries += 1
      hls.startLoad()
      return
    }
    if (recoveries < 3 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      recoveries += 1
      hls.recoverMediaError()
      return
    }
    onFatal?.(data)
  })
  hls.loadSource(src)
  hls.attachMedia(video)
  return { hls, destroy: () => hls.destroy() }
}
