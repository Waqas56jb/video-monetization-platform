#!/usr/bin/env node
/**
 * Fill videos.width / videos.height from Cloudflare Stream.
 *
 *   cd server && npm run videos:backfill-size
 *
 * New uploads store size when the file becomes ready. Titles encoded before
 * that column existed still play in a 16:9 box until this runs once.
 */
import { many, query, closePool } from '../db/pool.js'
import * as cf from '../lib/cloudflare.js'
import { capabilities } from '../config/env.js'
import { dimensionsFromCloudflare } from '../lib/videoShape.js'
import { log } from '../lib/logger.js'

if (!capabilities.cloudflareStream) {
  log.error('Cloudflare Stream is not configured')
  process.exit(1)
}

try {
  const rows = await many(
    `select id, slug, cloudflare_uid
       from videos
      where deleted_at is null
        and cloudflare_uid is not null
        and (width is null or height is null)
      order by created_at desc`
  )
  log.info(`backfill-dimensions · ${rows.length} video(s) missing width/height`)

  let ok = 0
  let skipped = 0
  let failed = 0
  for (const v of rows) {
    try {
      const remote = await cf.getVideo(v.cloudflare_uid)
      const { width, height } = dimensionsFromCloudflare(remote)
      if (!width || !height) {
        skipped += 1
        log.warn(`${v.slug || v.id} · Cloudflare has no input size yet`)
        continue
      }
      await query('update videos set width = $2, height = $3 where id = $1', [v.id, width, height])
      ok += 1
      log.ok(`${v.slug || v.id} · ${width}×${height}`)
    } catch (err) {
      failed += 1
      log.error(`${v.slug || v.id} · ${err.message}`)
    }
  }

  log.ok(`backfill-dimensions done · saved ${ok} · no size ${skipped} · failed ${failed} · scanned ${rows.length}`)
  process.exitCode = failed && !ok ? 1 : 0
} catch (err) {
  log.error('backfill-dimensions failed:', err.message)
  process.exitCode = 1
} finally {
  await closePool().catch(() => {})
}
