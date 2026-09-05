import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const adminSrc = readFileSync(join(dir, 'admin.routes.js'), 'utf8')
const creatorSrc = readFileSync(join(dir, 'videos.routes.js'), 'utf8')

/**
 * Buyers keep access when a video's release model or Original flag changes,
 * for a structural reason rather than a tested-and-hoped-for one:
 * entitlement is decided entirely by `purchases.status = 'active'`
 * (see services/entitlement.js), which has no foreign key or dependency on
 * `videos.release_model` or `videos.is_original`. Changing either is a
 * plain `update videos set ...` with no cascade into `purchases` or
 * `earnings` — the same reasoning that already makes unpublish safe for
 * existing buyers (M2-VERIFY.md C7). This pins that neither of the two
 * write sites for these columns ever touches either table.
 */
test('setting releaseModel/isOriginal never writes purchases or earnings', () => {
  const adminPatch = adminSrc.slice(adminSrc.indexOf("'/videos/:id'"), adminSrc.indexOf("'/videos/:id/unpublish'"))
  assert.match(adminPatch, /release_model\s*=/)
  assert.match(adminPatch, /is_original\s*=/)
  assert.doesNotMatch(adminPatch, /update purchases/i)
  assert.doesNotMatch(adminPatch, /update earnings/i)

  const creatorPatch = creatorSrc.slice(creatorSrc.indexOf('release_model'), creatorSrc.indexOf('release_model') + 800)
  assert.doesNotMatch(creatorPatch, /update purchases/i)
  assert.doesNotMatch(creatorPatch, /update earnings/i)
})

/**
 * A creator only ever moves a video between permanent_paid and
 * premiere_to_free (derived from the accessType they already choose);
 * `exclusive` has no accessType analogue, so the creator-facing update
 * schema must not accept releaseModel or isOriginal directly — only the
 * admin route may.
 */
test('exclusive and the Original flag are admin-only — not in the creator update schema', () => {
  const updateSchema = creatorSrc.slice(creatorSrc.indexOf('const updateSchema'), creatorSrc.indexOf('router.patch'))
  assert.doesNotMatch(updateSchema, /releaseModel/)
  assert.doesNotMatch(updateSchema, /isOriginal/)

  const patchStart = adminSrc.indexOf("'/videos/:id',")
  const adminSchema = adminSrc.slice(patchStart, adminSrc.indexOf('asyncHandler', patchStart))
  assert.match(adminSchema, /releaseModel: z\.enum\(\['permanent_paid', 'premiere_to_free', 'exclusive'\]\)/)
  assert.match(adminSchema, /isOriginal: z\.boolean\(\)\.optional\(\)/)
})

/**
 * An ordinary creator edit (price, preview length, anything but accessType
 * itself) must never silently undo an admin's `exclusive` designation.
 */
test('an exclusive video keeps that release model through an unrelated creator edit', () => {
  const creatorPatch = creatorSrc.slice(creatorSrc.indexOf('release_model'), creatorSrc.indexOf('release_model') + 400)
  assert.match(creatorPatch, /case when release_model = 'exclusive' then release_model/)

  const adminPatch = adminSrc.slice(adminSrc.indexOf('release_model        = coalesce'), adminSrc.indexOf('release_model        = coalesce') + 400)
  assert.match(adminPatch, /case when release_model = 'exclusive' then release_model/)
})
