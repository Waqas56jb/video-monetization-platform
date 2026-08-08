import pg from 'pg'
import { env, capabilities } from '../config/env.js'
import { log } from '../lib/logger.js'

/**
 * Postgres access through Supabase's transaction pooler (port 6543).
 *
 * The pooler is the right endpoint for an API like this: it hands out a
 * connection per transaction rather than holding one open per client, so we
 * never exhaust Supabase's connection limit. It does mean prepared statements
 * are unavailable, hence `statement_timeout` is set per session instead.
 */
const { Pool } = pg

let pool = null

export function getPool() {
  if (pool) return pool
  if (!capabilities.database) {
    throw new Error(
      'DATABASE_URL is not configured (the password is missing). ' +
        'Set it in server/.env — Supabase → Project Settings → Database.'
    )
  }

  pool = new Pool({
    connectionString: env.databaseUrl,
    // Supabase terminates TLS with its own chain; verifying it from Node needs
    // the Supabase root cert, which we do not ship. Encryption is still on.
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    application_name: 'mtonyo-api',
  })

  pool.on('error', (err) => log.error('idle postgres client error', err.message))
  return pool
}

/** Run a query. Returns the pg result. */
export async function query(text, params = []) {
  const started = Date.now()
  const res = await getPool().query(text, params)
  if (env.verboseSql) {
    log.debug(`sql ${Date.now() - started}ms rows=${res.rowCount} :: ${text.split('\n')[0].trim()}`)
  }
  return res
}

/** Convenience: first row or null. */
export async function one(text, params = []) {
  const { rows } = await query(text, params)
  return rows[0] ?? null
}

/** Convenience: all rows. */
export async function many(text, params = []) {
  const { rows } = await query(text, params)
  return rows
}

/**
 * Run a set of statements in a single transaction.
 *
 * `actorRole` is written into the session as `app.actor_role`; the database
 * trigger that guards publication reads it, which is how "only an admin can
 * approve a video" is enforced in Postgres rather than in application code.
 */
export async function transaction(fn, { actorRole = null, actorId = null } = {}) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    if (actorRole) await client.query('SELECT set_config($1, $2, true)', ['app.actor_role', actorRole])
    if (actorId) await client.query('SELECT set_config($1, $2, true)', ['app.actor_id', actorId])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}
