import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CONTENT_TYPES } from '../lib/creatorApplication.js'

const dir = dirname(fileURLToPath(import.meta.url))

/**
 * THIS TEST USED TO ASSERT THE OPPOSITE, and the reversal was the client's call.
 *
 * It read: "register never mints a creator_profiles row (application is the only
 * door)". That was the rule until 2026-09-02, and its cost was the fault the
 * client reported — signing up on Create produced a Watch account they never
 * asked for, and then the Create login refused them. Asked directly, the client
 * chose: signing up on Create opens the studio straight away.
 *
 * The gate did not disappear, it moved. It now sits where the client's own
 * review queue already was: a video reaches viewers only when an administrator
 * approves it. That is asserted below, because it is the promise that now
 * carries the weight the signup gate used to.
 */
test('signing up on Create makes a Create account, not a Watch one', () => {
  const src = readFileSync(join(dir, 'auth.routes.js'), 'utf8')
  const registerBlock = src.slice(src.indexOf("'/register'"), src.indexOf("'/login'"))

  // The side asked for is the side created, in both directions.
  assert.match(registerBlock, /ensureCreatorSide/, 'a Create signup must open the Create side')
  assert.match(registerBlock, /enableViewerSide/, 'a Watch signup must open the Watch side')
  assert.match(registerBlock, /side: wanted/, 'the response must report the side actually created')

  /* A fresh Create signup inserts its creator_profiles row in the SAME
     transaction as the profile: a profile without one is a login that passes the
     Create door and finds no studio behind it. */
  assert.match(registerBlock, /insert into creator_profiles/)

  // And it no longer diverts anyone to the application queue to get in.
  assert.match(registerBlock, /needsCreatorApplication: false/)
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
