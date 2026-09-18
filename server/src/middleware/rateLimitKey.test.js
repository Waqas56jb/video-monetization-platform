import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRateLimitKey } from './rateLimitKey.js'

/**
 * A signed-in person is rate-limited as themselves, everyone else as their
 * address — and only a token that VERIFIES buys a personal bucket.
 * See rateLimitKey.js for the measured reason (2026-09-18).
 */
const req = (ip, token) => ({ ip, headers: token ? { authorization: `Bearer ${token}` } : {} })
const users = {
  good1: { id: '11111111-1111-4111-8111-111111111111' },
  good2: { id: '22222222-2222-4222-8222-222222222222' },
}
const stubVerify = () => {
  const calls = []
  const verify = async (token) => {
    calls.push(token)
    if (users[token]) return users[token]
    throw new Error('bad token')
  }
  return { verify, calls }
}

test('no token → the address bucket', async () => {
  const { verify } = stubVerify()
  const key = createRateLimitKey({ verify })
  assert.equal(await key(req('203.0.113.9')), 'ip:203.0.113.9')
})

test('two people behind one router get two buckets; an anonymous neighbour keeps the address one', async () => {
  const { verify } = stubVerify()
  const key = createRateLimitKey({ verify })
  assert.equal(await key(req('203.0.113.9', 'good1')), `user:${users.good1.id}`)
  assert.equal(await key(req('203.0.113.9', 'good2')), `user:${users.good2.id}`)
  assert.equal(await key(req('203.0.113.9')), 'ip:203.0.113.9')
})

test('a token that does not verify cannot mint a bucket — it falls back to the address', async () => {
  const { verify } = stubVerify()
  const key = createRateLimitKey({ verify })
  assert.equal(await key(req('203.0.113.9', 'forged')), 'ip:203.0.113.9')
  assert.equal(await key(req('198.51.100.7', 'forged')), 'ip:198.51.100.7', 'and it is the address it CAME from')
})

test('one verification per token per minute, valid or not', async () => {
  let clock = 1_000_000
  const { verify, calls } = stubVerify()
  const key = createRateLimitKey({ verify, ttlMs: 60_000, now: () => clock })
  await key(req('1.1.1.1', 'good1'))
  await key(req('1.1.1.1', 'good1'))
  await key(req('1.1.1.1', 'good1'))
  await key(req('1.1.1.1', 'forged'))
  await key(req('1.1.1.1', 'forged'))
  assert.deepEqual(calls, ['good1', 'forged'])
  clock += 60_001
  await key(req('1.1.1.1', 'good1'))
  assert.deepEqual(calls, ['good1', 'forged', 'good1'], 're-verified once the minute is up')
})

test('the memo is capped — a flood of junk tokens evicts the oldest, it does not grow', async () => {
  const { verify, calls } = stubVerify()
  const key = createRateLimitKey({ verify, max: 2 })
  await key(req('1.1.1.1', 'junk-a'))
  await key(req('1.1.1.1', 'junk-b'))
  await key(req('1.1.1.1', 'junk-c'))
  await key(req('1.1.1.1', 'junk-a')) // evicted by junk-c, so verified again
  assert.deepEqual(calls, ['junk-a', 'junk-b', 'junk-c', 'junk-a'])
})

test('the app wires the limiter to this key, with the verifier the auth middleware trusts', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const app = readFileSync(join(dir, '../app.js'), 'utf8')
  const mod = readFileSync(join(dir, 'rateLimitKey.js'), 'utf8')
  assert.ok(app.includes("import { rateLimitKey } from './middleware/rateLimitKey.js'"))
  assert.ok(app.includes('keyGenerator: rateLimitKey,'))
  assert.ok(mod.includes('createRateLimitKey({ verify: userFromToken })'))
})
