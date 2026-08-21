/**
 * Hand the watch link to WhatsApp.
 *
 * Phone: `whatsapp://send?text=` with ONLY the watch URL. The app fetches OG.
 *
 * Laptop / WhatsApp Web: do not prefill `send?text=`. WhatsApp then injects
 * the URL and sends it as a bare link (no poster). Copy the URL and open
 * WhatsApp; paste in the chat is what draws the card — same as Copy Link.
 */
function device() {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua) || /iPhone|iPod/i.test(ua)) return 'phone'
  // iPadOS reports itself as a Mac; the touch points give it away.
  const iPad =
    /iPad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return iPad ? 'ipad' : 'desktop'
}

function isPhone() {
  return device() === 'phone'
}

export { isPhone as whatsappIsPhone }

/**
 * Phone: open the app with the watch URL (WhatsApp fetches the poster).
 * Laptop: open WhatsApp Web with an empty compose — the URL is already copied.
 */
export function whatsappHref(watchUrl) {
  const text = encodeURIComponent(watchUrl || '')
  if (device() === 'phone') return `whatsapp://send?text=${text}`
  return 'https://web.whatsapp.com/'
}

/** Phones leave the page for the app; everything else opens a tab. */
export function whatsappTarget() {
  return isPhone() ? '_self' : '_blank'
}

/**
 * If the app never came to the front, send them to WhatsApp Web instead.
 *
 * Attached to the anchor rather than replacing it: the tap has already gone
 * to the app scheme by the time this runs, so a device with WhatsApp
 * installed never sees the fallback.
 */
export function whatsappFallback(watchUrl) {
  if (!isPhone()) return () => {}
  const web = `https://web.whatsapp.com/send?text=${encodeURIComponent(watchUrl || '')}`
  return () => {
    let left = false
    const onHide = () => {
      if (document.visibilityState === 'hidden') left = true
    }
    document.addEventListener('visibilitychange', onHide)
    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide)
      if (!left && document.visibilityState === 'visible') window.location.href = web
    }, 1500)
  }
}
