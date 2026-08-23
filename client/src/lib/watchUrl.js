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

export function whatsappShareText(watchUrl, title, creator) {
  const url = String(watchUrl || '').trim()
  if (!title) return url
  const head = creator ? `${title} — ${creator}` : title
  return `${head}\n${url}`
}

/** Native share payload — URL carries the rich card. */
export function nativeShareData(watchUrl, title, creator) {
  const url = String(watchUrl || '')
  const text = creator ? `${title || 'MTONYO+'} — ${creator}` : title || ''
  return { title: title || 'MTONYO+', text, url }
}
