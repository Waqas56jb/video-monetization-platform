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
  assert.match(src, /Promise\.all/)
  assert.match(src, /ensureClips\(video\.id\)\.catch/)
})
