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

/** Where the WhatsApp button points on this device. */
export function whatsappHref(watchUrl, title, creator) {
  const lines = []
  if (title) lines.push(creator ? `${title} — ${creator}` : title)
  if (watchUrl) lines.push(watchUrl)
  const text = encodeURIComponent(lines.join('\n'))
  if (device() === 'phone') return `whatsapp://send?text=${text}`
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
export function whatsappFallback(watchUrl, title, creator) {
  if (!isPhone()) return () => {}
  const lines = []
  if (title) lines.push(creator ? `${title} — ${creator}` : title)
  if (watchUrl) lines.push(watchUrl)
  const web = `https://web.whatsapp.com/send?text=${encodeURIComponent(lines.join('\n'))}`
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
