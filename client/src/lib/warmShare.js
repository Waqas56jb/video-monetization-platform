/**
 * Have the poster JPEG and OG HTML in the CDN *before* WhatsApp asks.
 *
 * WhatsApp Web only draws the card if HTML + JPEG return in a few hundred
 * milliseconds. First hit composes the JPEG (Cloudflare + Sharp) and that
 * takes longer than WhatsApp waits. We wait on a real 200 JPEG — not a
 * one-second timer — then hand WhatsApp a warm URL.
 */
import { DEPLOY } from '@/lib/deployUrls'

const inflight = new Map()

const API =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  DEPLOY.api

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function kickServerCompose(slug) {
  if (!slug) return Promise.resolve()
  return Promise.allSettled([
    fetch(`${API}/api/share/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    }),
    fetch(`${API}/api/share/${encodeURIComponent(slug)}/card.jpg`, {
      credentials: 'omit',
    }),
  ])
}

async function probeCard(slug) {
  if (!slug || typeof window === 'undefined') return false
  const origin = window.location.origin
  const card = `${origin}/og/card/${encodeURIComponent(slug)}.jpg`
  const page = `${origin}/watch/${encodeURIComponent(slug)}`

  const [imgRes, pageRes] = await Promise.all([
    fetch(card, { mode: 'cors', credentials: 'omit' }),
    fetch(page, { mode: 'cors', credentials: 'omit' }),
  ])
  if (!imgRes.ok) return false
  const type = imgRes.headers.get('content-type') || ''
  const bytes = await imgRes.arrayBuffer()
  const html = pageRes.ok ? await pageRes.text() : ''
  const jpegReady = bytes.byteLength > 2000 && /image\/jpeg/i.test(type)
  const tagsReady = /property=["']og:image["']/i.test(html)
  if (!jpegReady || !tagsReady) return false

  await new Promise((resolve) => {
    const im = new Image()
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    im.onload = finish
    im.onerror = finish
    im.src = card
    setTimeout(finish, 8000)
  })
  return true
}

export async function prepareShareCard(slug) {
  if (!slug || slug === 'undefined' || typeof window === 'undefined') return false
  const pending = inflight.get(slug)
  if (pending) return pending

  const run = (async () => {
    kickServerCompose(slug)

    for (let i = 0; i < 10; i++) {
      try {
        if (await probeCard(slug)) return true
      } catch {
        /* retry until the Postgres-backed JPEG exists */
      }
      if (i === 2 || i === 5) kickServerCompose(slug)
      await sleep(400)
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
