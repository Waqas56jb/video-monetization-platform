import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('VideoCard warms on intent, and only once per card', () => {
  const src = readFileSync(join(dir, 'VideoCard.jsx'), 'utf8')
  assert.match(src, /onPointerDown: warm/)
  assert.match(src, /onTouchStart: warm/)
  assert.match(src, /onPointerEnter: hover/)
  assert.match(src, /prefetchWatch\(slug \|\| id\)/)
  assert.match(src, /markPerf\('cardTap'\)/)

  /**
   * iOS fires pointerdown AND touchstart for one tap, so `warm` ran twice. It
   * was harmless only because the cache collapsed the second call, which is a
   * thin thing to rely on.
   */
  assert.match(src, /if \(warmed\.current\) return/)

  /**
   * Warming on viewport entry is gone. Explore fired one playback request per
   * visible card — six, measured, before anyone tapped — and cold they compete
   * with the request the viewer is actually waiting for. Being on screen is not
   * evidence that anyone wants a video; a pointer on the card is.
   *
   * The route chunk is still warmed on view: that is one request for the whole
   * page rather than one per card.
   */
  assert.doesNotMatch(src, /if \(inView\) prefetchWatchLight/)
  assert.doesNotMatch(src, /requestIdleCallback/)
  assert.match(src, /if \(inView\) prefetchWatchChunk\(\)/)
})

/**
 * A press meant for Save or Follow must not start the top progress bar.
 *
 * `warm` starts that bar, and the bar is stopped by the navigation that
 * follows. Save and Follow sit on the card and do not navigate, so pressing
 * either used to start a bar that then ran for its full eight-second cap with
 * nothing happening — which reads as the page having hung. That is half of what
 * the client reported as "the loader keeps running"; the other half was the
 * poster swallowing the tap entirely.
 */
test('the card does not warm for a press meant for one of its own controls', () => {
  const src = readFileSync(join(dir, 'VideoCard.jsx'), 'utf8')
  assert.match(src, /closest\?\.\('button, a:not\(\.vid-open\)'\)\) return/)
  // and it is on both entry points, not just the tap one
  assert.equal((src.match(/closest\?\.\('button, a:not\(\.vid-open\)'\)\) return/g) || []).length, 2)
})
