import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { midrollSchedule } from './ads.js'

const src = readFileSync(fileURLToPath(new URL('./ads.js', import.meta.url)), 'utf8')

const DEFAULTS = {
  midroll_after_secs: 300, // 5 min
  midroll_long_after_secs: 1200, // 20 min
  midroll_gap_secs: 600, // 10 min
  midroll_max_count: 3,
  midroll_position_pct: 70, // migration 038's default — see below for why 70, not 50
}

test('under 5 minutes: no mid-roll at all', () => {
  assert.deepEqual(midrollSchedule(200, DEFAULTS), [])
  // The boundary is inclusive on the short side, unchanged from the
  // single-mid-roll rule this replaces — exactly 5 minutes still gets none.
  assert.deepEqual(midrollSchedule(300, DEFAULTS), [])
})

/**
 * report2.txt §4: the client asked for the single mid-roll to sit later
 * than the previous hard-coded midpoint (duration/2). midroll_position_pct
 * (migration 038, default 70) replaces that constant — these values are
 * duration * 0.7, not duration * 0.5.
 */
test('5 to 20 minutes: exactly one mid-roll, at midroll_position_pct through the file', () => {
  assert.deepEqual(midrollSchedule(301, DEFAULTS), [210])
  assert.deepEqual(midrollSchedule(600, DEFAULTS), [420])
  assert.deepEqual(midrollSchedule(1199, DEFAULTS), [839])
})

test('midroll_position_pct is configurable, and clamped to its 20-90 bounds', () => {
  assert.deepEqual(midrollSchedule(1000, { ...DEFAULTS, midroll_position_pct: 50 }), [500])
  assert.deepEqual(midrollSchedule(1000, { ...DEFAULTS, midroll_position_pct: 20 }), [200])
  assert.deepEqual(midrollSchedule(1000, { ...DEFAULTS, midroll_position_pct: 90 }), [900])
  // Out-of-range input (a stale/bad settings row) clamps rather than placing
  // a mark in the first or last instant of the file.
  assert.deepEqual(midrollSchedule(1000, { ...DEFAULTS, midroll_position_pct: 5 }), [200])
  assert.deepEqual(midrollSchedule(1000, { ...DEFAULTS, midroll_position_pct: 99 }), [900])
})

test('a settings row from before migration 038 (no midroll_position_pct at all) still defaults to 70%', () => {
  const preMigration = { midroll_after_secs: 300, midroll_long_after_secs: 1200, midroll_gap_secs: 600, midroll_max_count: 3 }
  assert.deepEqual(midrollSchedule(1000, preMigration), [700])
})

test('20 minutes or more: repeating every 10 minutes, capped at 3', () => {
  assert.deepEqual(midrollSchedule(1200, DEFAULTS), [600])
  assert.deepEqual(midrollSchedule(1800, DEFAULTS), [600, 1200])
  assert.deepEqual(midrollSchedule(2400, DEFAULTS), [600, 1200, 1800])
  // A 90-minute film still gets only 3 -- the cap holds regardless of length.
  assert.deepEqual(midrollSchedule(5400, DEFAULTS), [600, 1200, 1800])
})

test('never places a mark inside the last half-gap of the file', () => {
  // 20:30 -- the second mark (1200s) would leave only 30s of film after it,
  // well under the 300s (half of a 600s gap) margin, so it is dropped.
  const marks = midrollSchedule(1230, DEFAULTS)
  for (const m of marks) assert.ok(m < 1230 - 300, `mark ${m} leaves too little film after it`)
})

test('admin-configured settings are honoured, not the defaults', () => {
  const custom = { midroll_after_secs: 60, midroll_long_after_secs: 300, midroll_gap_secs: 120, midroll_max_count: 5 }
  // No midroll_position_pct in `custom` either — same as a pre-038 row,
  // defaults to 70%: Math.floor(90 * 0.7) = 62 (floating point: 90*0.7 is
  // 62.999...998, not exactly 63).
  assert.deepEqual(midrollSchedule(90, custom), [62])
  assert.deepEqual(midrollSchedule(600, custom), [120, 240, 360, 480])
})

test('a converted Paid Premiere is indistinguishable from a native Free + Ads video, structurally', () => {
  // Verified live against production (report.txt, Issue 4): a video that
  // reached free_with_ads through the premiere-expiry cron serves the exact
  // same pre/mid/post-roll breaks as one that started that way. This pins
  // the reason that holds: the function that decides eligibility to carry
  // ads at all reads only access_type/ads_enabled/publication/ownership --
  // nothing about premiere or unlock history -- so there is no code path
  // left to special-case a converted title, deliberately or by accident.
  const fn = src.slice(src.indexOf('export async function adEligibility'), src.indexOf('export async function pickCampaign'))
  assert.doesNotMatch(fn, /premiere|paid_unlocks|paidUnlocks|wasPremiere/i)
  assert.match(fn, /video\.access_type !== 'free_with_ads'/)

  // Same for the schedule itself -- midrollSchedule takes only a duration
  // and the settings row, nothing video-specific beyond its length.
  assert.doesNotMatch(midrollSchedule.toString(), /premiere|paid_unlocks|access_type/i)
})
