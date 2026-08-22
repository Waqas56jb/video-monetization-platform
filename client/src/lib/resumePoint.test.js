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
