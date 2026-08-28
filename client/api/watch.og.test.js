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
