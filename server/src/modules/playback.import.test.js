import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

test('playback.routes imports clampFreePreviewSeconds (preview path needs it)', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(dir, 'playback.routes.js'), 'utf8')
  assert.match(
    src,
    /import \{[^}]*clampFreePreviewSeconds[^}]*\} from '\.\.\/lib\/preview\.js'/,
    'dropping this import 500s every unpaid preview'
  )
})

test('playback never waits on clip generation and never hands unpaid viewers the full uid', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(dir, 'playback.routes.js'), 'utf8')
  assert.doesNotMatch(src, /Promise\.race/)
  assert.doesNotMatch(src, /setTimeout\(resolve, 8000\)/)
  assert.match(src, /previewPending: true/)
  assert.match(src, /ensureClips\(video\.id\)\.catch/)
})

test('watch playback loads video and active purchase in one query, never id::text', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(dir, 'playback.routes.js'), 'utf8')
  assert.doesNotMatch(src, /id::text\s*=/)
  assert.match(src, /left join purchases p/)
  assert.match(src, /p\.status = 'active'/)
  assert.match(src, /id = \$1::uuid/)
  assert.match(src, /purchase,/)
})

test('missing preview does not loop forever when the Cloudflare source cannot play', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(dir, 'playback.routes.js'), 'utf8')
  assert.match(src, /unavailable: true/)
  assert.match(src, /This video is unavailable/)
  assert.match(src, /inspectCloudflareSource/)
})

test('ready webhook stores source width and height', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(dir, 'playback.routes.js'), 'utf8')
  assert.match(src, /width = coalesce\(\$4, width\)/)
  assert.match(src, /height = coalesce\(\$5, height\)/)
  assert.match(src, /dimensionsFromCloudflare/)
})

/**
 * A beacon can only be a POST.
 *
 * `navigator.sendBeacon` has no way to choose a verb. With the route registered
 * for PUT alone, every position sent by a closing tab was answered 404 — and
 * silently, because sendBeacon reports "queued", never "delivered". The whole
 * Continue Watching write path failed without a single error anywhere, and it
 * was found by watching the network rather than by reading the code.
 */
test('the progress route answers the verb a beacon is able to send', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(dir, 'playback.routes.js'), 'utf8')
  assert.match(src, /router\.post\('\/:id\/progress', \.\.\.progressHandlers\)/)
  assert.match(src, /router\.put\('\/:id\/progress', \.\.\.progressHandlers\)/)
})

/**
 * And a beacon carries no headers, so the token arrives in a text/plain body.
 * Anything but a simple content type would need a preflight, which sendBeacon
 * cannot do — the browser drops it without a word.
 */
test('a text/plain beacon body is turned back into an authorised request', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(dir, 'playback.routes.js'), 'utf8')
  assert.match(src, /express\.text\(\{ type: \['text\/plain'\]/)
  assert.match(src, /req\.headers\.authorization = `Bearer \$\{parsed\.token\}`/)
})
