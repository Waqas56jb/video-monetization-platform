import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'watch.js'), 'utf8')

test('watch HTML serves a crawler document to WhatsApp and never claims og:video', () => {
  assert.match(src, /isLinkPreviewBot/)
  assert.match(src, /isUnfurlFetch/)
  assert.match(src, /crawlerDocument/)
  assert.match(src, /og:type" content="website"/)
  assert.doesNotMatch(src, /og:type" content="video\.other"/)
})

test('og:image is same-origin /og/card and crawlers do not wait on a cold API', () => {
  assert.match(src, /function ogCardUrl/)
  assert.match(src, /\/og\/card\//)
  assert.match(src, /CRAWLER_META_MS = 600/)
  assert.match(src, /if \(meta\) metaMemo\.set/)
  assert.doesNotMatch(src, /\$\{API\}\/api\/share-card/)
})

test('a browser is never held up on a cross-service call', () => {
  // The whole point: HTML goes out on this function's own work, nothing else.
  assert.match(src, /function memoedShareMeta/)
  assert.match(src, /\? await loadShareMeta\(slug, CRAWLER_META_MS\)\s*\n\s*: memoedShareMeta\(slug\)/)

  // There is exactly one awaited share-meta call, and it is the crawler's.
  const awaited = src.match(/await loadShareMeta\(/g) || []
  assert.equal(awaited.length, 1, 'only the crawler may await share-meta')
  assert.doesNotMatch(src, /BROWSER_META_MS/)

  // memoedShareMeta must stay synchronous — an async one would reintroduce it.
  assert.doesNotMatch(src, /async function memoedShareMeta/)
})

test('crawler and browser documents cannot be cross-served from one cache entry', () => {
  // They are different documents for the same URL. A shared cache that ignores
  // User-Agent can hand a crawler the browser copy — which is the bare-link
  // preview report, arriving by a different road.
  const vary = src.match(/res\.setHeader\('Vary', '([^']*)'\)/g) || []
  assert.ok(vary.length >= 2, 'both HTML responses must set Vary')
  for (const v of vary) assert.match(v, /User-Agent/)
})
