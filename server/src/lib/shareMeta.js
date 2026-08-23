import { createHash } from 'node:crypto'
import { one } from '../db/pool.js'
import { env, capabilities } from '../config/env.js'
import { publicWatchUrl } from './publicWatchUrl.js'

export const SLUG_RE = /^[a-z0-9-]+$/

/** Cache-busting token tied to poster + title + creator. */
export function shareSourceKey(video) {
  const thumb =
    video?.custom_thumbnail_url ||
    video?.thumbnail_url ||
    video?.preview_uid ||
    video?.cloudflare_uid ||
    ''
  const raw = `${thumb}|${video?.title || ''}|${video?.creator_name || ''}`
  return createHash('sha1').update(raw).digest('hex').slice(0, 10)
}

export function shareCardUrl(slug, sourceKey) {
  if (capabilities.serviceRole) {
    const storage = publicStorageCardUrl(slug, sourceKey)
    if (storage) return storage
  }
  const base = String(env.serverPublicUrl || env.publicWebUrl).replace(/\/$/, '')
  const v = sourceKey ? `?v=${encodeURIComponent(sourceKey)}` : ''
  return `${base}/api/share-card/${encodeURIComponent(slug)}.jpg${v}`
}

/** Public Supabase Storage URL when bucket is configured. */
export function publicStorageCardUrl(slug, sourceKey) {
  if (!env.supabase?.url || !sourceKey || !slug) return null
  return `${env.supabase.url.replace(/\/$/, '')}/storage/v1/object/public/share-cards/${slug}-${sourceKey}.jpg`
}

export function sharePayloadFromRow(row) {
  if (!row?.slug || !(row.is_published && row.review_status === 'approved')) return null
  const sourceKey = shareSourceKey(row)
  return {
    slug: row.slug,
    title: row.title,
    creator: row.creator_name || null,
    sourceKey,
    cardUrl: shareCardUrl(row.slug, sourceKey),
    watchUrl: publicWatchUrl(env.publicWebUrl, row.slug),
  }
}

export async function loadShareMeta(slug) {
  if (!SLUG_RE.test(slug)) return null
  const video = await one(
    `select v.id, v.slug, v.title, v.description, v.thumbnail_url, v.custom_thumbnail_url,
            v.preview_uid, v.cloudflare_uid, v.duration_seconds, v.free_preview_seconds,
            v.is_published, v.review_status,
            coalesce(cp.display_name, p.full_name) as creator_name,
            coalesce(cp.verified, false) as creator_verified
       from videos v
       join profiles p on p.id = v.creator_id
       left join creator_profiles cp on cp.user_id = v.creator_id
      where v.deleted_at is null
        and v.slug = $1`,
    [slug]
  )
  if (!video) return null
  if (!(video.is_published && video.review_status === 'approved')) return null

  const sourceKey = shareSourceKey(video)
  return {
    slug: video.slug,
    title: video.title,
    description: video.description || null,
    creator: video.creator_name || null,
    verified: Boolean(video.creator_verified),
    durationSeconds: video.duration_seconds,
    freePreviewSeconds: video.free_preview_seconds,
    sourceKey,
    cardUrl: shareCardUrl(video.slug, sourceKey),
    watchUrl: publicWatchUrl(env.publicWebUrl, video.slug),
    isPublic: true,
  }
}
