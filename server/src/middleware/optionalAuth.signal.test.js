import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { readFileSync } from 'node:fs'
import { optionalAuth } from './auth.js'

/**
 * An expired token on an anonymous-friendly route must not be silent.
 *
 * This is the mechanism behind "a video I already bought shows Unlock".
 * `/api/playback/:id/playback` serves strangers, so it answers 200 with a
 * preview when it does not recognise the caller — which is correct for a
 * stranger and indistinguishable, from the client's side, from an expired
 * session. No 401 is produced, so the client never refreshes, and the buyer sits
 * behind a paywall for something they own.
 *
 * These boot a real Express app and read the header off a real response. The
 * route stays 200 in every case: that contract is the point, and a test that
 * only asserted the header would not notice if the fix broke anonymous viewing.
 */
async function call(headers) {
  const app = express()
  app.get('/thing', optionalAuth(), (req, res) =>
    res.json({ signedIn: Boolean(req.user), rejected: Boolean(req.authRejected) })
  )
  const server = app.listen(0)
  try {
    await new Promise((r) => server.once('listening', r))
    const res = await fetch(`http://127.0.0.1:${server.address().port}/thing`, { headers })
    return { status: res.status, auth: res.headers.get('x-auth-status'), body: await res.json() }
  } finally {
    await new Promise((r) => server.close(r))
  }
}

test('a rejected token still answers 200, but says the token was rejected', async () => {
  const res = await call({ Authorization: 'Bearer not.a.real.token' })
  assert.equal(res.status, 200)
  assert.equal(res.body.signedIn, false)
  assert.equal(res.auth, 'expired')
  assert.equal(res.body.rejected, true)
})

test('a genuinely anonymous caller is not reported as expired', async () => {
  // Nothing went wrong here, and telling the client to refresh a token it does
  // not have would put it in a loop.
  const res = await call({})
  assert.equal(res.status, 200)
  assert.equal(res.body.signedIn, false)
  assert.equal(res.auth, null)
})

test('an Authorization header that is not a Bearer token is treated as anonymous', async () => {
  const res = await call({ Authorization: 'Basic bm90OmJlYXJlcg==' })
  assert.equal(res.status, 200)
  assert.equal(res.auth, null)
})

test('the header is exposed to the browser, or the client cannot read it', () => {
  // The apps are on another origin: without exposedHeaders this arrives at the
  // browser and is invisible to JavaScript, so the fix would be inert in
  // production while passing every test above.
  const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  assert.match(src, /exposedHeaders:\s*\['X-Auth-Status', 'X-Build'\]/)
})
