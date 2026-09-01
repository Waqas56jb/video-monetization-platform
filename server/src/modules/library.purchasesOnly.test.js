import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const routes = readFileSync(join(dir, 'library.routes.js'), 'utf8')
/**
 * The queries moved to `lib/libraryRows.js` when My Library grew its other three
 * rows. The promise below is about the QUERY, not about which file it sits in,
 * so this reads both — narrowing it to whichever file still happened to match
 * would have quietly stopped testing anything.
 */
const rows = readFileSync(join(dir, '..', 'lib', 'libraryRows.js'), 'utf8')
const src = routes + rows

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

/**
 * And the three new rows are the viewer's own history, keyed the same way.
 *
 * Continue Watching, My List and Recently Watched all read tables scoped to
 * `user_id = $1`. A row that leaked another viewer's history would be the same
 * class of mistake as a library that listed somebody else's purchases.
 */
test('every library row is scoped to the caller', () => {
  assert.match(rows, /from watch_progress wp[\s\S]*?where wp\.user_id = \$1/)
  assert.match(rows, /from saved_videos sv[\s\S]*?where sv\.user_id = \$1/)
  // Hidden rows stay out of both history rows.
  assert.match(rows, /wp\.hidden_at is null/)
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
