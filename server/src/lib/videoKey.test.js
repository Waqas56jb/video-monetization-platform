import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugFallbacks, isUuidKey } from './videoKey.js'

test('slug lookup tries the exact key first', () => {
  assert.deepEqual(slugFallbacks('studio-session-track-4')[0], 'studio-session-track-4')
})

test('legacy demo suffix still resolves', () => {
  const keys = slugFallbacks('studio-session-track-4-demoabc12')
  assert.ok(keys.includes('studio-session-track-4-demoabc12'))
  assert.ok(keys.includes('studio-session-track-4'))
})

test('uuid keys are distinguished from slugs so Postgres can use videos_pkey', () => {
  assert.equal(isUuidKey('607d4719-1905-4f1a-9c55-993647a543d0'), true)
  assert.equal(isUuidKey('how-to-cook-pilau-properly'), false)
})
