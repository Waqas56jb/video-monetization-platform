/**
 * Public share URLs. Every API that emits a watch or OG-card address uses this
 * so WhatsApp / Facebook never see a UUID, /s/, localhost, or the API host.
 */
const PROD_WEB = 'https://video-monetization-platform-chi.vercel.app'

function cleanOrigin(origin) {
  return String(origin || '').trim().replace(/\/$/, '')
}

export function isPublicSlug(slug) {
  const s = String(slug || '').trim()
  if (!s) return false
  if (s === 'undefined' || s === 'null') return false
  if (s.length > 200) return false
  return true
}

export function publicWebOrigin(configured) {
  const raw = cleanOrigin(configured)
  if (raw && !/localhost|127\.0\.0\.1/i.test(raw)) return raw
  return PROD_WEB
}

export function publicWatchPath(slug) {
  if (!isPublicSlug(slug)) return null
  return `/watch/${slug}`
}

export function publicWatchUrl(origin, slug) {
  const path = publicWatchPath(slug)
  const base = cleanOrigin(origin)
  if (!path || !base) return null
  return `${base}${path}`
}

export function publicOgCardUrl(origin, slug) {
  if (!isPublicSlug(slug)) return null
  const base = cleanOrigin(origin)
  if (!base) return null
  return `${base}/og/card/${slug}.jpg`
}
