/**
 * Edge-warm share URLs in the background — no polling, no awaits on user tap.
 * WhatsApp crawls server-side; we only prime CDN/browser caches early.
 */

const warmed = new Set()
const healing = new Set()

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

/** Build warm URLs from share payload + optional overrides. */
export function warmShareFromMeta(meta) {
  if (!meta?.watchUrl) return
  const cleanUrl = meta.watchUrl
  const shareUrl =
    meta.shareUrl ||
    (meta.sourceKey
      ? `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}s=${encodeURIComponent(meta.sourceKey)}`
      : cleanUrl)
  warmShare({ shareUrl, cleanUrl, cardUrl: meta.cardUrl })
}

/**
 * Rare self-heal when cardStatus !== 'ready'. Never blocks share buttons.
 * @param {string} slug
 * @param {(meta: object) => void} [onRefresh]
 */
export function healShareCard(slug, onRefresh) {
  if (!slug || typeof window === 'undefined') return
  if (healing.has(slug)) return
  healing.add(slug)

  const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') ||
    'https://video-monetization-platform-production.up.railway.app'

  fetch(`${apiBase}/api/share-card/${encodeURIComponent(slug)}/ensure`, { method: 'POST' })
    .then(() =>
      fetch(`${apiBase}/api/public/videos/${encodeURIComponent(slug)}/share-meta`, {
        headers: { Accept: 'application/json' },
      })
    )
    .then((r) => (r.ok ? r.json() : null))
    .then((meta) => {
      if (meta) {
        warmShareFromMeta(meta)
        onRefresh?.(meta)
      }
    })
    .catch(() => {})
  /**
   * Deliberately never released.
   *
   * `healing` used to be cleared in a `.finally`, which resolves as a microtask
   * — before React has flushed the passive effect that `onRefresh`'s setState
   * scheduled. So the effect re-ran with the guard already open and called this
   * again: POST /ensure, GET /share-meta, setState, repeat. On a video whose
   * card genuinely cannot be built, `cardStatus` never becomes 'ready' and the
   * loop had nothing to stop it.
   *
   * One attempt per slug per page is all this is for — it is a rare self-heal,
   * not a retry policy. A reload gets a fresh attempt.
   */
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
