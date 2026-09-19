import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * The progress storm (2026-09-19). Signed in, on a paid video you do not
 * own, the moment the free preview reached its end the watch page sent 918
 * progress PUTs in 90 seconds — 690 refused with 429 — and emptied its
 * owner's whole rate-limit allowance: Trending, the next video, Unlock, the
 * payment sheet and its retry all answered "Too many requests" from ONE
 * open tab. Evidence: scripts/e2e/evidence/rate-limit-2026-09-19-progress-storm-before.txt.
 *
 * Three rules, each pinned to its line:
 *   1. reportProgress never sends the same second twice and keeps one request
 *      in flight per video, latest value wins — forced or not.
 *   2. StreamPlayer parks the player at the cut-off ONCE per crossing and
 *      re-arms only when the viewer genuinely goes back a second or more.
 *   3. The preview-boundary branch of onTimeUpdate fires once.
 */
const dir = dirname(fileURLToPath(import.meta.url))
const watch = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
const player = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

test('rule 1: the same second is never sent twice, and one progress request is in flight at a time', () => {
  assert.match(watch, /const progressInFlight = useRef\(false\)/)
  assert.match(watch, /const progressPending = useRef\(null\)/)
  assert.match(watch, /const lastSent = useRef\(-1\)/)
  assert.match(watch, /if \(s === lastSent\.current\) return/)
  assert.match(watch, /if \(progressInFlight\.current\) \{\s*progressPending\.current = s\s*return\s*\}/)
  // The pending value is sent once the in-flight one settles — and only if it is new.
  assert.match(watch, /if \(next != null && next !== lastSent\.current\) send\(next\)/)
  // `force` still bypasses the ten-second throttle, and nothing else.
  assert.match(watch, /if \(!force && Math\.abs\(s - lastReported\.current\) < 10\) return/)
})

test('rule 2: the player is parked at the cut-off once per crossing, with a one-second re-arm', () => {
  const fn = player.slice(player.indexOf('const haltIfDue'), player.indexOf('player.addEventListener(\'timeupdate\', haltIfDue)'))
  assert.match(fn, /if \(limit > 0 && at < limit - 1\) stopped = false/, 'hysteresis, not jitter')
  assert.doesNotMatch(fn, /at < limit - 0\.15\) stopped = false/, 'the old jitter re-arm is gone')
  const pauseAt = fn.indexOf('player.pause?.()')
  const guardAt = fn.indexOf('if (stopped) return')
  assert.ok(guardAt > -1 && guardAt < pauseAt, 'the once-only guard sits BEFORE the pause + seek')
})

test('rule 3: the preview-boundary progress write happens once', () => {
  assert.match(watch, /current >= previewSeconds - 0\.4 && !previewRanOut\.current\) \{/)
})
