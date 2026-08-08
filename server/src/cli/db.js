#!/usr/bin/env node
/**
 * Database CLI — everything needed to stand the backend up from a clean
 * Supabase project without touching the dashboard.
 *
 *   npm run db:check     what is configured, and can we connect
 *   npm run db:migrate   apply pending migrations
 *   npm run db:status    per-migration state
 *   npm run db:seed      insert the real starter data
 *   npm run db:reset     drop everything (destructive)
 *   npm run db:setup     reset + migrate + seed, in one go
 */
import { env, capabilities, missingConfig } from '../config/env.js'
import { getPool, closePool, query } from '../db/pool.js'
import { migrate, status, reset } from '../db/migrate.js'
import { seed } from '../db/seed.js'
import { log } from '../lib/logger.js'

const [, , command = 'help'] = process.argv

const banner = () => {
  console.log('\n\x1b[35m  MTONYO+ \x1b[0m backend · database CLI\n')
}

async function check() {
  banner()
  console.log('  configuration')
  const rows = [
    ['database', capabilities.database],
    ['supabase auth (service role)', capabilities.supabaseAuth],
    ['cloudflare stream', capabilities.cloudflareStream],
    ['signed playback keys', capabilities.signedPlayback],
  ]
  for (const [label, ok] of rows) {
    console.log(`   ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}`)
  }

  const missing = missingConfig()
  if (missing.length) {
    console.log('\n  still needed:')
    missing.forEach((m) => console.log(`   · ${m}`))
  }

  if (!capabilities.database) {
    console.log('\n  \x1b[33mCannot connect until DATABASE_URL has a password.\x1b[0m')
    console.log('  Supabase → Project Settings → Database → Reset database password,')
    console.log('  then paste it into server/.env as DATABASE_URL.\n')
    return false
  }

  process.stdout.write('\n  connecting… ')
  try {
    const r = await query('select current_database() db, current_user usr, version() v')
    const { db, usr, v } = r.rows[0]
    console.log('\x1b[32mconnected\x1b[0m')
    console.log(`   database ${db}  ·  user ${usr}`)
    console.log(`   ${String(v).split(',')[0]}\n`)
    return true
  } catch (err) {
    console.log(`\x1b[31mfailed\x1b[0m\n   ${err.message}\n`)
    return false
  }
}

async function showStatus() {
  banner()
  const list = await status()
  if (!list.length) return console.log('  no migrations found\n')
  for (const m of list) {
    const mark =
      m.state === 'applied' ? '\x1b[32m✓\x1b[0m' : m.state === 'changed' ? '\x1b[33m~\x1b[0m' : '\x1b[90m·\x1b[0m'
    const when = m.appliedAt ? new Date(m.appliedAt).toISOString().slice(0, 19).replace('T', ' ') : ''
    console.log(`   ${mark} ${m.name.padEnd(38)} ${m.state.padEnd(8)} ${when}`)
  }
  console.log('')
}

async function main() {
  switch (command) {
    case 'check': {
      const ok = await check()
      process.exitCode = ok ? 0 : 1
      break
    }
    case 'migrate': {
      banner()
      const done = await migrate()
      log.ok(done.length ? `applied ${done.length} migration(s)` : 'already up to date')
      break
    }
    case 'status':
      await showStatus()
      break
    case 'seed': {
      banner()
      await seed()
      break
    }
    case 'reset': {
      banner()
      await reset()
      break
    }
    case 'setup': {
      banner()
      log.info('reset → migrate → seed')
      await reset()
      await migrate()
      await seed()
      log.ok('database ready')
      break
    }
    default:
      banner()
      console.log(`  usage: node src/cli/db.js <command>

    check     show configuration and test the connection
    migrate   apply pending migrations
    status    per-migration state
    seed      insert starter data
    reset     drop everything (destructive)
    setup     reset + migrate + seed
`)
  }
}

main()
  .catch((err) => {
    log.error(err.message)
    if (env.nodeEnv !== 'production' && err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'))
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool().catch(() => {})
  })

// keep the pool from being created for `help`
void getPool
