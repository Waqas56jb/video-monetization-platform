import { test } from 'node:test'
import assert from 'node:assert/strict'
import { posterAtFor, playbackUrls } from './cloudflare.js'

test('a clip shorter than 15s gets a poster timestamp inside its own length', () => {
  assert.equal(posterAtFor(13), '6s')
  assert.equal(posterAtFor(1), '1s')
  assert.equal(posterAtFor(2), '1s')
})

test('a clip at or past 15s keeps the default — still an in-range, non-black frame', () => {
  assert.equal(posterAtFor(15), '15s')
  assert.equal(posterAtFor(120), '15s')
})

test('unknown duration keeps the default rather than guessing', () => {
  assert.equal(posterAtFor(null), '15s')
  assert.equal(posterAtFor(undefined), '15s')
  assert.equal(posterAtFor(0), '15s')
})

test('playbackUrls actually carries the clamped timestamp into the thumbnail URL', () => {
  const url = playbackUrls('tok123', { posterAt: posterAtFor(13) }).thumbnail
  assert.match(url, /time=6s/)
})
