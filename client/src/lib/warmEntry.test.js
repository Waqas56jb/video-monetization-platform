import { test } from 'node:test'
import assert from 'node:assert/strict'
import { warmEntryUsable, WARM_TTL_MS } from './warmEntry.js'

/**
 * The reported failure, as a test: a viewer who has paid for a video is shown
 * Unlock and hits the paywall at the preview cut-off.
 *
 * The server was ruled out before this was written — `resolveAccess` returns
 * owned:true for that pairing against production data, and Railway verifies
 * tokens correctly. What was left is here: the warm cache was keyed on the
 * video alone, so a payload fetched while signed out was replayed to whoever
 * tapped that card next.
 */

const ANON = null
const VIEWER = 'token-for-hamza'
const OTHER = 'token-for-yasmin'
const now = 1_000_000

test('a payload warmed while signed out is not served to a signed-in viewer', () => {
  // Browse the home page logged out — cards warm on scroll — then sign in and
  // tap one within ten minutes. This is the reported bug.
  const warmedAnonymously = { at: now, auth: ANON }
  assert.equal(warmEntryUsable(warmedAnonymously, now + 1000, VIEWER), false)
})

test("a signed-in viewer's payload is never served to the next account", () => {
  // The dangerous direction: this entry holds a *full* signed playback URL.
  const owners = { at: now, auth: VIEWER }
  assert.equal(warmEntryUsable(owners, now + 1000, OTHER), false)
  assert.equal(warmEntryUsable(owners, now + 1000, ANON), false)
})

test('the same viewer still gets their own warm payload — the speed-up survives', () => {
  // If this failed, the fix would have quietly removed the prefetch entirely.
  assert.equal(warmEntryUsable({ at: now, auth: VIEWER }, now + 1000, VIEWER), true)
  assert.equal(warmEntryUsable({ at: now, auth: ANON }, now + 1000, ANON), true)
})

test('freshness is still enforced, for the same viewer', () => {
  // The original reason this cache had a TTL: a preview JWT lives 15 minutes.
  const entry = { at: now, auth: VIEWER }
  assert.equal(warmEntryUsable(entry, now + WARM_TTL_MS - 1, VIEWER), true)
  assert.equal(warmEntryUsable(entry, now + WARM_TTL_MS, VIEWER), false)
  assert.equal(warmEntryUsable(entry, now + WARM_TTL_MS + 60_000, VIEWER), false)
})

test('a missing entry is not usable', () => {
  assert.equal(warmEntryUsable(undefined, now, VIEWER), false)
  assert.equal(warmEntryUsable(null, now, ANON), false)
})

test('a refreshed token discards the entry rather than guessing', () => {
  // Same person, new token string. Strictness costs one round trip; the
  // alternative is parsing a JWT here to decide, which is a worse trade.
  assert.equal(warmEntryUsable({ at: now, auth: 'v1' }, now + 1000, 'v2'), false)
})
