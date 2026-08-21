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
/**
 * What the stored card was built from.
 *
 * Every part of this has to be a plain string that means the same thing
 * wherever it is computed. `updated_at` arrives from the driver as a Date, and
 * joining a Date renders it in the running process's locale and timezone --
 * "Fri Aug 21 2026 22:11:45 GMT+0000 (Coordinated Universal Time)" where the
 * card was written, "Sat Aug 22 2026 03:11:45 GMT+0500 (Pakistan Standard
 * Time)" where it was read. The same instant, two different keys, so the
 * comparison could never succeed and every share rebuilt the JPEG from
 * scratch. Measured against production: X-OG-Cache reported miss on every
 * request, for every video, with all eight rows sitting in the table.
 *
 * An epoch number cannot do that. Neither can the rest, which are already
 * strings, but they are made explicit so nothing here depends on how a value
 * happens to print.
 */
export function cardSourceKey(video) {
  const stamp = video.updated_at ? new Date(video.updated_at).getTime() : 0
  return [
    String(video.id ?? ''),
    String(video.title ?? ''),
    String(video.creator_name ?? ''),
    String(stamp),
    String(
      video.custom_thumbnail_url ||
        video.thumbnail_url ||
        video.preview_uid ||
        video.cloudflare_uid ||
        ''
    ),
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
