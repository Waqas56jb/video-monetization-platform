import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('warm playback is consumed on take and dropped after pay', () => {
  const src = readFileSync(join(dir, 'prefetchWatch.js'), 'utf8')
  assert.match(src, /map\.delete\(key\)/)
  // A warmed payload carries a signed token with a life of its own. A preview
  // token lasts 15 minutes and cards warm on scroll, so a browse-then-tap could
  // hand the player a JWT that had already expired.
  assert.match(src, /const WARM_TTL_MS = 10 \* 60 \* 1000/)
  assert.match(src, /Date\.now\(\) - hit\.at < WARM_TTL_MS \? hit\.promise : null/)
  assert.match(src, /map\.set\(id, \{ promise, at: Date\.now\(\) \}\)/)
  assert.match(src, /export function prefetchWatchLight/)
  assert.match(src, /export function dropWarmedWatch/)
  assert.match(src, /export function dropWarmedPlayback/)
  assert.match(src, /playbackCache\.delete/)
  assert.match(src, /warmAds/)
  assert.match(src, /takeWarmedAds/)
  assert.match(src, /export function ensureStreamSdk/)
  assert.match(src, /loadLandingPage/)
})
