import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('VideoCard prefetches on pointer and when the card is in view', () => {
  const src = readFileSync(join(dir, 'VideoCard.jsx'), 'utf8')
  assert.match(src, /onPointerDown: warm/)
  assert.match(src, /onTouchStart: warm/)
  assert.match(src, /prefetchWatch\(key\)/)
  assert.match(src, /requestIdleCallback/)
  assert.match(src, /markPerf\('cardTap'\)/)
})
