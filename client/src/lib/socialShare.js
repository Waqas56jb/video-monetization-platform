/**
 * Open Instagram, TikTok or Facebook from a tap.
 *
 * navigator.share() cannot name an app — it always shows the OS picker, which
 * is what the client rejected. Same idea as WhatsApp: a real <a href> the
 * person tapped, pointing at that app's scheme (or an Android intent that
 * names the package). The watch URL is copied first so it is waiting to paste.
 */

function ua() {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
}

export function isPhone() {
  return /Android/i.test(ua()) || /iPhone|iPod/i.test(ua())
}

function isAndroid() {
  return /Android/i.test(ua())
}

function androidIntent(hostPath, pkg, fallback) {
  return `intent://${hostPath}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${encodeURIComponent(fallback)};end`
}

export function instagramHref() {
  const web = 'https://www.instagram.com/'
  if (isAndroid()) return androidIntent('instagram.com/', 'com.instagram.android', web)
  if (isPhone()) return 'instagram://app'
  return web
}

export function tiktokHref() {
  const web = 'https://www.tiktok.com/'
  if (isAndroid()) return androidIntent('www.tiktok.com/', 'com.zhiliaoapp.musically', web)
  if (isPhone()) return 'tiktok://'
  return web
}

export function facebookHref(watchUrl) {
  const web = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(watchUrl || '')}`
  if (isAndroid()) {
    const path = `www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(watchUrl || '')}`
    return androidIntent(path, 'com.facebook.katana', web)
  }
  return web
}

export function socialTarget() {
  return isPhone() ? '_self' : '_blank'
}

/** If the app never came forward, open the https fallback. */
export function appFallback(webUrl) {
  if (!isPhone() || !webUrl) return () => {}
  return () => {
    let left = false
    const onHide = () => {
      if (document.visibilityState === 'hidden') left = true
    }
    document.addEventListener('visibilitychange', onHide)
    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide)
      if (!left && document.visibilityState === 'visible') window.location.href = webUrl
    }, 1600)
  }
}

export function copyWatchUrl(url) {
  try {
    navigator.clipboard?.writeText(url || '')
  } catch {
    /* paste is a convenience, not the share */
  }
}
