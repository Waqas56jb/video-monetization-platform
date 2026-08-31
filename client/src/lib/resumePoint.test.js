import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumePoint } from './resumePoint.js'

test('paying after the preview ran out continues from the stop, not from zero', () => {
  // Exactly the reported fault: the preview asset reset currentTime to 0.
  assert.equal(resumePoint({ watchedTo: 0, remembered: 0, stopsAt: 217, previewEnded: true }), 217)
})

test('a position that survived is used as it is', () => {
  // Watched almost to the stop: 216 is where they were, so 216 is where they
  // resume. Promoting it to 217 would be inventing a second they never saw.
  assert.equal(resumePoint({ watchedTo: 216, remembered: 0, stopsAt: 217, previewEnded: false }), 216)
  // Barely watched and the preview never ran out: one second is honest.
  assert.equal(resumePoint({ watchedTo: 1, remembered: 0, stopsAt: 217, previewEnded: false }), 1)
})

test('the furthest honest position wins', () => {
  assert.equal(resumePoint({ watchedTo: 120, remembered: 200, stopsAt: 217, previewEnded: true }), 200)
  assert.equal(resumePoint({ watchedTo: 200, remembered: 120, stopsAt: 217, previewEnded: true }), 200)
})

test('someone who paid immediately, without watching, starts at the beginning', () => {
  // No preview ran, nothing remembered: continuing from 217s would skip
  // content they never saw and never asked to skip.
  assert.equal(resumePoint({ watchedTo: 0, remembered: 0, stopsAt: 217, previewEnded: false }), 0)
  assert.equal(resumePoint({ watchedTo: 0, remembered: 0, stopsAt: 0, previewEnded: true }), 0)
})

test('nonsense in never produces a negative or NaN seek', () => {
  for (const bad of [null, undefined, NaN, -50, 'x']) {
    const at = resumePoint({ watchedTo: bad, remembered: bad, stopsAt: bad, previewEnded: true })
    assert.ok(Number.isFinite(at) && at >= 0, `got ${at} for ${String(bad)}`)
  }
})

test('the player\'s own clock is taken first, because the page stops being told', () => {
  // A halted preview reports 0 and stops firing timeupdate, so watchedTo and
  // sessionStorage can both be behind at exactly the moment it matters.
  assert.equal(
    resumePoint({ captured: 214, watchedTo: 180, remembered: 120, stopsAt: 217 }),
    214
  )
  // A captured 0 must not drag a good position down.
  assert.equal(
    resumePoint({ captured: 0, watchedTo: 180, remembered: 120, stopsAt: 217 }),
    180
  )
})

test('the preview end is a fallback for a lost position, never the largest number', () => {
  // The preview asset resets to 0 when it ends, so a lost position plus the
  // ended flag is the case this exists for.
  assert.equal(
    resumePoint({ captured: 0, watchedTo: 0, remembered: 0, stopsAt: 217, previewEnded: true }),
    217
  )
  // But a real position is never promoted to the end, even when the flag is
  // set — 200 is where they got to, and 217 would be 17 seconds they did not see.
  assert.equal(
    resumePoint({ captured: 0, watchedTo: 120, remembered: 200, stopsAt: 217, previewEnded: true }),
    200
  )
})

test('paying without watching still starts at the beginning', () => {
  // The one thing a broader rule would have broken: never skip a viewer past
  // film they have not seen.
  assert.equal(
    resumePoint({ captured: 0, watchedTo: 0, remembered: 0, stopsAt: 217, previewEnded: false }),
    0
  )
  assert.equal(
    resumePoint({ captured: 1, watchedTo: 1, remembered: 0, stopsAt: 217, previewEnded: false }),
    1
  )
})

/**
 * The end-to-end version of the same rule, written while diagnosing "a video I
 * bought shows Unlock". Once the paywall is cleared the film has to open where
 * the preview stopped, and 217s is the real preview length of the title the
 * report was about — `live-at-arusha-full-set`, 217 of 653 seconds.
 */
test('stopped at 217 s → the full player starts at 217', () => {
  // The paywall halts the preview: the player reports 0, the page captured 217.
  assert.equal(
    resumePoint({ captured: 217, watchedTo: 0, remembered: 0, stopsAt: 217, previewEnded: true }),
    217
  )
  // And with nothing captured, the preview's own stop still carries it.
  assert.equal(resumePoint({ stopsAt: 217, previewEnded: true }), 217)
  // Never past the end of the preview when that is all the evidence there is.
  assert.ok(resumePoint({ stopsAt: 217, previewEnded: true }) <= 217)
})

test('the resume second survives the round trip into the player as a number', () => {
  // StreamPlayer builds `startAt` from this; a string or NaN silently starts
  // the film at zero, which is the original complaint all over again.
  const from = resumePoint({ captured: 217, stopsAt: 217, previewEnded: true })
  assert.equal(typeof from, 'number')
  assert.ok(Number.isFinite(from))
  assert.equal(Math.floor(from), 217)
})
