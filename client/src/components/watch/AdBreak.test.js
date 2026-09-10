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

/**
 * Traced live against production (2026-09-07): a cold Cloudflare Stream
 * player can easily spend 6-7s on its own SDK bootstrap and first segment
 * before an ad genuinely reaches airtime, so a 4000ms "never started"
 * watchdog was firing on a healthy ad, not a broken one — confirmed by a
 * captured network trace where the ad's own init.mp4 requests were still
 * in flight, not failed, the instant it fired. And the wait itself must
 * never be plain black, the same complaint this exact overlay already
 * shipped once before for the main content player.
 */
test('the "advert never started" watchdog clears a cold Cloudflare bootstrap, and the wait shows the ad\'s own poster', () => {
  assert.match(src, /if \(!playing && !done\.current\) finish\(false\)\s*\n\s*\}, 10000\)/)
  assert.doesNotMatch(src, /\}, 4000\)/)
  assert.match(src, /poster=\{ad\.thumbnail\}/)
})

/**
 * Measured live against production (report2.txt §4, 2026-09-10): a Playwright
 * DOM-timing trace found a 4.4s window — the player had already reported
 * `canplay` (booted) but airtime had not started (playing) — where nothing
 * rendered at all, because the loading note was gated `!booted && !playing`
 * and vanished the instant `booted` flipped true. Feedback now depends only
 * on `!playing`, so something is on screen for the whole wait, with copy that
 * tells the two phases apart.
 */
test('the loading note stays up for the whole wait to airtime, not just until the player is ready', () => {
  assert.match(src, /\{!playing && <p className="ad-loading-note">\{booted \? 'Advert starting…' : 'Advert loading…'\}<\/p>\}/)
  assert.doesNotMatch(src, /\{!booted && !playing && </, 'the note must not go dark once booted flips before playing does')
})
