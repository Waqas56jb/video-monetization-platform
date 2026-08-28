#!/usr/bin/env node
/**
 * Cut missing free-preview clips for published, ready videos.
 *
 *   cd server && npm run previews:backfill
 *
 * Watch no longer waits on Cloudflare at Play time. Anything already live
 * without a preview_uid needs this once so unpaid viewers get a clip immediately.
 */
import { many, closePool } from '../db/pool.js'
import { ensureClips } from '../modules/playback.routes.js'
import { log } from '../lib/logger.js'

try {
  const rows = await many(
    `select id, slug, title
       from videos
      where state = 'ready'
        and preview_uid is null
        and is_published = true
        and deleted_at is null
      order by published_at desc nulls last`
  )
  log.info(`backfill-previews · ${rows.length} published video(s) missing a preview clip`)

  let ok = 0
  let failed = 0
  for (const v of rows) {
    try {
      const result = await ensureClips(v.id)
      if (result?.preview) {
        ok += 1
        log.ok(`${v.slug || v.id} · preview ${result.preview}`)
      } else {
        failed += 1
        log.warn(`${v.slug || v.id} · no clip created (not ready, no duration, or Cloudflare skipped)`)
      }
    } catch (err) {
      failed += 1
      log.error(`${v.slug || v.id} · ${err.message}`)
    }
  }

  log.ok(`backfill-previews done · created ${ok} · failed ${failed} · scanned ${rows.length}`)
  process.exitCode = failed && !ok ? 1 : 0
} catch (err) {
  log.error('backfill-previews failed:', err.message)
  process.exitCode = 1
} finally {
  await closePool().catch(() => {})
}
