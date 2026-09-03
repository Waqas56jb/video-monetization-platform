/**
 * Hand the watch link to WhatsApp.
 *
 * Phone: `whatsapp://send?text=` with only the watch URL. The app fetches the
 * card itself.
 *
 * Laptop: `web.whatsapp.com/send?text=` with the same URL. This opened a bare
 * WhatsApp Web home page for a while, on the reasoning that a prefilled
 * message is sent before WhatsApp has fetched a preview and so arrives as a
 * plain link. The reasoning is sound for a share that sends instantly, and
 * wrong here: this one puts the person in front of a chat list, and the
 * preview is fetched while they choose a chat and press send — the same
 * moment pasting gives it. What the bare page did give them was WhatsApp with
 * no message, no chat picker and nothing to share, which is what came back.
 *
 * api.whatsapp.com is deliberately not used. It loads a marketing page with a
 * "Share on WhatsApp" link to find, and it is what produced "Something went
 * wrong. The application couldn't be opened." on iPad.
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
 * Where the WhatsApp button points on this device.
 *
 * A LAPTOP GETS THE APP, NOT THE WEBSITE. This used to send every non-phone to
 * `web.whatsapp.com` in a new tab, and that is the whole of the client's
 * "tapping WhatsApp does not open WhatsApp" on his MacBook: a browser tab
 * opened, showing WhatsApp Web — which, to anyone not already signed in there,
 * is a QR code page. Nothing that looks like WhatsApp opened, because nothing
 * ever asked for the application. macOS and Windows both register the
 * `whatsapp://` scheme when the desktop app is installed, so the same scheme the
 * phone uses is the right one for a laptop too.
 *
 * The iPad keeps the web URL in a new tab, unchanged and deliberately: that is
 * the behaviour verified on the profile the client reported the iPad fault from,
 * and there is no desktop WhatsApp app on iPadOS to hand off to.
 */
export function whatsappHref(watchUrl) {
  const text = encodeURIComponent(String(watchUrl || '').trim())
  if (device() === 'ipad') return `https://web.whatsapp.com/send?text=${text}`
  return `whatsapp://send?text=${text}`
}

/** WhatsApp Web, for when the application is not installed. */
export function whatsappWebHref(watchUrl) {
  return `https://web.whatsapp.com/send?text=${encodeURIComponent(String(watchUrl || '').trim())}`
}

/**
 * A custom scheme is handed to the operating system, so the page stays where it
 * is; only the iPad's web URL wants a tab of its own.
 */
export function whatsappTarget() {
  return device() === 'ipad' ? '_blank' : '_self'
}

/**
 * Does this device need to be told when nothing happened?
 *
 * A `whatsapp://` link fails SILENTLY when the app is not installed — the OS
 * simply declines it and the page sits there, which is indistinguishable from a
 * broken button. A phone gets sent on to WhatsApp Web automatically
 * (`whatsappFallback`); a laptop is offered the choice instead, because
 * redirecting a desktop viewer to a QR-code page unasked is the very experience
 * this change exists to stop.
 */
export function whatsappNeedsVisibleFallback() {
  return device() === 'desktop'
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
  const web = `https://web.whatsapp.com/send?text=${encodeURIComponent(String(watchUrl || '').trim())}`
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
