#!/usr/bin/env node
/**
 * Rebuild and re-upload the share card for every approved+published video.
 *   node server/scripts/backfill-share-cards.js
 *
 * This used to pass `{ stale: true }`, which filters on `readCardStatus` — and
 * that reads the `share_card_cache` table only. It knows nothing about the
 * Supabase Storage bucket, so a card present in the database and absent from the
 * bucket reads as 'ready' and was excluded. Which is to say: the one repair this
 * script is reached for, it could not perform. With the service-role key unset
 * for the whole life of the deployment, that is every card — and the script
 * would print an empty table and exit 0, looking like a success.
 *
 * `{ all: true }` visits every video instead. Cards already in the database hit
 * the cached early-return in composeOnce, which still uploads, so the common
 * case stays cheap: no Sharp, no Cloudflare fetch, just the bucket write that
 * was missing.
 */
import { rebuildShareCards } from '../src/lib/buildShareCard.js'
import { closePool } from '../src/db/pool.js'
import { log } from '../src/lib/logger.js'

function printTable(results) {
  const header = `${'slug'.padEnd(36)} ${'status'.padEnd(8)} ${'bucket'.padEnd(8)} ${'ms'.padStart(6)} ${'bytes'.padStart(8)}`
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const row of results) {
    /* 'no' here with status 'skipped' is the signature of a missing
       SUPABASE_SERVICE_ROLE_KEY: the card is in the database and the bucket
       never took it. That is the state this script exists to get out of. */
    const bucket = row.uploaded ? 'ok' : 'no'
    console.log(
      `${String(row.slug).padEnd(36)} ${String(row.status).padEnd(8)} ${bucket.padEnd(8)} ${String(row.ms).padStart(6)} ${String(row.bytes).padStart(8)}`
    )
    if (row.error) console.log(`  error: ${row.error}`)
  }
}

try {
  const { scanned, results } = await rebuildShareCards({ all: true, concurrency: 3 })
  printTable(results)
  const built = results.filter((r) => r.status === 'built').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed').length
  log.ok(`backfill scanned=${scanned} built=${built} skipped=${skipped} failed=${failed}`)
  process.exitCode = failed && !built ? 1 : 0
} catch (err) {
  log.error('backfill failed:', err.message)
  process.exitCode = 1
} finally {
  await closePool().catch(() => {})
}
