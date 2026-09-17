import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * "The mobile freezes in so many areas" (client, 2026-09-17).
 *
 * The cause was measured, not guessed: a DevTools invalidation trace of one
 * scroll down the homepage on a throttled Pixel 7 profile put 341 style
 * recalculations and 340 layouts on the main thread, and named them —
 * infinite keyframe animations (the play-button pulse on every card, the
 * feature ticker, the skeleton shimmer) serviced frame by frame, plus the
 * header's scroll hook forcing layout by reading `window.scrollY`.
 *
 * These pin the fix: on touch devices those animations do not run, and the
 * header watches a sentinel instead of reading scroll position.
 */
const dir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(dir, 'global.css'), 'utf8')
const useScrolled = readFileSync(join(dir, '../hooks/useScrolled.js'), 'utf8')
const reveal = readFileSync(join(dir, '../components/ui/Reveal.jsx'), 'utf8')

/** The one touch/low-power block, from its header to its closing brace at column 0. */
function touchBlock() {
  const start = css.indexOf('@media (max-width: 1024px), (hover: none) {')
  assert.ok(start > -1, 'the touch/low-power media block exists')
  const end = css.indexOf('\n}\n', start)
  return css.slice(start, end)
}

test('on touch, no video card pulses its play button forever', () => {
  const block = touchBlock()
  assert.match(block, /\.vid-play span \{ animation: none \}/)
  // Desktop keeps the pulse.
  assert.match(css, /\.vid-play span\{[^}]*animation:pulse 2s infinite\}/)
})

test('on touch, the feature ticker is a still strip you can swipe, not a main-thread animation', () => {
  const block = touchBlock()
  assert.match(block, /\.marquee-track \{ animation: none \}/)
  assert.match(block, /\.marquee \{ overflow-x: auto;/)
  assert.doesNotMatch(block, /\.marquee-track \{ animation-duration/, 'slowing it down was not the fix — it still ticked every frame')
  assert.match(css, /\.marquee-track\{[^}]*animation:marquee 26s linear infinite\}/, 'desktop keeps the ticker moving')
})

test('on touch, skeleton placeholders do not shimmer', () => {
  const block = touchBlock()
  assert.match(block, /\.skeleton, \.is-shimmer \.skeleton \{ animation: none \}/)
})

test('the header learns it has scrolled from an IntersectionObserver sentinel, never by reading scrollY on the hot path', () => {
  assert.match(useScrolled, /new IntersectionObserver\(/)
  assert.match(useScrolled, /document\.body\.appendChild\(sentinel\)/)
  assert.match(useScrolled, /entry\.boundingClientRect\.top < 0/)

  // The scroll listener survives only as the no-IntersectionObserver fallback.
  const fallbackStart = useScrolled.indexOf("typeof IntersectionObserver === 'undefined'")
  const fallbackEnd = useScrolled.indexOf('const sentinel')
  assert.ok(fallbackStart > -1 && fallbackEnd > fallbackStart)
  const fallback = useScrolled.slice(fallbackStart, fallbackEnd)
  const hotPath = useScrolled.slice(fallbackEnd)
  assert.match(fallback, /window\.scrollY/)
  assert.doesNotMatch(hotPath, /window\.scrollY|addEventListener\('scroll'/)
})

test('scroll-reveal still skips the observer entirely on low-power devices (the earlier fix stays)', () => {
  assert.match(reveal, /const skip = immediate \|\| reduced \|\| lowPower/)
  assert.match(reveal, /useInView\(\{ skip \}\)/)
})
