/**
 * Canonical watch URL for share, copy and Open Graph.
 *
 * Always `/watch/{slug}` on the current origin. Never a UUID, never /s/,
 * never query junk — those are what WhatsApp shows as an "ugly link".
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

/** The only text WhatsApp should send. */
export function whatsappShareText(watchUrl) {
  return String(watchUrl || '').trim()
}

/** The only payload More… may send. Never attach the promo MP4. */
export function nativeShareData(watchUrl) {
  return { url: String(watchUrl || '') }
}
