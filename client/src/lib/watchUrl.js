/**
 * Canonical watch URL for share, copy and Open Graph.
 *
 * og:url and canonical stay clean (/watch/{slug}). The ?s= query busts
 * WhatsApp/Facebook cache when the poster or title changes.
 */
export function canonicalWatchPath(video) {
  const slug = typeof video === 'string' ? video : video?.slug
  if (!slug || slug === 'undefined' || slug === 'null') return null
  return `/watch/${slug}`
}

export function canonicalWatchUrl(video, origin) {
  const path = canonicalWatchPath(video)
  if (!path) return ''
  const base = String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/$/,
    ''
  )
  if (!base) return path
  return `${base}${path}`
}

/** Share link with cache-busting source key (not used in og:url). */
export function shareWatchUrl(video, origin, sourceKey) {
  const base = canonicalWatchUrl(video, origin)
  if (!base) return ''
  const key = sourceKey || (typeof video === 'object' ? video?.sourceKey : null)
  if (!key) return base
  return `${base}?s=${encodeURIComponent(key)}`
}

/** True when the loaded video is the one the /watch/:videoId route asked for. */
export function videoRouteMatches(idOrSlug, video) {
  if (!idOrSlug || !video) return false
  const key = decodeURIComponent(String(idOrSlug))
  return key === video.slug || key === video.id
}

/**
 * Playback JSON is per video. After /watch/A → /watch/B the previous
 * payload can still be in memory until the next fetch returns — that
 * payload must not decide B's lock, badge, or iframe.
 *
 * `routeKey` is the `:idOrSlug` from the address, and it is what lets the page
 * accept a payload before `/api/videos` has answered. Requiring the loaded video
 * row made the player wait for a second request that had nothing to add: on
 * production the playback response lands at ~500 ms and the iframe did not mount
 * until ~1150 ms, purely because the id it was being compared against arrived
 * with the other one.
 *
 * The guard it exists for is unchanged. A payload for A is still refused on B's
 * route, because A's payload carries neither B's id nor B's slug. Passing no
 * `routeKey` keeps the original behaviour exactly, so callers that do have the
 * video row are unaffected.
 */
export function playbackRouteMatches(playback, video, routeKey = null) {
  if (!playback) return false
  if (video?.id) return playback.videoId === video.id
  if (!routeKey) return false
  const key = decodeURIComponent(String(routeKey))
  return key === playback.videoId || key === playback.slug
}

export function whatsappShareText(watchUrl) {
  return String(watchUrl || '').trim()
}

/** Native share — URL carries the rich card; no caption text (duplicates OG). */
export function nativeShareData(watchUrl, title) {
  return { title: title || 'MTONYO+', url: String(watchUrl || '') }
}
