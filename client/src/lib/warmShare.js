/**
 * Have the poster JPEG and OG HTML in the CDN *before* WhatsApp asks.
 *
 * WhatsApp Web only draws the card if HTML + JPEG return in a few hundred
 * milliseconds. First hit composes the JPEG (Cloudflare + Sharp) and that
 * takes longer than WhatsApp waits — paste-after-1s worked, send-immediately
 * did not. Waiting until both URLs are real images/tags fixes that.
 */
const inflight = new Map()

export async function prepareShareCard(slug) {
  if (!slug || typeof window === 'undefined') return false
  const pending = inflight.get(slug)
  if (pending) return pending

  const run = (async () => {
    const origin = window.location.origin
    const card = `${origin}/og/card/${encodeURIComponent(slug)}.jpg`
    const page = `${origin}/watch/${encodeURIComponent(slug)}`

    for (let i = 0; i < 10; i++) {
      try {
        const [imgRes, pageRes] = await Promise.all([
          fetch(card, { mode: 'cors', credentials: 'omit', cache: i === 0 ? 'reload' : 'force-cache' }),
          fetch(page, { mode: 'cors', credentials: 'omit' }),
        ])
        if (!imgRes.ok) throw new Error('not ready')
        const type = imgRes.headers.get('content-type') || ''
        const bytes = await imgRes.arrayBuffer()
        const html = pageRes.ok ? await pageRes.text() : ''
        const jpegReady = bytes.byteLength > 2000 && /image\/jpeg/i.test(type)
        const tagsReady = !html || /property=["']og:image["']/i.test(html)
        if (jpegReady && tagsReady) {
          await new Promise((resolve) => {
            const im = new Image()
            im.onload = resolve
            im.onerror = resolve
            im.src = card
            setTimeout(resolve, 1200)
          })
          return true
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 350))
    }
    return false
  })()

  inflight.set(slug, run)
  try {
    return await run
  } finally {
    inflight.delete(slug)
  }
}

export function warmSharePreview(slug) {
  prepareShareCard(slug).catch(() => {})
}
