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

/**
 * Client's Sep 17 review, item 2: the illustrative example claimed "6 months"
 * + "60% complete" + Building Eligibility + Eligibility Unlocked at once.
 * One coherent state now — months earned, months required, the bar and the
 * single label all derived from the same two numbers, and the required
 * number is the platform's one rule read from the cached public stats (no
 * extra request for a visitor), not a literal.
 */
test('the illustrative card shows exactly one status, derived from one pair of numbers', () => {
  const example = src.slice(src.indexOf('is-illustrative'), src.indexOf('Illustrative example'))
  assert.match(src, /const exampleRequired = Number\(readLanding\(LANDING_KEYS\.stats\)\?\.capitalMonthsRequired\) \|\| 6/)
  assert.match(example, /\{exampleEarned\} of \{exampleRequired\} months/)
  assert.match(example, /\{buildingLabel\(exampleEarned, exampleRequired\)\}/)
  assert.match(example, /width: `\$\{examplePct\}%`/)
  assert.doesNotMatch(example, /pill-green/, 'no second, contradictory status pill')
  assert.doesNotMatch(example, /60%|<b>6 months<\/b>/, 'no literals that could disagree with the rule')
  // Exactly one pill rendered in the example.
  assert.equal((example.match(/className="pill-gold"/g) || []).length, 1)
})

test('the real card states months as "X of N", with N from the API', () => {
  const real = src.slice(src.indexOf('const capital = data.capital'))
  assert.match(real, /\{monthsWithEarnings\} of \{monthsRequired\} months/)
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
