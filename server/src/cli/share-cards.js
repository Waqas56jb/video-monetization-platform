#!/usr/bin/env node
/**
 * Burn WhatsApp/Facebook poster JPEGs into share_card_cache for every video.
 *
 *   npm run share:warm
 *
 * Existing catalogue first. New uploads already queue this in the background
 * when the file is ready, so a share can go out without waiting on the sheet.
 */
import { warmAllShareCards } from '../modules/share.routes.js'
import { closePool } from '../db/pool.js'
import { log } from '../lib/logger.js'

try {
  const result = await warmAllShareCards()
  log.ok(
    `share cards in database · stored ${result.stored} · failed ${result.failed} · scanned ${result.scanned}`
  )
  process.exitCode = result.failed && !result.stored ? 1 : 0
} catch (err) {
  log.error('share:warm failed:', err.message)
  process.exitCode = 1
} finally {
  await closePool().catch(() => {})
}
