import { one, many } from '../db/pool.js'
import { capabilities, env } from '../config/env.js'
import { slugFallbacks } from './videoKey.js'
import { brandShareCard } from './shareCard.js'
import { readCachedCard, writeCachedCard, ensureShareCardTable } from './shareCardCache.js'
import { uploadShareCardToStorage } from './shareCardStorage.js'
import { shareSourceKey, shareCardUrl } from './shareMeta.js'
import { log } from './logger.js'
import * as cf from './cloudflare.js'

const composing = new Map()

async function videoByKey(key) {
  const keys = slugFallbacks(String(key || ''))
  return one(
    `select v.*, coalesce(cp.display_name, p.full_name) as creator_name
       from videos v
       join profiles p on p.id = v.creator_id
       left join creator_profiles cp on cp.user_id = v.creator_id
      where v.deleted_at is null
        and (v.id::text = $1 or v.slug = any($2::text[]))`,
    [key, keys]
  )
}

async function fetchPosterBytes(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const img = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) })
      if (!img.ok) continue
      const type = (img.headers.get('content-type') || '').split(';')[0]
      if (!/^image\//i.test(type) && type !== 'application/octet-stream') continue
      const buf = Buffer.from(await img.arrayBuffer())
      if (buf.length < 1000) continue
      return buf
    } catch {
      /* retry */
    }
  }
  return null
}

function pingLinkPreview(slug) {
  const watchUrl = `${env.publicWebUrl}/watch/${slug}`
  fetch(`https://graph.facebook.com/?id=${encodeURIComponent(watchUrl)}&scrape=true`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  }).catch(() => {})
}

async function composeOnce(video) {
  const slug = video.slug || String(video.id)
  const key = shareSourceKey(video)
  const started = Date.now()

  const cached = await readCachedCard(slug, key)
  if (cached) {
    uploadShareCardToStorage(slug, key, cached).catch(() => {})
    pingLinkPreview(slug)
    return { jpeg: cached, sourceKey: key, skipped: true, ms: Date.now() - started }
  }

  let poster = null
  if (video.custom_thumbnail_url && /^https?:\/\//i.test(video.custom_thumbnail_url)) {
    poster = await fetchPosterBytes(video.custom_thumbnail_url)
  }
  if (!poster) {
    const posterUid = video.preview_uid || video.cloudflare_uid
    if (posterUid && capabilities.signedPlayback) {
      const token = cf.signPlaybackToken(posterUid, { expiresInSeconds: 3600 })
      const src = `https://videodelivery.net/${token}/thumbnails/thumbnail.jpg?time=15s&width=1200&height=630&fit=crop`
      poster = await fetchPosterBytes(src)
    }
  }
  if (!poster && video.thumbnail_url && /^https?:\/\//i.test(video.thumbnail_url)) {
    poster = await fetchPosterBytes(video.thumbnail_url)
  }
  if (!poster) {
    log.warn(`share card build slug=${slug}: no poster bytes`)
    return { jpeg: null, sourceKey: key, skipped: false, ms: Date.now() - started, error: 'no-poster' }
  }

  const jpeg = await brandShareCard(poster, {
    title: video.title,
    creator: video.creator_name,
  })
  await writeCachedCard(slug, video.id, key, jpeg)
  await uploadShareCardToStorage(slug, key, jpeg).catch(() => {})
  pingLinkPreview(slug)
  log.info(`share card built slug=${slug} bytes=${jpeg.length} ms=${Date.now() - started}`)
  return { jpeg, sourceKey: key, skipped: false, ms: Date.now() - started }
}

/**
 * Compose, cache, and upload a share card. Idempotent when source_key matches.
 * Errors are logged; callers should catch and never fail the parent request.
 */
export async function buildShareCard(videoId) {
  const video = await videoByKey(videoId)
  if (!video?.slug) return { ok: false, reason: 'no-video' }

  const slug = video.slug
  const pending = composing.get(slug)
  if (pending) return pending

  const run = composeOnce(video)
    .then((result) => ({
      ok: Boolean(result.jpeg),
      slug,
      sourceKey: result.sourceKey,
      cardUrl: shareCardUrl(slug, result.sourceKey),
      bytes: result.jpeg?.length || 0,
      skipped: result.skipped,
      ms: result.ms,
      error: result.error || null,
    }))
    .catch((err) => {
      log.error(`share card build slug=${slug}:`, err.message)
      return { ok: false, slug, error: err.message }
    })
    .finally(() => composing.delete(slug))

  composing.set(slug, run)
  return run
}

/** Build with a time budget — used by /ensure safety net only. */
export async function ensureShareCard(videoId, { budgetMs = 8000 } = {}) {
  const video = await videoByKey(videoId)
  if (!video?.slug) {
    return { ready: false, cardStatus: 'fallback', cardUrl: null }
  }

  const sourceKey = shareSourceKey(video)
  const cached = await readCachedCard(video.slug, sourceKey)
  if (cached) {
    return {
      ready: true,
      cardStatus: 'ready',
      cardUrl: shareCardUrl(video.slug, sourceKey),
      sourceKey,
    }
  }

  const result = await Promise.race([
    buildShareCard(video.id),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, timedOut: true }), budgetMs)),
  ])

  const fresh = await readCachedCard(video.slug, sourceKey)
  const ready = Boolean(fresh)
  return {
    ready,
    cardStatus: ready ? 'ready' : result.timedOut ? 'building' : 'fallback',
    cardUrl: shareCardUrl(video.slug, sourceKey),
    sourceKey,
  }
}

export async function readCardStatus(slug, sourceKey) {
  if (!slug || !sourceKey) return 'fallback'
  try {
    await ensureShareCardTable()
    const row = await one('select source_key, jpeg from share_card_cache where slug = $1', [slug])
    if (!row) return 'fallback'
    if (row.source_key !== sourceKey) return 'building'
    const jpeg = Buffer.isBuffer(row.jpeg) ? row.jpeg : Buffer.from(row.jpeg || [])
    if (jpeg.length < 1000) return 'fallback'
    return 'ready'
  } catch {
    return 'fallback'
  }
}

async function videosForRebuild({ slug, all, stale } = {}) {
  await ensureShareCardTable()
  if (slug) {
    const video = await videoByKey(slug)
    return video ? [video] : []
  }

  const rows = await many(
    `select v.*, coalesce(cp.display_name, p.full_name) as creator_name
       from videos v
       join profiles p on p.id = v.creator_id
       left join creator_profiles cp on cp.user_id = v.creator_id
      where v.deleted_at is null
        and v.slug is not null
        and v.slug <> ''
        and v.is_published = true
        and v.review_status = 'approved'
        ${all ? '' : ''}
      order by v.published_at desc nulls last, v.created_at desc`
  )

  if (all) return rows

  if (stale) {
    const out = []
    for (const video of rows) {
      const key = shareSourceKey(video)
      const status = await readCardStatus(video.slug, key)
      if (status !== 'ready') out.push(video)
    }
    return out
  }

  return rows
}

/** Rebuild share cards with bounded concurrency. */
export async function rebuildShareCards({ slug, all = false, stale = false, concurrency = 3 } = {}) {
  const videos = await videosForRebuild({ slug, all, stale })
  const results = []
  let i = 0

  async function worker() {
    while (i < videos.length) {
      const idx = i++
      const video = videos[idx]
      const started = Date.now()
      try {
        const built = await buildShareCard(video.id)
        results.push({
          slug: video.slug,
          status: built.ok ? (built.skipped ? 'skipped' : 'built') : 'failed',
          ms: built.ms ?? Date.now() - started,
          bytes: built.bytes || 0,
          error: built.error || null,
        })
      } catch (err) {
        results.push({
          slug: video.slug,
          status: 'failed',
          ms: Date.now() - started,
          bytes: 0,
          error: err.message,
        })
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, videos.length || 1) }, () => worker())
  await Promise.all(workers)
  return { scanned: videos.length, results }
}

/** Fire-and-forget rebuild for approved+published videos when metadata changes. */
export function queueShareCardBuild(videoId) {
  if (!videoId) return
  buildShareCard(videoId).catch(() => {})
}

/** Rebuild every live video for a creator (e.g. display name change). */
export async function rebuildShareCardsForCreator(creatorId) {
  const rows = await many(
    `select id from videos
      where creator_id = $1 and deleted_at is null
        and is_published = true and review_status = 'approved'`,
    [creatorId]
  )
  for (const row of rows) {
    await buildShareCard(row.id).catch(() => {})
  }
}
