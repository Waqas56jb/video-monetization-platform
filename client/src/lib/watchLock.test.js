import { test } from 'node:test'
import assert from 'node:assert/strict'
import { watchLockState } from './watchLock.js'

/**
 * The reported failure, from the page's side: a film the viewer bought showed
 * Unlock and stopped at the preview cut-off.
 *
 * The server was cleared first — resolveAccess returns owned:true for that
 * pairing against production data — so what these pin down is that a correct
 * server answer is never turned into a paywall on the way to the screen.
 */

const PAID = { id: 'vid-1', slug: 'live-at-arusha-full-set', priceTzs: 5000 }
const full = { access: { canWatchFull: true, owned: true }, playback: { kind: 'full' } }
const preview = { access: { canWatchFull: false, owned: false }, playback: { kind: 'preview' } }

test('an owned video shows no Unlock and is not locked', () => {
  const s = watchLockState({ playback: full, loading: false, videoId: PAID.slug, video: PAID })
  assert.equal(s.needsPayment, false, 'the Unlock CTA is gated on this')
  assert.equal(s.locked, false)
  assert.equal(s.owned, true)
  assert.equal(s.accessReady, true)
})

test('a video the viewer does not own shows Unlock', () => {
  // The opposite direction, so the test above cannot pass by never locking.
  const s = watchLockState({ playback: preview, loading: false, videoId: PAID.slug, video: PAID })
  assert.equal(s.needsPayment, true)
  assert.equal(s.locked, true)
  assert.equal(s.owned, false)
})

test('nothing is locked while the answer is still in flight', () => {
  // Locking by default flashed the paywall on films the viewer owns.
  const loading = watchLockState({ playback: null, loading: true, videoId: PAID.slug, video: PAID })
  assert.equal(loading.locked, false)
  assert.equal(loading.needsPayment, false)
  assert.equal(loading.accessReady, false)

  // A payload that has arrived but is still marked loading is not an answer yet.
  const midFlight = watchLockState({ playback: preview, loading: true, videoId: PAID.slug, video: PAID })
  assert.equal(midFlight.accessReady, false)
  assert.equal(midFlight.needsPayment, false)
})

test('a purchase of A cannot unlock B', () => {
  // justPaidFor holds an id, never a boolean. As a boolean it stayed true on
  // every video the viewer opened next.
  const b = { id: 'vid-2', slug: 'other-film', priceTzs: 1000 }
  const s = watchLockState({
    playback: preview,
    loading: false,
    justPaidFor: 'vid-1',
    videoId: b.slug,
    video: b,
  })
  assert.equal(s.justPaid, false)
  assert.equal(s.needsPayment, true)
  assert.equal(s.owned, false)
})

test('the video just paid for is unlocked immediately, by id or by slug', () => {
  for (const key of ['vid-1', 'live-at-arusha-full-set']) {
    const s = watchLockState({
      playback: preview, // the server has not caught up yet
      loading: false,
      justPaidFor: key,
      videoId: PAID.slug,
      video: PAID,
    })
    assert.equal(s.justPaid, true, `${key} should count as the purchase`)
    assert.equal(s.needsPayment, false)
    assert.equal(s.owned, true)
  }
})

test('a free video is never a paywall, whatever its price field says', () => {
  const free = { id: 'vid-3', slug: 'free-film', priceTzs: 0 }
  const s = watchLockState({ playback: preview, loading: false, videoId: free.slug, video: free })
  assert.equal(s.needsPayment, false, 'a price of zero has nothing to sell')
})

test('a missing access object is treated as locked, not as full access', () => {
  // Fail closed: a malformed payload must never sign the full film.
  const s = watchLockState({ playback: {}, loading: false, videoId: PAID.slug, video: PAID })
  assert.equal(s.locked, true)
  assert.equal(s.needsPayment, true)
})
