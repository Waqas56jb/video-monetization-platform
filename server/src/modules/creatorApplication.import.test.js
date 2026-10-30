import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CONTENT_TYPES } from '../lib/creatorApplication.js'

const dir = dirname(fileURLToPath(import.meta.url))

/**
 * The rule has moved twice, both times the client's call.
 *
 * Until 2026-09-02: register never minted a creator; the application was the
 * only door. 2026-09-02 → 2026-10-30: signing up on Create opened the studio on
 * the spot. From 2026-10-30, back to the application, now final: "VIEWER →
 * APPLY TO BECOME A CREATOR → APPLICATION FORM → SUPER ADMIN REVIEWS →
 * APPROVE/REJECT → ONLY APPROVED CREATOR GETS STUDIO/CREATOR ACCESS."
 */
test('signup only ever makes a Watch account; asking for Create goes to the application', () => {
  const src = readFileSync(join(dir, 'auth.routes.js'), 'utf8')
  const registerBlock = src.slice(src.indexOf("'/register'"), src.indexOf("'/login'"))

  assert.doesNotMatch(registerBlock, /ensureCreatorSide/, 'signup must never open the Create side')
  assert.doesNotMatch(registerBlock, /insert into creator_profiles/, 'signup must never mint a creator profile')
  assert.doesNotMatch(registerBlock, /role, viewer_enabled\)\s*values \(\$1,\$2,\$3,\$4,\$5/, 'the role is not taken from the request')
  assert.match(registerBlock, /values \(\$1,\$2,\$3,\$4,'viewer',true\)/g)
  assert.match(registerBlock, /enableViewerSide/)
  assert.match(registerBlock, /side: 'viewer'/)
  assert.match(registerBlock, /needsCreatorApplication: appliedForCreator && !sides\.creator/)

  // The login no longer tells anyone to "sign up on Create".
  const loginBlock = src.slice(src.indexOf("'/login'"), src.indexOf("'/refresh'"))
  assert.doesNotMatch(loginBlock, /Sign up on Create/)
  assert.match(loginBlock, /apply to become a creator/)
})

test('approving an application is the only place an account becomes a creator', () => {
  // authdb.js held the old self-service grant (ensureCreatorSide); it must stay gone.
  const files = ['auth.routes.js', 'account.routes.js', 'admin.routes.js', '../lib/authdb.js'].map((f) => [f, readFileSync(join(dir, f), 'utf8')])
  const grants = files.flatMap(([f, s]) => [...s.matchAll(/set role = 'creator'|insert into creator_profiles/g)].map(() => f))
  assert.deepEqual([...new Set(grants)], ['admin.routes.js'])
  const admin = files.find(([f]) => f === 'admin.routes.js')[1]
  const approve = admin.slice(admin.indexOf('Approval is the only place a viewer becomes a creator'))
  assert.match(approve.slice(0, 4000), /set role = 'creator'/)
})

test('a Create account still cannot publish anything by itself', () => {
  /**
   * The load-bearing half. Self-serve signup is only safe because reaching
   * viewers is a separate, administrator-controlled step — so that step is
   * asserted here rather than assumed.
   */
  const videos = readFileSync(join(dir, 'videos.routes.js'), 'utf8')
  assert.match(
    videos,
    /v\.is_published = true`,\s*`v\.review_status = 'approved'/,
    'the public listing must require both published and approved'
  )
  assert.match(
    videos,
    /where is_published and review_status = 'approved'/,
    'and so must the public catalogue query'
  )
  const admin = readFileSync(join(dir, 'admin.routes.js'), 'utf8')
  assert.match(
    admin,
    /is_published\s*=\s*true/,
    'only the admin route may set is_published'
  )
})

test('creator application collects the assessment fields the client asked for', () => {
  const src = readFileSync(join(dir, 'account.routes.js'), 'utf8')
  for (const field of [
    'contentType',
    'followers',
    'engagement',
    'sampleWork',
    'bio',
    'location',
    'whyJoin',
  ]) {
    assert.match(src, new RegExp(field), `application schema missing ${field}`)
  }
})

test('content types are a fixed list, not free text', () => {
  assert.ok(CONTENT_TYPES.includes('Long-form video'))
  assert.ok(CONTENT_TYPES.includes('Mixed / other'))
  assert.equal(CONTENT_TYPES.length >= 5, true)
  const clientCopy = readFileSync(
    join(dir, '../../../client/src/data/copy.js'),
    'utf8'
  )
  for (const t of CONTENT_TYPES) {
    assert.match(clientCopy, new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
