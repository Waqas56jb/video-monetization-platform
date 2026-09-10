import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./CreatorCapital.jsx', import.meta.url), 'utf8')

/**
 * Rebuilt full-width for the Sep 09 mockup (report2.txt §3) — this replaces
 * the old assertions about a slim, 760px-capped banner with the new
 * headline/structure. The disclaimer's own byte-for-byte pin (new AirPay
 * Microfinance string) still lives here since it's the one line that must
 * never silently drift, same as before.
 */
test('the section uses the new headline, tagline and disclaimer', () => {
  assert.match(src, /MTONYO\+ <span className="grad-text">Creator Capital™<\/span>/)
  assert.match(src, /Turn your earnings history into production funding\./)
  assert.match(
    src,
    /MTONYO\+ is not the lender — AirPay Microfinance decides eligibility, approval and\s+financing\s+terms\./
  )
})

test('"Learn How It Works" goes to the static explainer, "Start Building Eligibility" is role-aware', () => {
  assert.match(src, /navigate\('\/creator-capital'\)/)
  assert.match(src, /if \(authed && isCreator\) return navigate\('\/dashboard\?tab=capital'\)/)
  assert.match(src, /navigate\('\/signup\?side=creator'\)/)
  assert.match(src, />\s*Learn How It Works\s*</)
  assert.match(src, />\s*Start Building Eligibility\s*</)
})

test('the section is full-width now, not capped at 760px', () => {
  assert.doesNotMatch(src, /maxWidth:\s*760/)
})

test('all four "How Creator Capital Works" steps and four funding-use tiles are present', () => {
  for (const step of ['Build earnings history', 'Unlock eligibility', 'AirPay reviews', 'Get funded']) {
    assert.match(src, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  for (const use of ['Production Funding', 'Equipment', 'Filming & Editing', 'Marketing & Promotion']) {
    assert.match(src, new RegExp(use.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('the trust row names all three client-specified points', () => {
  for (const t of ['Performance-based', 'Transparent', 'Creator-first']) {
    assert.match(src, new RegExp(t))
  }
})

/**
 * The status card must never present illustrative numbers as a real
 * creator's own figures, and must never fetch anything for a visitor.
 */
test('the status card only fetches when a real creator is signed in, and the fetch is skip-gated', () => {
  assert.match(src, /const live = authed && isCreator/)
  assert.match(src, /skip: !live/)
  assert.match(src, /if \(!live \|\| loading \|\| !data\)/)
  assert.match(src, /is-illustrative/)
  assert.match(src, /Illustrative example — sign in as a creator to see your own status\./)
})

test('the status card labels match the dashboard tab\'s own building/unlocked split — one status, two labels', () => {
  assert.match(src, /function buildingLabel\(monthsWithEarnings, monthsRequired\)/)
  assert.match(src, /monthsWithEarnings >= monthsRequired \? 'Eligibility Unlocked' : 'Building Eligibility'/)
})

test('the AirPay logo is a labelled placeholder component, not a hard-coded image the client never sent', () => {
  assert.match(src, /function AirPayLogoPlaceholder\(\)/)
  // Rendered twice (real status + illustrative), never as a bare <img> —
  // the doc comment above the component names the future swap as an
  // example, which is why this checks the RENDERED usages specifically
  // rather than the whole file.
  const hits = src.match(/<AirPayLogoPlaceholder \/>/g) || []
  assert.equal(hits.length, 2)
})
