/**
 * What does a route actually do before it can answer?
 *
 * Latency measured from outside cannot say. My round trip to the API is ~0.6s of
 * network before any work happens, so the difference between a 2-query route and
 * a 6-query one disappears into the noise of a single sample. Counts do not
 * move: they are the same on every run and on every machine, and they are what
 * changed when the API stopped sitting beside the database — a round trip now
 * costs real milliseconds instead of approximately none.
 *
 * It counts outbound HTTP as well as SQL. On the player's critical path a call
 * to Cloudflare or to Facebook's scraper costs far more than a query and is
 * completely invisible to a database counter. Finding those was the point.
 *
 * Attribution is per-request via AsyncLocalStorage rather than a shared array.
 * A shared array is wrong in a way that looks right: fire-and-forget work
 * started by request N lands in request N+1's window, so the tool reports a
 * Cloudflare call against a route that never makes one. Work started during a
 * request is charged to it even if it finishes after the response — which is
 * correct, because on a persistent host that work still competes for the process.
 *
 * Read-only: every route it calls is a GET.
 *
 *   node scripts/count-queries.mjs                 # default routes
 *   node scripts/count-queries.mjs /api/videos/x   # specific ones
 */
import 'dotenv/config'
import http from 'node:http'
import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'

const als = new AsyncLocalStorage()
const record = (entry) => als.getStore()?.push(entry)
const sql = (a) => (typeof a === 'string' ? a : a?.text || '(unknown)').replace(/\s+/g, ' ').trim()

/* Wrap before app.js is imported, so the pool it builds is already instrumented. */
const origQuery = pg.Pool.prototype.query
pg.Pool.prototype.query = function (...args) {
  record({ kind: 'sql', text: sql(args[0]) })
  return origQuery.apply(this, args)
}

/**
 * A client checked out via connect() bypasses Pool.query — transactions use it.
 * Only the promise form is wrapped: Pool.query calls this.connect(callback)
 * internally, which returns undefined, so wrapping that form blindly turns every
 * ordinary query into a crash.
 */
const origConnect = pg.Pool.prototype.connect
pg.Pool.prototype.connect = function (...args) {
  if (typeof args[0] === 'function') return origConnect.apply(this, args)
  return origConnect.apply(this, args).then((client) => {
    const cq = client.query.bind(client)
    client.query = (...a) => {
      record({ kind: 'sql', text: `[tx] ${sql(a[0])}` })
      return cq(...a)
    }
    return client
  })
}

const origFetch = globalThis.fetch
globalThis.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : input?.url || String(input)
  if (!url.startsWith('http://127.0.0.1')) record({ kind: 'http', text: url })
  return origFetch.call(this, input, init)
}

const { default: app } = await import('../src/app.js')

const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      '/health',
      '/api/videos/live-at-arusha-full-set',
      '/api/playback/live-at-arusha-full-set/playback',
      '/api/ads/preroll/live-at-arusha-full-set',
    ]

/**
 * Cold first, then warm — the gap is the point.
 *
 * Several of the things the audit counted only ever happen once in a process:
 * the settings load, the share-card DDL, a lazy router's first import. On the
 * old serverless host "once per process" meant once per cold invocation, so they
 * were on the request path in practice. On a persistent host they are paid at
 * boot and never again, which changes what is actually worth removing.
 */
const SETTLE_MS = Number(process.env.SETTLE_MS || 2500)
const results = new Map()
for (const pass of ['cold', 'warm']) {
  for (const route of ROUTES) {
    const store = []
    const handler = (req, res) => als.run(store, () => app(req, res))
    const one = http.createServer(handler)
    await new Promise((r) => one.listen(0, r))
    const res = await fetch(`http://127.0.0.1:${one.address().port}${route}`).catch(() => ({ status: 0 }))
    /**
     * Wait past the response, deliberately.
     *
     * The expensive work on this path is fire-and-forget: `ensureClips(id)` is
     * called without await, so its Cloudflare request begins only after its own
     * query resolves — long after the response has been sent. A settle of one
     * tick reports zero outbound calls and is confidently wrong. The work is
     * still charged to the request that started it, because on a persistent host
     * it goes on competing for the same pool and the same rate limit.
     */
    await new Promise((r) => globalThis.setTimeout(r, SETTLE_MS))
    await new Promise((r) => one.close(r))
    if (!results.has(route)) results.set(route, {})
    results.get(route)[pass] = { status: res.status, entries: store.slice() }
  }
}

const width = Math.max(...ROUTES.map((r) => r.length))
const count = (e, kind) => e.filter((x) => x.kind === kind).length

console.log('\nPer request — SQL round trips and outbound HTTP\n')
console.log(`  ${'route'.padEnd(width)}   cold          warm`)
console.log(`  ${'-'.repeat(width)}   -----------   -----------`)
for (const route of ROUTES) {
  const { cold, warm } = results.get(route)
  const fmt = (p) => `${String(count(p.entries, 'sql')).padStart(2)} sql ${String(count(p.entries, 'http')).padStart(2)} http`
  console.log(`  ${route.padEnd(width)}   ${fmt(cold)}   ${fmt(warm)}`)
}

console.log('\nWarm detail (this is the number a real viewer pays):\n')
for (const route of ROUTES) {
  const { warm } = results.get(route)
  console.log(`${route}  ->  ${warm.status}`)
  warm.entries.forEach((e, i) =>
    console.log(`   ${String(i + 1).padStart(2)}. ${e.kind === 'http' ? 'HTTP ' : 'sql  '}${e.text.slice(0, 140)}`)
  )
  if (!warm.entries.length) console.log('    (none)')
  console.log()
}

console.log(
  'counts:',
  JSON.stringify(
    Object.fromEntries(
      ROUTES.map((r) => [
        r,
        { sql: count(results.get(r).warm.entries, 'sql'), http: count(results.get(r).warm.entries, 'http') },
      ])
    )
  )
)
process.exit(0)
