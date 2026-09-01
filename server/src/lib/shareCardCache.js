import { one, query } from '../db/pool.js'
import { log } from './logger.js'

/** Warm instances skip Postgres. Cold starts still hit the table. */
const mem = new Map()
let tableReady = false

/**
 * Three DDL statements, at most once per isolate — and once per isolate even
 * when several requests race.
 *
 * `tableReady` was only set *after* the awaits, so every caller that arrived
 * while the first was still in flight saw `false` and issued its own
 * `create table if not exists` + `alter table` + `revoke`. Concurrent DDL takes
 * locks against each other, and this sat in front of the watch page's video
 * request, so a burst of first requests to a cold isolate serialised on schema
 * work none of them needed.
 *
 * Holding the promise rather than the boolean makes the racers await the same
 * attempt. A failure clears it, so a genuine problem is retried rather than
 * cached as permanent.
 */
let ensuring = null

export async function ensureShareCardTable() {
  if (tableReady) return true
  if (ensuring) return ensuring

  ensuring = (async () => {
    try {
      await query(`
        create table if not exists share_card_cache (
          slug       text primary key,
          video_id   uuid not null,
          jpeg       bytea not null,
          built_at   timestamptz not null default now(),
          source_key text not null
        )`)
      // Runtime create must not re-open PostgREST. 021 missed this; 025 is the
      // schema lock. Keep the same close here if this runs before migrate.
      await query('alter table share_card_cache enable row level security')
      await query('revoke all on table share_card_cache from anon, authenticated, public')
      tableReady = true
      return true
    } catch (err) {
      log.warn('share_card_cache table:', err.message)
      return false
    } finally {
      /* Only a success is remembered, via tableReady. Clearing this lets a
         transient failure be retried instead of poisoning the isolate. */
      ensuring = null
    }
  })()

  return ensuring
}

function asBuffer(value) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  return Buffer.from(value)
}

/**
 * Why the last read did not return a card.
 */
export let lastReadMiss = null

export async function readCachedCard(slug, key) {
  const hit = mem.get(slug)
  if (hit && hit.sourceKey === key) return hit.jpeg

  try {
    await ensureShareCardTable()
  } catch (err) {
    lastReadMiss = 'table:' + err.message.slice(0, 40)
    return null
  }

  try {
    const row = await one('select jpeg, source_key from share_card_cache where slug = $1', [slug])
    if (!row) {
      lastReadMiss = 'no-row'
      return null
    }
    if (row.source_key !== key) {
      lastReadMiss = 'key-differs'
      return null
    }
    const jpeg = asBuffer(row.jpeg)
    if (!jpeg) {
      lastReadMiss = 'jpeg-null'
      return null
    }
    if (!(jpeg.length > 1000)) {
      lastReadMiss = 'jpeg-short:' + jpeg.length
      return null
    }
    mem.set(slug, { jpeg, sourceKey: key })
    lastReadMiss = null
    return jpeg
  } catch (err) {
    lastReadMiss = 'threw:' + err.message.slice(0, 40)
    log.warn('share card cache read:', err.message)
    return null
  }
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

export async function readCardStatus(slug, sourceKey) {
  if (!slug || !sourceKey) return 'fallback'
  try {
    await ensureShareCardTable()
    /**
     * Ask Postgres for the size. Do not fetch the picture to measure it.
     *
     * This selected the whole `jpeg` column — a 1200×630 social card, 60–250 KB
     * — serialised out of the database, across the pool and into the function,
     * on every call, to compute one integer that was then thrown away. And this
     * runs inside the share meta on `GET /api/videos/:id`, which is the request
     * the watch page waits on before it can build the player: a sixth of a
     * megabyte of JPEG on the path to the first frame of every video.
     *
     * `octet_length` answers the same question from the row header.
     */
    const row = await one(
      'select source_key, octet_length(jpeg) as bytes from share_card_cache where slug = $1',
      [slug]
    )
    if (!row) return 'fallback'
    if (row.source_key !== sourceKey) return 'building'
    if (Number(row.bytes || 0) < 1000) return 'fallback'
    return 'ready'
  } catch {
    return 'fallback'
  }
}
