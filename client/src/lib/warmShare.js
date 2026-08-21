/**
 * Have the poster card ready before WhatsApp / Facebook ask for it.
 *
 * Laptop WhatsApp Web fetches the watch URL and the JPEG the moment a link
 * is pasted. If that JPEG is still being composed (Cloudflare thumb + Sharp),
 * the preview gives up and the recipient sees a bare URL. Hitting both URLs
 * as soon as Watch opens fills the CDN so paste can use a cached card.
 */
export function warmSharePreview(slug) {
  if (!slug || typeof window === 'undefined') return
  const origin = window.location.origin
  const card = `${origin}/og/card/${encodeURIComponent(slug)}.jpg`
  const page = `${origin}/watch/${encodeURIComponent(slug)}`

  const img = new Image()
  img.decoding = 'async'
  img.src = card

  fetch(card, { mode: 'cors', credentials: 'omit' }).catch(() => {})
  fetch(page, { mode: 'cors', credentials: 'omit' }).catch(() => {})
}
