import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { withRetry, RETRY_DELAY_MS } from './useApi.js'

/**
 * One silent retry before a read ever shows "Could not load this" /
 * "No connection — tap to retry". Client, 2026-09-21: a normal homepage
 * session, Trending failed once with exactly that message, then loaded
 * fine on a manual retry — proof the data was reachable, just not inside
 * one 10s attempt. See useApi.js for the reasoning.
 */

test('a fetcher that fails once and succeeds on the second call resolves — the retry is invisible', async () => {
  let calls = 0
  const fn = async () => {
    calls += 1
    if (calls === 1) throw new Error('boom')
    return { ok: true }
  }
  const result = await withRetry(fn, 10_000)
  assert.deepEqual(result, { ok: true })
  assert.equal(calls, 2, 'called exactly twice: the attempt, then the one retry')
})

test('a fetcher that keeps failing still ends in exactly two calls, and the original error surfaces', async () => {
  let calls = 0
  const fn = async () => {
    calls += 1
    throw new Error(`fail ${calls}`)
  }
  await assert.rejects(() => withRetry(fn, 10_000), /fail 2/, 'the SECOND attempt\'s error is what the caller sees')
  assert.equal(calls, 2, 'never a third attempt — bounded, not a loop')
})

test('a fetcher that succeeds first time is called exactly once — no retry tax on the common case', async () => {
  let calls = 0
  const fn = async () => {
    calls += 1
    return { ok: true }
  }
  await withRetry(fn, 10_000)
  assert.equal(calls, 1)
})

test('the retry waits before trying again — it does not hammer a struggling server immediately', async () => {
  let calls = 0
  const at = []
  const fn = async () => {
    calls += 1
    at.push(Date.now())
    if (calls === 1) throw new Error('boom')
    return { ok: true }
  }
  await withRetry(fn, 10_000)
  assert.ok(at[1] - at[0] >= RETRY_DELAY_MS - 5, `gap was ${at[1] - at[0]}ms, expected >= ${RETRY_DELAY_MS}ms`)
})

test('both the initial load and reload() go through withRetry, not the raw single-attempt withTimeout', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'useApi.js'), 'utf8')
  assert.match(src, /const res = await withRetry\(\(\) => ref\.current\(\), timeoutMs\)/, 'runFetch (reload/initial-mount trigger)')
  assert.match(src, /withRetry\(\(\) => ref\.current\(\), timeoutMs\)\s*\n\s*\.then/, 'the mount effect')
  assert.doesNotMatch(src, /withTimeout\(ref\.current\(\)/, 'nothing still calls the fetcher once and bounds it directly')
})
