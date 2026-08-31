import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refreshTokenRejected } from './sessionRules.js'

/**
 * A failed refresh is two different events, and they were treated as one.
 *
 * Only a verdict from the server ends a session. Anything else — the API
 * restarting, a proxy answering, the rate limiter turning the request away —
 * says nothing about the credential, and clearing the tokens there logs a viewer
 * out in the middle of a film they paid for.
 */

test('the server rejecting the refresh token ends the session', () => {
  for (const status of [400, 401, 403, 422]) {
    assert.equal(refreshTokenRejected(status), true, `${status} should end the session`)
  }
})

test('rate limiting does not end the session', () => {
  // The live rate limiter is keyed on client IP, and on Railway `req.ip` is
  // currently a proxy address shared by every viewer — so a 429 can arrive for
  // traffic that was never this person's.
  assert.equal(refreshTokenRejected(429), false)
})

test('the API being restarted or unreachable does not end the session', () => {
  // Railway runs one process: a redeploy is a real window of 502/503, where a
  // serverless host would have cold-started instead.
  for (const status of [408, 500, 502, 503, 504]) {
    assert.equal(refreshTokenRejected(status), false, `${status} must keep the session`)
  }
})

test('a status of 0 — no response at all — does not end the session', () => {
  assert.equal(refreshTokenRejected(0), false)
  assert.equal(refreshTokenRejected(undefined), false)
})
