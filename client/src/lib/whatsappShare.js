/**
 * Open WhatsApp with only the watch URL (so the recipient gets the OG card).
 *
 * iPad Safari + `wa.me` is what the client hit: it bounces through
 * api.whatsapp.com, asks to open another app, then “Something went wrong.
 * The application couldn’t be opened.” iPad often has no WhatsApp app — the
 * phone does. WhatsApp Web is the path that actually lets them pick a chat.
 *
 * Phones keep `wa.me` (that opens the app). Desktop also uses Web.
 */
export function whatsappShare(watchUrl) {
  const text = encodeURIComponent(watchUrl || '')
  if (typeof navigator === 'undefined') {
    return { href: `https://web.whatsapp.com/send?text=${text}`, target: '_blank' }
  }

  const ua = navigator.userAgent || ''
  const iPad =
    /iPad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !/iPhone|iPod/i.test(ua))
  const phone = /iPhone|iPod|Android/i.test(ua) && !iPad

  if (phone) {
    return { href: `https://wa.me/?text=${text}`, target: '_self' }
  }

  return { href: `https://web.whatsapp.com/send?text=${text}`, target: '_blank' }
}
