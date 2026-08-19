/**
 * Open WhatsApp with only the watch URL so the recipient gets the OG card.
 *
 * `wa.me` / `api.whatsapp.com` is what failed on iPad Safari: Safari asked to
 * open another app, then “Something went wrong. The application couldn’t be
 * opened.” Phones use the WhatsApp app scheme (no api.whatsapp.com hop).
 * iPad and desktop use WhatsApp Web, where a chat can actually be chosen.
 */
function encodeText(watchUrl) {
  return encodeURIComponent(watchUrl || '')
}

function device() {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent || ''
  const iPad =
    /iPad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !/iPhone|iPod/i.test(ua))
  if (iPad) return 'ipad'
  if (/iPhone|iPod/i.test(ua)) return 'iphone'
  if (/Android/i.test(ua)) return 'android'
  return 'web'
}

export function whatsappShare(watchUrl) {
  const text = encodeText(watchUrl)
  const kind = device()
  if (kind === 'iphone' || kind === 'android') {
    return {
      href: `whatsapp://send?text=${text}`,
      target: '_self',
      webFallback: `https://web.whatsapp.com/send?text=${text}`,
    }
  }
  return {
    href: `https://web.whatsapp.com/send?text=${text}`,
    target: '_blank',
    webFallback: null,
  }
}

/** First tap opens the app, or WhatsApp Web if the app is not there. */
export function openWhatsApp(watchUrl) {
  const wa = whatsappShare(watchUrl)
  if (!wa.webFallback) {
    window.open(wa.href, wa.target === '_blank' ? '_blank' : '_self', 'noopener,noreferrer')
    return
  }

  let openedApp = false
  const onHide = () => {
    if (document.visibilityState === 'hidden') openedApp = true
  }
  document.addEventListener('visibilitychange', onHide)
  window.location.href = wa.href
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!openedApp && document.visibilityState === 'visible') {
      window.open(wa.webFallback, '_blank', 'noopener,noreferrer')
    }
  }, 1000)
}
