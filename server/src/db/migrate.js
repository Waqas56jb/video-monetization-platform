import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { getPool } from './pool.js'
import { log } from '../lib/logger.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(HERE, 'migrations')

const checksum = (sql) => crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16)

function files() {
  if (!fs.existsSync(DIR)) return []
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(DIR, name), 'utf8')
      return { name, sql, hash: checksum(sql) }
    })
}

async function ensureTable(client) {
  await client.query(`
    create table if not exists _migrations (
      name       text primary key,
      hash       text not null,
      applied_at timestamptz not null default now()
    )`)
  await client.query('alter table _migrations enable row level security')
  await client.query(
    'revoke all on table _migrations from anon, authenticated, public'
  )
}

/** Which migrations have run, and whether any changed since. */
export async function status() {
  const client = await getPool().connect()
  try {
    await ensureTable(client)
    const { rows } = await client.query('select name, hash, applied_at from _migrations order by name')
    const applied = new Map(rows.map((r) => [r.name, r]))
    return files().map((f) => {
      const rec = applied.get(f.name)
      return {
        name: f.name,
        state: !rec ? 'pending' : rec.hash === f.hash ? 'applied' : 'changed',
        appliedAt: rec?.applied_at ?? null,
      }
    })
  } finally {
    client.release()
  }
}

/**
 * Apply every pending migration, each in its own transaction so a failure
 * leaves the database on the last good migration rather than half-way.
 */
export async function migrate() {
  const client = await getPool().connect()
  const done = []
  try {
    await ensureTable(client)
    const { rows } = await client.query('select name, hash from _migrations')
    const applied = new Map(rows.map((r) => [r.name, r.hash]))

    for (const f of files()) {
      const prev = applied.get(f.name)
      if (prev === f.hash) continue
      if (prev && prev !== f.hash) {
        log.warn(`${f.name} changed after being applied — re-running it`)
      }

      log.info(`applying ${f.name}`)
      await client.query('BEGIN')
      try {
        // Migrations run as an admin so the publication guard lets the
        // seed/lifecycle statements through.
        await client.query("select set_config('app.actor_role', 'admin', true)")
        await client.query(f.sql)
        await client.query(
          `insert into _migrations (name, hash) values ($1, $2)
           on conflict (name) do update set hash = excluded.hash, applied_at = now()`,
          [f.name, f.hash]
        )
        await client.query('COMMIT')
        done.push(f.name)
        log.ok(`applied ${f.name}`)
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw new Error(`${f.name} failed: ${err.message}`)
      }
    }
    return done
  } finally {
    client.release()
  }
}

/** Drop everything this project owns. Destructive — dev only. */
export async function reset() {
  const client = await getPool().connect()
  try {
    log.warn('dropping all MTONYO+ tables and types')
    await client.query(`
      drop table if exists
        ad_impressions, ad_campaigns, video_views, audit_log, withdrawals, earnings,
        purchases, payments, video_deletion_requests, videos, creator_profiles,
        notifications, announcements, password_resets,
        profiles, platform_settings, _migrations cascade;
      drop type if exists
        user_role, account_status, access_type, review_status, video_state,
        payment_status, payment_method, purchase_status, earning_source,
        withdrawal_status, deletion_status,
        notification_kind, announcement_audience cascade;
      drop function if exists
        touch_updated_at, guard_video_publication, block_video_hard_delete,
        sync_premiere_window, current_actor_role, current_actor_id, auth_role,
        is_staff_actor, guard_account_changes cascade;
    `)
    log.ok('reset complete')
  } finally {
    client.release()
  }
}
