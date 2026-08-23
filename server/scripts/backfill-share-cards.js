#!/usr/bin/env node
/**
 * Backfill share_card_cache for approved+published videos (missing or stale source_key).
 *   node server/scripts/backfill-share-cards.js
 */
import { rebuildShareCards } from '../src/lib/buildShareCard.js'
import { closePool } from '../src/db/pool.js'
import { log } from '../src/lib/logger.js'

function printTable(results) {
  const header = `${'slug'.padEnd(36)} ${'status'.padEnd(8)} ${'ms'.padStart(6)} ${'bytes'.padStart(8)}`
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const row of results) {
    console.log(
      `${String(row.slug).padEnd(36)} ${String(row.status).padEnd(8)} ${String(row.ms).padStart(6)} ${String(row.bytes).padStart(8)}`
    )
    if (row.error) console.log(`  error: ${row.error}`)
  }
}

try {
  const { scanned, results } = await rebuildShareCards({ stale: true, concurrency: 3 })
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
