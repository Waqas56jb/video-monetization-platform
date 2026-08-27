import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CONTENT_TYPES } from '../lib/creatorApplication.js'

const dir = dirname(fileURLToPath(import.meta.url))

test('register never mints a creator_profiles row (application is the only door)', () => {
  const src = readFileSync(join(dir, 'auth.routes.js'), 'utf8')
  assert.doesNotMatch(
    src,
    /ensureCreatorSide/,
    'signup used to call ensureCreatorSide and skip the application queue'
  )
  const registerBlock = src.slice(src.indexOf("'/register'"), src.indexOf("'/login'"))
  assert.doesNotMatch(
    registerBlock,
    /insert into creator_profiles/,
    'fresh Create signup used to insert creator_profiles before anyone reviewed them'
  )
  assert.match(
    registerBlock,
    /needsCreatorApplication/,
    'Create signup must send the person to apply, not into the studio'
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
