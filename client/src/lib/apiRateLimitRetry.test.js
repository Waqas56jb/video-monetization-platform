import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * A 429 on a read gets ONE patient retry, honouring Retry-After — never a
 * loop, never on a write. The 2026-09-18 outage was a shared rate-limit
 * bucket on the server (app.proxy.test.js); this is the client's side of
 * "sensible retry/backoff" the client asked for, bounded so it can never
 * become the storm it is meant to absorb.
 */
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'api.js'), 'utf8')

test('the retry is for GET only, once, and only when the wait is short', () => {
  assert.match(src, /if \(res\.status === 429 && method === 'GET' && !rateLimited\) \{/)
  assert.match(src, /if \(wait != null && wait <= RATE_LIMIT_RETRY_MAX_WAIT_MS\) \{/)
  assert.match(src, /export const RATE_LIMIT_RETRY_MAX_WAIT_MS = 5_000/)
  assert.match(src, /rateLimited: true \}\)/, 'the retried request is marked so it cannot retry again')
})

test('it waits out the Retry-After header (or the draft-7 reset), then asks once more', () => {
  assert.match(src, /res\.headers\.get\('Retry-After'\)/)
  /* Built at runtime rather than typed: a literal backslash in this file has
     been silently halved by tooling twice today. */
  const BACKSLASH = String.fromCharCode(92)
  assert.ok(src.includes('/reset=(' + BACKSLASH + 'd+)/.exec('), 'the draft-7 reset fallback is parsed')
  assert.match(src, /await sleep\(wait \+ 100\)/)
})

test('the 401-refresh retries carry the flag, so a refresh cannot reset the once-only rule', () => {
  const carried = (src.match(/return request\(path, \{ method, body, auth, retry: false, signal, rateLimited \}\)/g) || []).length
  assert.equal(carried, 3)
})

test('nothing retries on a 429 for a write', () => {
  // The only 429 branch there is requires method === 'GET'.
  const branches = (src.match(/res\.status === 429/g) || []).length
  assert.equal(branches, 1)
})
