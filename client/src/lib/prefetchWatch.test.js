import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('warm playback is consumed on take and dropped after pay', () => {
  const src = readFileSync(join(dir, 'prefetchWatch.js'), 'utf8')
  assert.match(src, /map\.delete\(key\)/)
  /**
   * A warmed payload carries a signed token with a life of its own, and it
   * belongs to one viewer. Both rules now live in warmEntry.js, which has no
   * imports and is therefore tested by running it — see warmEntry.test.js.
   *
   * What is left to check here is that this file actually asks: every read and
   * every write goes through that rule, and the identity is recorded at write
   * time. Assertions on the arithmetic itself moved with the arithmetic.
   */
  assert.match(src, /import \{ warmEntryUsable \} from '@\/lib\/warmEntry'/)
  assert.match(src, /warmEntryUsable\(hit, Date\.now\(\), authIdentity\(\)\) \? hit\.promise : null/)
  assert.match(src, /map\.set\(id, \{ promise, at: Date\.now\(\), auth \}\)/)
  assert.match(src, /const authIdentity = \(\) => getAccessToken\(\) \|\| null/)
  assert.match(src, /export function prefetchWatchLight/)
  assert.match(src, /export function dropWarmedWatch/)
  assert.match(src, /export function dropWarmedPlayback/)
  assert.match(src, /playbackCache\.delete/)
  assert.match(src, /warmAds/)
  assert.match(src, /takeWarmedAds/)
  assert.match(src, /export function ensureStreamSdk/)
  assert.match(src, /loadLandingPage/)
})
