/**
 * Canonical watch URL for share, copy and Open Graph.
 *
 * Always `/watch/{slug}` on the current origin. Never a UUID, never /s/,
 * never query junk — those are what WhatsApp shows as an "ugly link".
 */
export function canonicalWatchPath(video) {
  const slug = video?.slug
  if (!slug) return null
  return `/watch/${slug}`
}

export function canonicalWatchUrl(video) {
  const path = canonicalWatchPath(video)
  if (!path || typeof window === 'undefined') return ''
  return `${window.location.origin}${path}`
}
