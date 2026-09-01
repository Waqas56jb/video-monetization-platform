import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('./global.css', import.meta.url)), 'utf8')

/** Every selector in the sheet, one per rule, comments stripped. */
function selectors(sheet) {
  const out = []
  const clean = sheet.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of clean.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].trim()
    if (!sel || sel.startsWith('@')) continue
    for (const one of sel.split(',')) out.push(one.trim())
  }
  return out
}

/**
 * A bare element selector applies to every element of that kind, including
 * ones written later by someone who had no reason to look at this file.
 *
 * `header{position:fixed;top:0}` was meant for the site header. The creator
 * profile's own `<header class="creator-hero">` -- correct HTML, describing
 * the page it heads -- was pinned to the top of the viewport by it, where it
 * covered the Back button, the "Videos" heading and the top of the first
 * video card. The page looked broken at every width and the markup was fine.
 *
 * Layout belongs to a class, so it reaches exactly what it was written for.
 */
test('no bare landmark element carries page layout', () => {
  const LANDMARKS = new Set(['header', 'footer', 'main', 'nav', 'aside', 'article', 'section'])
  const offenders = selectors(css).filter((s) => LANDMARKS.has(s))
  assert.deepEqual(
    offenders.filter((s) => s !== 'footer'),
    [],
    `style these by class instead: ${offenders.join(', ')}`
  )
})

test('the site header is positioned by its own class', () => {
  assert.match(css, /\.site-header\{position:fixed/)
})

/**
 * The header is fixed, so anything below it has to start below it too. Every
 * top-level page opens with its own padding, and the creator page opened with
 * a flat 28px -- less than the header is tall -- so its Back button sat
 * underneath the navigation at every width.
 */
test('pages that open under the fixed header allow for its height', () => {
  const m = css.match(/\.creator-page\{([^}]*)\}/)
  assert.ok(m, '.creator-page rule is missing')
  assert.match(m[1], /padding:calc\(var\(--header-h\)/)
})

/**
 * A stretched link must be trapped by its own card.
 *
 * `.vid-open::after` and `.creator-open::after` are `position:absolute;inset:0`
 * — the pattern that makes a whole tile clickable without nesting one anchor
 * inside another. `inset:0` resolves against the nearest POSITIONED ancestor,
 * so if the card itself is not positioned the overlay escapes to whatever is,
 * and silently swallows every control below it.
 *
 * That is not hypothetical. `.creator-row` was missing `position:relative`, and
 * its overlay spread across the watch page and ate the Unlock button — a viewer
 * on a phone could not buy the video. It was invisible in review and obvious the
 * moment a test tried to click Unlock.
 */
test('every stretched card link is contained by its own card', () => {
  /* Plain string search, not a built regex: the selectors contain `.` and `::`
     and the escaping is easy to get wrong in a way that makes the test pass by
     matching nothing. */
  const declarations = (selector) => {
    const at = css.indexOf(selector + '{')
    if (at < 0) return null
    return css.slice(at + selector.length + 1, css.indexOf('}', at))
  }

  for (const [overlay, card] of [
    ['.vid-open::after', '.vid-card'],
    ['.creator-open::after', '.creator-row'],
  ]) {
    const spread = declarations(overlay)
    assert.ok(spread, `${overlay} rule is missing`)
    assert.match(spread, /position:absolute/, `${overlay} must be absolutely positioned`)
    assert.match(spread, /inset:0/, `${overlay} must cover its card`)

    const holder = declarations(card)
    assert.ok(holder, `${card} rule is missing`)
    assert.match(
      holder,
      /position:relative/,
      `${card} must be position:relative, or ${overlay} escapes it and covers unrelated controls`
    )
  }
})
