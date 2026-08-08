#!/usr/bin/env node
/**
 * Find Cloudflare videos the platform has no record of, and optionally remove
 * them.
 *
 *   npm run cf:orphans           list them
 *   npm run cf:orphans -- --delete   remove them
 *
 * These accumulate on their own: a creator starts an upload and closes the tab,
 * a phone loses signal halfway, a browser crashes. Cloudflare keeps the
 * half-finished asset and it counts against the account's storage minutes
 * forever. Nothing in the normal flow ever cleans them up, because nothing in
 * the normal flow knows they exist.
 *
 * Safe by default: it prints what it found and changes nothing unless asked.
 * Anything referenced by a row in `videos` — including preview and social
 * clips — is never touched.
 */
import { query, closePool } from '../db/pool.js'
import { env, capabilities } from '../config/env.js'
import { deleteVideo } from '../lib/cloudflare.js'
import { log } from '../lib/logger.js'

const shouldDelete = process.argv.includes('--delete')
const API = `https://api.cloudflare.com/client/v4/accounts/${env.cloudflare.accountId}/stream`

console.log('\n\x1b[35m  MTONYO+ \x1b[0m orphaned Cloudflare videos\n')

if (!capabilities.cloudflareStream) {
  log.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in server/.env')
  process.exit(1)
}

try {
  /* ---- everything Cloudflare is holding, page by page ---- */
  const remote = []
  let before = null
  for (let page = 0; page < 50; page++) {
    const url = new URL(API)
    url.searchParams.set('limit', '1000')
    if (before) url.searchParams.set('before', before)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${env.cloudflare.apiToken}` } })
    const json = await res.json()
    if (!json.success) throw new Error((json.errors || []).map((e) => e.message).join('; '))

    const batch = json.result || []
    remote.push(...batch)
    if (batch.length < 1000) break
    before = batch[batch.length - 1].created
  }

  /* ---- everything the database knows about ---- */
  const { rows } = await query(
    `select cloudflare_uid, preview_uid, social_clip_uid from videos`
  )
  const known = new Set(
    rows.flatMap((r) => [r.cloudflare_uid, r.preview_uid, r.social_clip_uid]).filter(Boolean)
  )

  const orphans = remote.filter((v) => !known.has(v.uid))
  const minutes = (v) => (Number(v.duration) || 0) / 60

  console.log(`  on Cloudflare: ${remote.length}`)
  console.log(`  known here:    ${known.size}`)
  console.log(`  orphaned:      ${orphans.length}\n`)

  if (!orphans.length) {
    log.ok('nothing to clean up')
  } else {
    for (const v of orphans) {
      const name = v.meta?.name || '(no name)'
      const state = v.status?.state || 'unknown'
      const age = v.created ? new Date(v.created).toISOString().slice(0, 10) : '—'
      console.log(`   · ${v.uid}  ${state.padEnd(14)} ${age}  ${minutes(v).toFixed(2)}m  ${name}`)
    }

    const wasted = orphans.reduce((n, v) => n + minutes(v), 0)
    console.log(`\n  wasting ${wasted.toFixed(2)} storage minutes\n`)

    if (shouldDelete) {
      let removed = 0
      for (const v of orphans) {
        try {
          await deleteVideo(v.uid)
          removed++
        } catch (err) {
          log.warn(`could not delete ${v.uid}: ${err.message}`)
        }
      }
      log.ok(`removed ${removed} orphaned video(s)`)
    } else {
      console.log('  Run with --delete to remove them:\n')
      console.log('    npm run cf:orphans -- --delete\n')
    }
  }
} catch (err) {
  log.error(err.message)
  process.exitCode = 1
} finally {
  await closePool().catch(() => {})
}
