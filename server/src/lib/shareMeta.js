import { createHash } from 'node:crypto'
import { one } from '../db/pool.js'
import { env } from '../config/env.js'
import { publicOgCardUrl, publicWatchUrl } from './publicWatchUrl.js'
import { log } from './logger.js'
import { SHARE_CARD_BUCKET, versionedCardPath } from './shareCardObjectPath.js'

export const SLUG_RE = /^[a-z0-9-]+$/

/** Cache-busting token tied to poster + title + creator. */
export function shareSourceKey(video) {
  const thumb =
    video?.custom_thumbnail_url ||
    video?.thumbnail_url ||
    video?.preview_uid ||
    video?.cloudflare_uid ||
    ''
  /**
   * The creator's public name, however this row spelled it.
   *
   * Two queries feed this function and they build `creator_name` differently:
   * buildShareCard and loadShareMeta select `coalesce(cp.display_name,
   * p.full_name)`, while videos.routes' SELECT_PUBLIC selects `p.full_name` and
   * puts the display name in a separate `creator_display`. So the same video
   * hashed to two different keys depending on who asked.
   *
   * That was harmless while the key only ever round-tripped within one call
   * site. It stopped being harmless when migration 030 made the route compare
   * its own key against the one the builder stored: six of eight published
   * videos mismatched, reported 'building' for a card that was current, and
   * queued a rebuild on every single watch request.
   *
   * Resolving the display name here makes both shapes agree without changing
   * what any endpoint returns — SELECT_PUBLIC still reports `p.full_name` as
   * the creator's name; only the hash sees the same value from both sides.
   */
  const creator = video?.creator_display || video?.creator_name || ''
  const raw = `${thumb}|${video?.title || ''}|${creator}`
  return createHash('sha1').update(raw).digest('hex').slice(0, 10)
}

/**
 * WhatsApp drops images whose URL looks like an API route (`/api/...`).
 * The public site serves the same JPEG at `/og/card/{slug}.jpg`, which
 * looks like a file, sits on the same origin as og:url, and is cached
 * at the CDN after the first fetch.
 */
export function shareCardUrl(slug, sourceKey, _cardStatus = 'ready') {
  const url = publicOgCardUrl(env.publicWebUrl, slug)
  if (!url) return null
  return sourceKey ? `${url}?v=${encodeURIComponent(sourceKey)}` : url
}

/** Public Supabase Storage URL when bucket is configured. */
export function publicStorageCardUrl(slug, sourceKey) {
  const path = versionedCardPath(slug, sourceKey)
  if (!env.supabase?.url || !path) return null
  return `${env.supabase.url.replace(/\/$/, '')}/storage/v1/object/public/${SHARE_CARD_BUCKET}/${path}`
}

function shareUrlWithSource(watchUrl, sourceKey) {
  if (!watchUrl) return null
  if (!sourceKey) return watchUrl
  return `${watchUrl}${watchUrl.includes('?') ? '&' : '?'}s=${encodeURIComponent(sourceKey)}`
}

/**
 * Card status from the row, not from a second table.
 *
 * This called `readCardStatus`, which calls `ensureShareCardTable`, which issues
 * three DDL statements before its select — on the request the watch page waits
 * on before it can build the player. Four round trips to learn one boolean that
 * changes at most once per card build.
 *
 * `videos.card_source_key` (migration 030) holds the answer on the row this
 * function is already handed. It stores the key rather than a flag, so the
 * staleness test readCardStatus made survives: a card built before the title or
 * poster changed no longer matches, and is rebuilt. A boolean could not express
 * that — nothing would ever set it back — so a drifted card would claim to be
 * ready for ever.
 *
 * A row selected without the column reads as not ready, which is the safe
 * direction: a loading pill and a queued build, rather than promising a card
 * that is not there.
 */
export async function sharePayloadFromRow(row) {
  if (!row?.slug || !(row.is_published && row.review_status === 'approved')) return null
  const sourceKey = shareSourceKey(row)
  const watchUrl = publicWatchUrl(env.publicWebUrl, row.slug)
  const cardStatus = row.card_source_key === sourceKey ? 'ready' : 'building'

  if (cardStatus !== 'ready') {
    log.error(`share card missing for approved video slug=${row.slug} status=${cardStatus}`)
    import('./buildShareCard.js').then((m) => m.buildShareCard(row.id || row.slug)).catch(() => {})
  }

  return {
    slug: row.slug,
    title: row.title,
    creator: row.creator_name || null,
    sourceKey,
    cardUrl: shareCardUrl(row.slug, sourceKey, cardStatus),
    watchUrl,
    shareUrl: shareUrlWithSource(watchUrl, sourceKey),
    cardStatus,
  }
}

export async function loadShareMeta(slug) {
  if (!SLUG_RE.test(slug)) return null
  const video = await one(
    /**
     * `v.*` rather than a column list, so this survives being deployed before
     * migration 030 runs.
     *
     * Naming `v.card_source_key` explicitly would make this query fail outright until
     * the column exists — and this is the crawler's share-meta path, so the
     * failure would land on WhatsApp previews, which is precisely what the
     * previous tier was fixing. With `v.*`, a missing column simply reads as
     * `undefined`, the status falls back to 'building', and a rebuild is queued.
     * Slower, correct, and self-correcting the moment the migration lands.
     */
    `select v.*,
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
  const watchUrl = publicWatchUrl(env.publicWebUrl, video.slug)
  /* Same as sharePayloadFromRow: the key rides on the row this query already
     fetched, instead of a second table plus a schema check. */
  const cardStatus = video.card_source_key === sourceKey ? 'ready' : 'building'

  if (cardStatus !== 'ready') {
    log.error(`share card missing for approved video slug=${video.slug} status=${cardStatus}`)
    import('./buildShareCard.js').then((m) => m.buildShareCard(video.id)).catch(() => {})
  }

  return {
    slug: video.slug,
    title: video.title,
    description: video.description || null,
    creator: video.creator_name || null,
    verified: Boolean(video.creator_verified),
    durationSeconds: video.duration_seconds,
    freePreviewSeconds: video.free_preview_seconds,
    sourceKey,
    cardUrl: shareCardUrl(video.slug, sourceKey, cardStatus),
    watchUrl,
    shareUrl: shareUrlWithSource(watchUrl, sourceKey),
    cardStatus,
    isPublic: true,
  }
}
