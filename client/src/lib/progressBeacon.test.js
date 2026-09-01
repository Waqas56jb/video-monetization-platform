import { test } from 'node:test'
import assert from 'node:assert/strict'
import { progressBeaconRequest, beaconProgress } from './progressBeacon.js'

const API = 'https://api.example'

test('a beacon is text/plain, or the browser drops it in silence', () => {
  const req = progressBeaconRequest(API, 'vid-1', 42, 'tok')
  /**
   * Not `application/json`. A beacon with a JSON content type is not a simple
   * request, so it needs a CORS preflight — which sendBeacon cannot do, so the
   * browser discards it without an error anywhere. This one line is the
   * difference between a resume position that is saved and one that vanishes.
   */
  assert.equal(req.contentType, 'text/plain;charset=UTF-8')
  assert.equal(req.url, `${API}/api/playback/vid-1/progress`)
  assert.deepEqual(JSON.parse(req.body), { seconds: 42, token: 'tok' })
})

test('the token rides in the body, because a beacon has no headers', () => {
  const req = progressBeaconRequest(API, 'vid-1', 42, 'tok')
  assert.equal(JSON.parse(req.body).token, 'tok')
})

test('nothing is sent without a token, a video or a second of watching', () => {
  assert.equal(progressBeaconRequest(API, 'vid-1', 42, null), null)
  assert.equal(progressBeaconRequest(API, null, 42, 'tok'), null)
  assert.equal(progressBeaconRequest(API, 'vid-1', 0, 'tok'), null)
  assert.equal(progressBeaconRequest(API, 'vid-1', 0.4, 'tok'), null)
})

test('the position is whole seconds, and the id is escaped', () => {
  assert.equal(JSON.parse(progressBeaconRequest(API, 'v', 41.87, 't').body).seconds, 41)
  assert.match(progressBeaconRequest(API, 'a b/c', 5, 't').url, /a%20b%2Fc/)
})

test('sendBeacon is used when it exists', () => {
  const calls = []
  const ok = beaconProgress({
    apiBase: API,
    token: 'tok',
    videoId: 'vid-1',
    seconds: 42,
    nav: { sendBeacon: (url, body) => { calls.push([url, body]); return true } },
    send: () => assert.fail('fetch must not be used when the beacon was accepted'),
  })
  assert.equal(ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], `${API}/api/playback/vid-1/progress`)
})

/**
 * Safari only got `keepalive` in 16.4, and Safari is why this module exists — so
 * the two transports have to cover for each other rather than one being a
 * comment about the other.
 */
test('a refused beacon falls back to a keepalive fetch, not to nothing', () => {
  const sent = []
  const ok = beaconProgress({
    apiBase: API,
    token: 'tok',
    videoId: 'vid-1',
    seconds: 42,
    nav: { sendBeacon: () => false },
    send: (url, init) => { sent.push([url, init]); return { catch: () => {} } },
  })
  assert.equal(ok, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0][1].keepalive, true)
  assert.equal(sent[0][1].method, 'PUT')
  assert.equal(sent[0][1].headers.authorization, 'Bearer tok')
})

test('a browser with neither transport says so rather than pretending', () => {
  assert.equal(
    beaconProgress({ apiBase: API, token: 'tok', videoId: 'vid-1', seconds: 42, nav: null, send: null }),
    false
  )
})

test('a throwing sendBeacon still reaches the fallback', () => {
  const sent = []
  const ok = beaconProgress({
    apiBase: API,
    token: 'tok',
    videoId: 'vid-1',
    seconds: 42,
    nav: { sendBeacon: () => { throw new Error('blocked') } },
    send: (url, init) => { sent.push(init); return { catch: () => {} } },
  })
  assert.equal(ok, true)
  assert.equal(sent.length, 1)
})
