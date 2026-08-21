/**
 * Hand the watch link to WhatsApp.
 *
 * Always prefill `send?text=` with ONLY the watch URL (no caption). WhatsApp
 * fetches the Open Graph poster. Extra text makes it send a bare link.
 *
 * Do not open WhatsApp until the JPEG is in the CDN — a cold first hit is
 * slower than WhatsApp waits, which is why paste-after-1s showed a card and
 * tap-and-send did not.
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
 * Prefill WhatsApp with the watch URL only. Phone uses the app scheme;
 * laptop / iPad use WhatsApp Web. The Share sheet waits until the poster
 * JPEG is cached before this link is tappable.
 */
export function whatsappHref(watchUrl) {
  const text = encodeURIComponent(watchUrl || '')
  if (device() === 'phone') return `whatsapp://send?text=${text}`
  if (device() === 'ipad') return `https://web.whatsapp.com/send?text=${text}`
  return `https://web.whatsapp.com/send?text=${text}`
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
