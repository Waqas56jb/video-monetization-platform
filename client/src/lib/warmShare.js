/**
 * Wait until the server has a built share-card JPEG (not the generic fallback).
 */
import { DEPLOY } from '@/lib/deployUrls'

const inflight = new Map()
const ready = new Set()

const API =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  DEPLOY.api

function normalizeApi(url) {
  if (/video-monetization-platform-backend\.vercel\.app/i.test(String(url))) return DEPLOY.api
  return String(url || DEPLOY.api).replace(/\/$/, '')
}

const API_BASE = normalizeApi(API)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function cardHeadUrl(slug, sourceKey) {
  const v = sourceKey ? `?v=${encodeURIComponent(sourceKey)}` : ''
  return `${API_BASE}/api/share-card/${encodeURIComponent(slug)}.jpg${v}`
}

async function headBuilt(slug, sourceKey) {
  try {
    const r = await fetch(cardHeadUrl(slug, sourceKey), {
      method: 'HEAD',
      credentials: 'omit',
    })
    return r.ok && r.headers.get('x-share-card') === 'built'
  } catch {
    return false
  }
}

async function probeHtml(slug) {
  if (!slug || typeof window === 'undefined') return false
  const page = `${window.location.origin}/watch/${encodeURIComponent(slug)}`
  try {
    const r = await fetch(page, { mode: 'cors', credentials: 'omit' })
    if (!r.ok) return false
    const html = await r.text()
    return /property=["']og:image["']/i.test(html) && !/og:title" content="MTONYO\+ —/i.test(html)
  } catch {
    return false
  }
}

export function isShareCardReady(slug) {
  return Boolean(slug && ready.has(slug))
}

export async function prepareShareCard(slug, sourceKey) {
  if (!slug || slug === 'undefined' || typeof window === 'undefined') return false
  const key = `${slug}:${sourceKey || ''}`
  if (ready.has(key)) return true
  const pending = inflight.get(key)
  if (pending) return pending

  const run = (async () => {
    fetch(`${API_BASE}/api/public/videos/${encodeURIComponent(slug)}/share-meta`, {
      credentials: 'omit',
    }).catch(() => {})

    for (let i = 0; i < 12; i++) {
      if (await headBuilt(slug, sourceKey)) {
        ready.add(key)
        return true
      }
      if (i > 2 && (await probeHtml(slug))) {
        ready.add(key)
        return true
      }
      await sleep(400)
    }
    return false
  })()

  inflight.set(key, run)
  try {
    return await run
  } finally {
    inflight.delete(key)
  }
}

export async function waitForShareCard(slug, sourceKey, maxMs = 6000) {
  if (!slug || typeof window === 'undefined') return false
  const key = `${slug}:${sourceKey || ''}`
  if (ready.has(key)) return true
  const pending = inflight.get(key) || prepareShareCard(slug, sourceKey)
  return Promise.race([pending, sleep(maxMs).then(() => ready.has(key))])
}

export function warmSharePreview(slug, sourceKey) {
  if (!slug) return
  const key = `${slug}:${sourceKey || ''}`
  if (ready.has(key)) return
  prepareShareCard(slug, sourceKey).catch(() => {})
}
