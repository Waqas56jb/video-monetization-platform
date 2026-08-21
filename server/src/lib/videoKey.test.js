import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugFallbacks } from './videoKey.js'

test('slug lookup tries the exact key first', () => {
  assert.deepEqual(slugFallbacks('studio-session-track-4')[0], 'studio-session-track-4')
})

test('legacy demo suffix still resolves', () => {
  const keys = slugFallbacks('studio-session-track-4-demoabc12')
  assert.ok(keys.includes('studio-session-track-4-demoabc12'))
  assert.ok(keys.includes('studio-session-track-4'))
})
