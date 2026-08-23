#!/usr/bin/env node
/**
 * Backfill share_card_cache for all approved+published videos.
 *   node server/scripts/backfill-share-cards.js
 */
import { warmAllShareCards } from '../src/modules/share.routes.js'
import { many } from '../src/db/pool.js'
import { uploadShareCardToStorage } from '../src/lib/shareCardStorage.js'
import { closePool } from '../src/db/pool.js'
import { log } from '../src/lib/logger.js'

async function uploadExisting() {
  const rows = await many('select slug, source_key, jpeg from share_card_cache')
  let ok = 0
  for (const row of rows) {
    if (await uploadShareCardToStorage(row.slug, row.source_key, row.jpeg)) ok += 1
  }
  log.ok(`storage upload ok=${ok} total=${rows.length}`)
}

try {
  const result = await warmAllShareCards()
  log.ok(`backfill stored=${result.stored} failed=${result.failed} scanned=${result.scanned}`)
  await uploadExisting()
  process.exitCode = result.failed && !result.stored ? 1 : 0
} catch (err) {
  log.error('backfill failed:', err.message)
  process.exitCode = 1
} finally {
  await closePool().catch(() => {})
}
