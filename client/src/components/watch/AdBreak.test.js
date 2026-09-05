import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'AdBreak.jsx'), 'utf8')

/**
 * The countdown used to start the moment an advert was REQUESTED, so it
 * could run to zero over a black screen before anything had shown. The fix
 * ties it to the ad's own media time instead — this pins that wiring in
 * source rather than only in the pure `adSkip.js` helpers, because the bug
 * was in how AdBreak used them, not in the helpers themselves.
 */
test('the skip countdown is set only inside the airtime-gated branch, never on mount or on ready', () => {
  // `elapsed` (what the countdown counts down from) and `playing` (what
  // gates the Skip button rendering at all) must both be written only by
  // `noteAirtime`, and `noteAirtime` must bail out before touching either
  // one unless the ad's own current time has actually cleared the floor.
  assert.match(src, /const noteAirtime = \(current\) => \{/)
  const noteAirtimeBody = src.slice(src.indexOf('const noteAirtime = (current) => {'), src.indexOf('const finish = (completed)'))
  assert.match(noteAirtimeBody, /if \(!adAirtimeStarted\(t\)\) return/)
  assert.match(noteAirtimeBody, /setPlaying\(true\)/)
  assert.match(noteAirtimeBody, /setElapsed\(watched\.current\)/)

  // Only one call site for each setter in the whole file — if a second one
  // appears (e.g. an ad-requested/mount/ready handler flipping `playing` or
  // seeding `elapsed`), the countdown can run before the ad has picture again.
  for (const setter of ['setPlaying', 'setElapsed']) {
    const hits = src.match(new RegExp(`\\b${setter}\\(`, 'g')) || []
    assert.equal(hits.length, 1, `${setter} must be called from exactly one place — noteAirtime`)
  }

  // The countdown/Skip button itself must depend on both flags together —
  // `playing` alone is what `noteAirtime` actually gates on, so rendering
  // must not invent a path that shows Skip without it.
  assert.match(src, /\{skippable && playing && \(/)

  // `onTimeUpdate` is the only thing wired to `noteAirtime` — not `onReady`,
  // which fires when the iframe has loaded, not when the ad has played.
  assert.match(src, /onTimeUpdate=\{noteAirtime\}/)
  assert.doesNotMatch(src, /onReady=\{noteAirtime\}/)
})

/**
 * Ad-failure must not fake a timer over the film — the content underneath
 * has to be free to start the instant the break gives up, with no billing
 * for a delivery that never happened.
 */
test('every way an ad can fail calls finish(false), never a fake success', () => {
  assert.match(src, /if \(!ad\.iframe\) \{\s*\n\s*finish\(false\)/)
  assert.match(src, /const bail = setTimeout\(\(\) => finish\(false\), cap \* 1000\)/)
  assert.match(src, /const fail = setTimeout\(\(\) => \{\s*\n\s*if \(!playing && !done\.current\) finish\(false\)/)
  assert.doesNotMatch(src, /finish\(true\)[\s\S]{0,80}setTimeout/)
})
