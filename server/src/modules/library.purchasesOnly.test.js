import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'library.routes.js'),
  'utf8'
)

/**
 * My Library lists purchases, and only purchases.
 *
 * Staff and creators can watch without paying — deliberately: reviewing a video
 * means watching it, and a creator should not buy their own film. `resolveAccess`
 * keeps that separate from `owned`, which is the purchase flag, and this is the
 * other half of that promise: the library reads the purchases table directly, so
 * a bypass has no route into it. If this ever grew a union with an access check,
 * a reviewer would see an admin's whole review queue listed as things they bought.
 */
test('the library reads purchases, scoped to the caller and to active rows', () => {
  assert.match(src, /from purchases pu/)
  assert.match(src, /where pu\.user_id = \$1 and pu\.status = 'active'/)
  assert.match(src, /from purchases where user_id = \$1 and status = 'active'/)
})

test('nothing in the library is decided by staff or creator access', () => {
  assert.doesNotMatch(src, /isStaff/)
  assert.doesNotMatch(src, /sub_admin/)
  assert.doesNotMatch(src, /canWatchFull/)
  assert.doesNotMatch(src, /creator_id = \$1/)
})

test('the entitlement lookup is keyed on both the user and the video', () => {
  // Not on the user alone — that would hand one purchase to the whole catalogue.
  assert.match(src, /where user_id = \$1 and video_id = \$2 and status = 'active'/)
  assert.doesNotMatch(src, /from purchases\s+where user_id = \$1 and status = 'active'\s*`?\s*,\s*\[\s*user/)
})
