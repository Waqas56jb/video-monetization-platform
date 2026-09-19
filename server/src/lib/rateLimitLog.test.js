import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRateLimitExceededHandler } from './rateLimitLog.js'

/**
 * Every refusal is written down — bucket, raw forwarding chain, path — and
 * answered exactly as express-rate-limit would have answered it. Throttled
 * to one row per bucket per second so a storm cannot become a write storm.
 */
const options = { statusCode: 429, message: { error: { message: 'Too many requests — slow down a moment', code: 'RATE_LIMIT' } } }
const req = ({ ip = '203.0.113.9', xff = '203.0.113.9, 152.233.15.121', url = '/api/playback/abc/progress?x=1', method = 'PUT', ua = 'UA' } = {}) => ({
  ip,
  method,
  originalUrl: url,
  headers: { 'x-forwarded-for': xff, 'user-agent': ua },
})
const res = () => {
  const r = { statusCode: null, body: null, headers: { 'Retry-After': '42' } }
  r.getHeader = (k) => r.headers[k]
  r.status = (c) => { r.statusCode = c; return r }
  r.json = (b) => { r.body = b; return r }
  return r
}
const harness = ({ key = 'user:11111111-1111-4111-8111-111111111111', clock = 1_000_000, failWrite = false } = {}) => {
  const rows = []
  const state = { clock }
  const handler = createRateLimitExceededHandler({
    keyFor: async () => key,
    write: async (_sql, params) => { if (failWrite) throw new Error('db down'); rows.push(params) },
    now: () => state.clock,
    throttleMs: 1000,
  })
  return { handler, rows, state }
}

test('answers the 429 exactly as configured, and writes one row with bucket, chain, hops, path and user', async () => {
  const { handler, rows } = harness()
  const r = res()
  await handler(req(), r, () => {}, options)
  assert.equal(r.statusCode, 429)
  assert.deepEqual(r.body, options.message)
  assert.equal(rows.length, 1)
  const [bucket, ip, xff, hops, method, path, userId, ua, retryAfter] = rows[0]
  assert.equal(bucket, 'user:11111111-1111-4111-8111-111111111111')
  assert.equal(ip, '203.0.113.9')
  assert.equal(xff, '203.0.113.9, 152.233.15.121')
  assert.equal(hops, 2)
  assert.equal(method, 'PUT')
  assert.equal(path, '/api/playback/abc/progress', 'the query string is dropped')
  assert.equal(userId, '11111111-1111-4111-8111-111111111111')
  assert.equal(ua, 'UA')
  assert.equal(retryAfter, 42)
})

test('an address bucket records no user id', async () => {
  const { handler, rows } = harness({ key: 'ip:203.0.113.9' })
  await handler(req(), res(), () => {}, options)
  assert.equal(rows[0][0], 'ip:203.0.113.9')
  assert.equal(rows[0][6], null)
})

test('one row per bucket per second — a storm of refusals is a handful of rows', async () => {
  const { handler, rows, state } = harness()
  for (let i = 0; i < 50; i++) await handler(req(), res(), () => {}, options)
  assert.equal(rows.length, 1)
  state.clock += 1000
  await handler(req(), res(), () => {}, options)
  assert.equal(rows.length, 2)
})

test('a failed write never changes the answer', async () => {
  const { handler, rows } = harness({ failWrite: true })
  const r = res()
  await handler(req(), r, () => {}, options)
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(r.statusCode, 429)
  assert.equal(rows.length, 0)
})

test('the app hands the limiter this handler, and the admin route reads the table', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const app = readFileSync(join(dir, '../app.js'), 'utf8')
  const admin = readFileSync(join(dir, '../modules/admin.routes.js'), 'utf8')
  const migration = readFileSync(join(dir, '../db/migrations/041_rate_limit_hits.sql'), 'utf8')
  assert.ok(app.includes("import { rateLimitExceeded } from './lib/rateLimitLog.js'"))
  assert.ok(app.includes('handler: rateLimitExceeded,'))
  assert.ok(admin.includes("'/rate-limit-hits'"))
  assert.ok(admin.includes('from rate_limit_hits where at > now() - $1::interval'))
  assert.ok(migration.includes('create table if not exists rate_limit_hits'))
  assert.ok(migration.includes('revoke all on table rate_limit_hits from anon, authenticated, public'))
})
