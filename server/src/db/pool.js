import pg from 'pg'
import { env, capabilities } from '../config/env.js'
import { log } from '../lib/logger.js'

/**
 * Postgres access through Supabase's transaction pooler (port 6543).
 *
 * The API has run on two hosts with opposite shapes, and this file has to suit
 * whichever it is on — see `getPool` for the sizing and why it flips.
 *
 * Serverless (Vercel): many isolates, each frozen between invocations, each
 * holding its own pool. A module-level Pool cached on globalThis is reused while
 * an isolate is warm, so a request does not open a fresh TCP/TLS session.
 *
 * Persistent (Railway, and any `npm start`): one process, one pool, for the life
 * of the deployment. The globalThis cache is then only guarding against a double
 * import, which is still worth having and costs nothing.
 *
 * DATABASE_URL must be the transaction-mode pooler:
 *   postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres
 * Port 5432 is the session pooler or the direct host — both hold a backend
 * per client and will exhaust the connection limit under serverless traffic.
 */
const { Pool } = pg

const GLOBAL_KEY = '__mtonyoPgPool'

/** Small local parse so this module keeps its single dependency on env. */
const int = (v, dflt) => {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : dflt
}

function existingPool() {
  return globalThis[GLOBAL_KEY] || null
}

/** Host/port only — never log the password. */
export function databaseEndpointInfo(url = env.databaseUrl) {
  try {
    const u = new URL(url)
    const port = u.port || '5432'
    const host = u.hostname || ''
    return {
      host,
      port,
      isPoolerHost: host.includes('pooler.supabase.com'),
      isTransactionMode: port === '6543',
      isDirectHost: /^db\.[a-z0-9]+\.supabase\.co$/i.test(host),
    }
  } catch {
    return {
      host: '',
      port: '',
      isPoolerHost: false,
      isTransactionMode: false,
      isDirectHost: false,
      invalid: true,
    }
  }
}

let pool = existingPool()
let warnedEndpoint = false

function warnIfNotTransactionPooler(info) {
  if (warnedEndpoint) return
  warnedEndpoint = true
  if (info.invalid) {
    log.warn('DATABASE_URL could not be parsed')
    return
  }
  if (info.isTransactionMode && info.isPoolerHost) return
  log.warn(
    `DATABASE_URL is ${info.host}:${info.port} — use the Supabase transaction pooler ` +
      `(host *.pooler.supabase.com, port 6543). Direct/session URLs (port 5432) open a ` +
      `new backend per serverless invocation and will exhaust the connection limit.`
  )
}

export function getPool() {
  if (pool) return pool
  const cached = existingPool()
  if (cached) {
    pool = cached
    return pool
  }
  if (!capabilities.database) {
    throw new Error(
      'DATABASE_URL is not configured (the password is missing). ' +
        'Set it in server/.env — Supabase → Project Settings → Database.'
    )
  }

  const info = databaseEndpointInfo()
  warnIfNotTransactionPooler(info)

  /**
   * Pool size follows the host, because the two hosts are opposite problems.
   *
   * On Vercel, `max: 3` was right and generous: every isolate holds its own pool,
   * dozens can exist at once, and the transaction pooler multiplexes them onto a
   * few real backends. Being stingy per isolate was the only way to stay under
   * the connection limit.
   *
   * Railway runs ONE process, so that same 3 is now the ceiling for the entire
   * API. Four concurrent requests would queue on connection acquisition — and
   * the watch page issues three in parallel, so two viewers opening a video at
   * the same time is already past it. Nothing would error; requests would just
   * mysteriously take turns.
   *
   * `allowExitOnIdle` goes with it: it exists so a serverless invocation is not
   * held open by an idle pool. On a persistent server the HTTP listener keeps the
   * process alive anyway, and letting the pool bow out is meaningless at best.
   */
  const persistent = Boolean(process.env.RAILWAY_ENVIRONMENT)
  const max = int(process.env.PG_POOL_MAX, persistent ? 12 : 3)

  pool = new Pool({
    connectionString: env.databaseUrl,
    // Supabase terminates TLS with its own chain; verifying it from Node needs
    // the Supabase root cert, which we do not ship. Encryption is still on.
    ssl: { rejectUnauthorized: false },
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: !persistent,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    application_name: 'mtonyo-api',
  })
  log.info(`postgres pool: max=${max}${persistent ? ' (persistent host)' : ' (serverless sizing)'}`)

  globalThis[GLOBAL_KEY] = pool
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
    delete globalThis[GLOBAL_KEY]
  }
}
