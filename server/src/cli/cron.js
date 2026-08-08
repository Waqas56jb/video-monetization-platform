#!/usr/bin/env node
/**
 * Scheduled jobs, runnable from any cron runner:
 *   node src/cli/cron.js premieres
 *
 * The same work is exposed over HTTP at POST /api/jobs/premiere-expiry
 * (guarded by CRON_SECRET) for platforms like Vercel Cron.
 */
import { runPremiereExpiry } from '../jobs/premiere.js'
import { closePool } from '../db/pool.js'
import { log } from '../lib/logger.js'

const [, , job = 'premieres', flag] = process.argv
const dryRun = flag === '--dry-run'

async function main() {
  switch (job) {
    case 'premieres': {
      const result = await runPremiereExpiry({ dryRun })
      if (!result.ran) return log.warn(result.reason)
      log.ok(
        dryRun
          ? `${result.checked} premiere(s) would switch to Free With Ads`
          : `checked ${result.checked}, switched ${result.switched.length} to Free With Ads`
      )
      result.switched.forEach((v) => console.log(`   · ${v.title}`))
      break
    }
    default:
      console.log('usage: node src/cli/cron.js premieres [--dry-run]')
  }
}

main()
  .catch((err) => {
    log.error(err.message)
    process.exitCode = 1
  })
  .finally(() => closePool().catch(() => {}))
