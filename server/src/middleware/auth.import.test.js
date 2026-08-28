import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const auth = readFileSync(join(here, 'auth.js'), 'utf8')
const admin = readFileSync(join(here, '../modules/admin.routes.js'), 'utf8')
const staff = readFileSync(join(here, '../modules/staff.routes.js'), 'utf8')
const account = readFileSync(join(here, '../modules/account.routes.js'), 'utf8')

test('requireAuth still rejects blocked and suspended accounts after cache', () => {
  assert.match(auth, /user\.status === 'blocked'/)
  assert.match(auth, /This account has been blocked/)
  assert.match(auth, /user\.status === 'suspended' && req\.method !== 'GET'/)
  assert.match(auth, /This account is suspended and cannot make changes/)
  assert.match(auth, /loadProfileCached/)
})

test('role and status writes bust the profile cache', () => {
  assert.match(admin, /invalidateProfileCache\(updated\.id\)/)
  assert.match(admin, /invalidateProfileCache\(app\.user_id\)/)
  assert.match(admin, /invalidateProfileCache\(target\.id\)/)
  assert.match(staff, /invalidateProfileCache\(p\.id\)/)
  assert.match(account, /invalidateProfileCache\(req\.user\.id\)/)
})
