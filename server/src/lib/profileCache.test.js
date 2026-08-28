import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  loadProfileCached,
  invalidateProfileCache,
  peekProfileCache,
  PROFILE_CACHE_TTL_MS,
} from './profileCache.js'

test('profiles are cached per userId and served without a second load', async () => {
  invalidateProfileCache()
  let loads = 0
  const loader = async (id) => {
    loads += 1
    return { id, role: 'viewer', status: 'active' }
  }
  const a = await loadProfileCached('u1', loader)
  const b = await loadProfileCached('u1', loader)
  assert.equal(loads, 1)
  assert.equal(a.status, 'active')
  assert.equal(b.role, 'viewer')
  assert.equal(PROFILE_CACHE_TTL_MS, 60_000)
})

test('invalidate drops that user so the next load hits the loader', async () => {
  invalidateProfileCache()
  let loads = 0
  const loader = async (id) => {
    loads += 1
    return { id, role: 'viewer', status: loads === 1 ? 'active' : 'blocked' }
  }
  await loadProfileCached('u2', loader)
  assert.equal(peekProfileCache('u2').status, 'active')
  invalidateProfileCache('u2')
  assert.equal(peekProfileCache('u2'), null)
  const again = await loadProfileCached('u2', loader)
  assert.equal(loads, 2)
  assert.equal(again.status, 'blocked')
})
