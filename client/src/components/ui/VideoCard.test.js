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
  // A card merely scrolling past warms only the request that gates the iframe.
  // The full three-request warm belongs to a finger on the card — every card in
  // view firing all three put 24 requests on Home and up to 72 on Explore
  // against the thumbnails that are the page's largest paint.
  assert.match(src, /prefetchWatchLight\(key\)/)
  assert.match(src, /prefetchWatch\(slug \|\| id\)/)
  assert.match(src, /requestIdleCallback/)
  assert.match(src, /markPerf\('cardTap'\)/)
})
