/**
 * Hand the watch link to WhatsApp.
 *
 * The link goes over on its own, with no caption, so WhatsApp fetches our
 * Open Graph card and the recipient sees the poster, the title and the
 * creator rather than a bare URL.
 *
 * The hard part is not the URL, it is who performs the navigation. Assigning
 * `window.location` to a custom scheme from a JavaScript handler is treated
 * by iOS Safari as a navigation the page invented, and it is refused or
 * answered with "the address is invalid" when the app is missing. A real
 * anchor that the person taps is a navigation *they* performed, and iOS
 * follows it. That single difference is why this is a href now and not a
 * function that moves the location.
 *
 * `api.whatsapp.com` and `wa.me` are deliberately not used: they were what
 * produced "Something went wrong. The application couldn't be opened."
 */
function isPhone() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return true
  if (/iPhone|iPod/i.test(ua)) return true
  // iPadOS reports itself as a Mac; the touch points give it away. It is
  // treated as a desktop here on purpose — WhatsApp Web lets you pick a chat
  // there, and the iPad app handoff is the thing that kept failing.
  return false
}

/** Where the WhatsApp button should point on this device. */
export function whatsappHref(watchUrl) {
  const text = encodeURIComponent(watchUrl || '')
  return isPhone()
    ? `whatsapp://send?text=${text}`
    : `https://web.whatsapp.com/send?text=${text}`
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
