import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creatorForSide, sideFromQuery } from './creatorSideShape.js'

const FULL = {
  displayName: 'Asha Mwinyi',
  bio: 'Filmmaker',
  category: 'Documentary',
  socials: ['https://instagram.com/asha'],
  followers: 1200,
  verified: true,
  revenueSplitPercent: 65,
  payoutPhone: '0712000000',
  payoutMethod: 'mpesa',
}

test('creatorForSide: null creator stays null on either side', () => {
  assert.equal(creatorForSide(null, 'creator'), null)
  assert.equal(creatorForSide(null, 'viewer'), null)
})

test('creatorForSide: the creator side gets the object unchanged', () => {
  assert.deepEqual(creatorForSide(FULL, 'creator'), FULL)
})

test('creatorForSide: the viewer side gets presence + displayName only', () => {
  const reduced = creatorForSide(FULL, 'viewer')
  assert.deepEqual(reduced, { exists: true, displayName: 'Asha Mwinyi' })
  assert.equal('payoutPhone' in reduced, false)
  assert.equal('payoutMethod' in reduced, false)
  assert.equal('revenueSplitPercent' in reduced, false)
  assert.equal('category' in reduced, false)
  assert.equal('socials' in reduced, false)
  assert.equal('followers' in reduced, false)
  assert.equal('bio' in reduced, false)
})

test('creatorForSide: default-deny — anything other than the literal "creator" reduces', () => {
  assert.deepEqual(creatorForSide(FULL, undefined), { exists: true, displayName: 'Asha Mwinyi' })
  assert.deepEqual(creatorForSide(FULL, null), { exists: true, displayName: 'Asha Mwinyi' })
  assert.deepEqual(creatorForSide(FULL, 'admin'), { exists: true, displayName: 'Asha Mwinyi' })
})

test('sideFromQuery: only the literal ?side=creator resolves to creator', () => {
  assert.equal(sideFromQuery({ query: { side: 'creator' } }), 'creator')
  assert.equal(sideFromQuery({ query: { side: 'viewer' } }), 'viewer')
  assert.equal(sideFromQuery({ query: {} }), 'viewer')
  assert.equal(sideFromQuery({ query: { side: 'CREATOR' } }), 'viewer')
})
