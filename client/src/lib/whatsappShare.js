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
/**
 * Three devices, three different right answers — measured, not assumed.
 *
 *   phone    whatsapp://send?text=       opens the app straight at the picker
 *   iPad     web.whatsapp.com/send       200 here; api.whatsapp.com is what
 *                                        produced "Something went wrong. The
 *                                        application couldn't be opened."
 *   desktop  api.whatsapp.com/send       WhatsApp's own documented link for a
 *                                        message with no recipient yet
 *
 * The desktop line is the fix. It was pointing at web.whatsapp.com/send, and
 * that address **answers 400 on a desktop browser** — /send cannot make a
 * chat without a phone number. WhatsApp Web opened, the text went nowhere and
 * there was no way to choose a contact, which is exactly what was reported.
 * api.whatsapp.com/send answers 200 and hands off to WhatsApp Web with the
 * message waiting for a chat to be picked.
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

/** Where the WhatsApp button should point on this device. */
export function whatsappHref(watchUrl) {
  const text = encodeURIComponent(watchUrl || '')
  switch (device()) {
    case 'phone':
      return `whatsapp://send?text=${text}`
    case 'ipad':
      return `https://web.whatsapp.com/send?text=${text}`
    default:
      return `https://api.whatsapp.com/send?text=${text}`
  }
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
