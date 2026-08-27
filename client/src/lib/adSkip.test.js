import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AD_AIRTIME_FLOOR, adAirtimeStarted, adCanSkip, adSkipRules } from './adSkip.js'

test('ad skip: 0 is non-skippable, 10 waits for 10s of playback', () => {
  assert.equal(adSkipRules(0).skippable, false)
  assert.equal(adCanSkip(0, 30, true), false)
  assert.equal(adCanSkip(10, 9, true), false)
  assert.equal(adCanSkip(10, 10, true), true)
  assert.equal(adCanSkip(10, 10, false), false)
})

test('black screen never counts as airtime, even if the panel has been up for seconds', () => {
  assert.equal(adAirtimeStarted(0), false)
  assert.equal(adAirtimeStarted(0.1), false)
  assert.equal(adAirtimeStarted(AD_AIRTIME_FLOOR), true)
  assert.equal(adCanSkip(5, 8, false), false)
  assert.equal(adCanSkip(5, 4.9, true), false)
  assert.equal(adCanSkip(5, 5, true), true)
})
