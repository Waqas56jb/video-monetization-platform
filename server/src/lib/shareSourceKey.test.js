import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shareSourceKey } from './shareMeta.js'

/**
 * The same video must hash to the same key from every query that feeds it.
 *
 * Two shapes reach this function. buildShareCard and loadShareMeta select
 * `coalesce(cp.display_name, p.full_name) as creator_name`. videos.routes'
 * SELECT_PUBLIC selects `p.full_name as creator_name` and puts the display name
 * in a separate `creator_display`.
 *
 * That difference was invisible while the key only round-tripped within one call
 * site. Migration 030 made the route compare its key against the one the builder
 * stored, and six of eight published videos mismatched — reporting 'building'
 * for a card that was current, and queuing a rebuild on every watch request.
 */
const base = { title: 'Live at Arusha', thumbnail_url: 'thumb-abc' }

test('both query shapes hash a video identically', () => {
  const fromBuilder = { ...base, creator_name: 'Arusha Live' } // coalesce(display, full)
  const fromRoute = { ...base, creator_name: 'John Mwangi', creator_display: 'Arusha Live' }
  assert.equal(shareSourceKey(fromRoute), shareSourceKey(fromBuilder))
})

test('a creator with no display name still agrees', () => {
  const fromBuilder = { ...base, creator_name: 'John Mwangi' }
  const fromRoute = { ...base, creator_name: 'John Mwangi', creator_display: null }
  assert.equal(shareSourceKey(fromRoute), shareSourceKey(fromBuilder))
})

test('the key still changes when the card would actually look different', () => {
  // If it stopped doing this, a renamed video would keep a stale card for ever.
  const a = shareSourceKey({ ...base, creator_name: 'X' })
  assert.notEqual(a, shareSourceKey({ ...base, title: 'A different title', creator_name: 'X' }))
  assert.notEqual(a, shareSourceKey({ ...base, thumbnail_url: 'thumb-zzz', creator_name: 'X' }))
  assert.notEqual(a, shareSourceKey({ ...base, creator_name: 'Y' }))
})

test('the display name is what the card shows, so it is what the key follows', () => {
  // Changing only the display name must invalidate the card.
  const before = shareSourceKey({ ...base, creator_name: 'John', creator_display: 'Old Studio' })
  const after = shareSourceKey({ ...base, creator_name: 'John', creator_display: 'New Studio' })
  assert.notEqual(before, after)
})

test('a missing row does not throw', () => {
  assert.equal(typeof shareSourceKey(undefined), 'string')
  assert.equal(typeof shareSourceKey({}), 'string')
})
