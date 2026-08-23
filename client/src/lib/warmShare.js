/**
 * Edge-warm share URLs in the background — no polling, no awaits on user tap.
 * WhatsApp crawls server-side; we only prime CDN/browser caches early.
 */

const warmed = new Set()

function warmUrl(u) {
  if (!u) return
  fetch(u, { mode: 'no-cors', cache: 'default', priority: 'low', keepalive: true }).catch(() => {})
}

/**
 * @param {{ shareUrl: string, cleanUrl?: string, cardUrl?: string }} urls
 */
export function warmShare(urls) {
  if (typeof window === 'undefined' || !urls?.shareUrl) return
  const key = urls.shareUrl
  if (warmed.has(key)) return
  warmed.add(key)

  const run = () => {
    warmUrl(urls.shareUrl)
    warmUrl(urls.cleanUrl)
    if (urls.cardUrl) {
      const img = new Image()
      img.decoding = 'async'
      img.src = urls.cardUrl
      if (!document.querySelector(`link[rel="prefetch"][href="${urls.cardUrl}"]`)) {
        const link = document.createElement('link')
        link.rel = 'prefetch'
        link.as = 'image'
        link.href = urls.cardUrl
        document.head.appendChild(link)
      }
    }
  }

  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 })
  else setTimeout(run, 0)
}

/** Build warm URLs from share payload + optional overrides. */
export function warmShareFromMeta(meta) {
  if (!meta?.watchUrl) return
  const cleanUrl = meta.watchUrl
  const shareUrl = meta.sourceKey
    ? `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}s=${encodeURIComponent(meta.sourceKey)}`
    : cleanUrl
  warmShare({ shareUrl, cleanUrl, cardUrl: meta.cardUrl })
}

/** @deprecated use warmShareFromMeta */
export function warmSharePreview(slug, sourceKey, meta) {
  if (meta?.watchUrl) {
    warmShareFromMeta(meta)
    return
  }
  if (!slug) return
  const origin = window.location.origin
  const cleanUrl = `${origin}/watch/${encodeURIComponent(slug)}`
  const shareUrl = sourceKey
    ? `${cleanUrl}?s=${encodeURIComponent(sourceKey)}`
    : cleanUrl
  warmShare({ shareUrl, cleanUrl })
}
