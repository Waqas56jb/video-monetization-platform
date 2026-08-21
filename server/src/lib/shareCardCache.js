import { one, query } from '../db/pool.js'
import { log } from './logger.js'

/** Warm instances skip Postgres. Cold starts still hit the table. */
const mem = new Map()
let tableReady = false

export async function ensureShareCardTable() {
  if (tableReady) return true
  try {
    await query(`
      create table if not exists share_card_cache (
        slug       text primary key,
        video_id   uuid not null,
        jpeg       bytea not null,
        built_at   timestamptz not null default now(),
        source_key text not null
      )`)
    tableReady = true
    return true
  } catch (err) {
    log.warn('share_card_cache table:', err.message)
    return false
  }
}

/** Rebuild the JPEG when title, creator or poster source changes. */
export function cardSourceKey(video) {
  return [
    video.id,
    video.title,
    video.creator_name || '',
    video.updated_at || '',
    video.custom_thumbnail_url || video.thumbnail_url || video.preview_uid || video.cloudflare_uid || '',
  ].join('|')
}

function asBuffer(value) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  return Buffer.from(value)
}

export async function readCachedCard(slug, key) {
  const hit = mem.get(slug)
  if (hit && hit.sourceKey === key) return hit.jpeg

  await ensureShareCardTable()
  try {
    const row = await one('select jpeg, source_key from share_card_cache where slug = $1', [slug])
    if (row && row.source_key === key) {
      const jpeg = asBuffer(row.jpeg)
      if (jpeg?.length > 1000) {
        mem.set(slug, { jpeg, sourceKey: key })
        return jpeg
      }
    }
  } catch (err) {
    log.warn('share card cache read:', err.message)
  }
  return null
}

export async function writeCachedCard(slug, videoId, key, jpeg) {
  mem.set(slug, { jpeg, sourceKey: key })
  await ensureShareCardTable()
  try {
    await query(
      `insert into share_card_cache (slug, video_id, jpeg, source_key)
       values ($1, $2, $3, $4)
       on conflict (slug) do update
         set jpeg = excluded.jpeg,
             video_id = excluded.video_id,
             source_key = excluded.source_key,
             built_at = now()`,
      [slug, videoId, jpeg, key]
    )
  } catch (err) {
    log.warn('share card cache write:', err.message)
  }
}
