import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hasCreatorAccess } from './auth.js'

/**
 * Found 2026-10-30 while revoking the self-service creators: the admin
 * "Revoke" sets the role back to viewer and keeps the creator_profiles row
 * (earnings history), but studio access was granted to "anyone with a creator
 * profile" — so a revoked creator kept the studio. The role is the authority.
 */
test('studio access follows the role alone — a revoked creator (viewer + old creator profile) is out', async () => {
  assert.equal(await hasCreatorAccess({ id: 'x', role: 'creator' }), true)
  assert.equal(await hasCreatorAccess({ id: 'x', role: 'admin' }), true)
  assert.equal(await hasCreatorAccess({ id: 'x', role: 'sub_admin' }), true)
  assert.equal(await hasCreatorAccess({ id: 'revoked', role: 'viewer' }), false, 'no database lookup can let a viewer in')
  assert.equal(await hasCreatorAccess(null), false)
  const src = readFileSync(new URL('./auth.js', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('export async function hasCreatorAccess'), src.indexOf('export function requireCreator'))
  assert.doesNotMatch(fn, /creator_profiles/)
})

test('the account\'s sides follow the role too', () => {
  const src = readFileSync(new URL('../lib/authdb.js', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('export async function getSides'), src.indexOf('export async function enableViewerSide'))
  assert.doesNotMatch(fn, /creator_profiles|has_creator/)
  assert.match(fn, /creator: row\.role === 'creator' \|\| staff/)
})

test('/me sends the creator profile only to an account the role lets into the studio', () => {
  const src = readFileSync(new URL('../modules/auth.routes.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const me = src.slice(src.indexOf("'/me',"), src.indexOf('res.json({ ...shape(req.user, null)'))
  assert.ok(me.indexOf('const sides = await getSides') < me.indexOf('from creator_profiles'), 'sides decided first')
  assert.match(me, /const row = sides\.creator\s*\?/)
})
