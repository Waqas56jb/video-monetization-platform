import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playbackRouteMatches } from './watchUrl.js'

/**
 * A playback payload can be identified before /api/videos answers.
 *
 * Measured on production: the playback response lands at ~500 ms and the iframe
 * did not mount until ~1150 ms, purely because the id it was compared against
 * arrived with a different request. The payload now carries its own slug.
 *
 * The guard this function exists for is the thing to protect: after
 * /watch/A -> /watch/B, A's payload is still in memory and must never decide B's
 * lock, badge or iframe.
 */
const A = { videoId: 'id-a', slug: 'arusha' }
const B = { videoId: 'id-b', slug: 'pilau' }

test('with the video row loaded, behaviour is exactly what it was', () => {
  assert.equal(playbackRouteMatches(A, { id: 'id-a' }), true)
  assert.equal(playbackRouteMatches(A, { id: 'id-b' }), false)
  assert.equal(playbackRouteMatches(null, { id: 'id-a' }), false)
})

test('without the video row, the route key identifies the payload', () => {
  assert.equal(playbackRouteMatches(A, null, 'arusha'), true)
  assert.equal(playbackRouteMatches(A, null, 'id-a'), true)
})

test("another video's payload is still refused on this route", () => {
  // The whole reason the function exists. B's route, A's leftover payload.
  assert.equal(playbackRouteMatches(A, null, 'pilau'), false)
  assert.equal(playbackRouteMatches(A, null, 'id-b'), false)
})

test('an encoded route key still matches', () => {
  assert.equal(playbackRouteMatches({ videoId: 'x', slug: 'a b' }, null, 'a%20b'), true)
})

test('no route key and no video row means no match — never a default yes', () => {
  assert.equal(playbackRouteMatches(A, null), false)
  assert.equal(playbackRouteMatches(A, null, null), false)
  assert.equal(playbackRouteMatches(A, {}, null), false)
})

test('a payload with no slug still matches by id, and never by undefined', () => {
  const noSlug = { videoId: 'id-a' }
  assert.equal(playbackRouteMatches(noSlug, null, 'id-a'), true)
  // A server that has not deployed the slug yet must not match everything.
  assert.equal(playbackRouteMatches(noSlug, null, 'undefined'), false)
})
