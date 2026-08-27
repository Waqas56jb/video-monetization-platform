import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'entitlement.js'), 'utf8')

test('a purchase unlocks only that video, not the rest of the catalogue', () => {
  assert.match(
    src,
    /from purchases\s+where user_id = \$1 and video_id = \$2 and status = 'active'/
  )
  assert.doesNotMatch(
    src,
    /from purchases\s+where user_id = \$1 and status = 'active'/
  )
})
