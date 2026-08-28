import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('warm playback is consumed on take and dropped after pay', () => {
  const src = readFileSync(join(dir, 'prefetchWatch.js'), 'utf8')
  assert.match(src, /if \(p\) map\.delete\(key\)/)
  assert.match(src, /export function dropWarmedWatch/)
  assert.match(src, /export function dropWarmedPlayback/)
  assert.match(src, /playbackCache\.delete/)
  assert.match(src, /warmAds/)
  assert.match(src, /takeWarmedAds/)
})
