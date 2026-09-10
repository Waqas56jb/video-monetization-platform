import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./CreatorCapital.jsx', import.meta.url), 'utf8')

/**
 * The client's own words, not a placeholder — pinned verbatim so a future
 * copy edit has to be a deliberate change to this test, not a silent drift.
 */
test('the homepage section uses the client\'s exact copy', () => {
  assert.match(src, /CREATOR CAPITAL™/)
  assert.match(src, /Create\. Earn\. Build Your Record\. Unlock Capital\./)
  assert.match(
    src,
    /Build 6 months of verified MTONYO\+ transaction history and become eligible for Creator\s*\n?\s*Capital review in partnership with AirPay\./
  )
  assert.match(src, />\s*Learn More\s*</)
  assert.match(src, />\s*Build Eligibility\s*</)
  assert.match(
    src,
    /MTONYO\+ is not the lender — AirPay Microfinance decides eligibility, approval and\s+financing\s+terms\./
  )
})

test('"Learn More" goes to the static explainer, "Build Eligibility" is role-aware', () => {
  assert.match(src, /navigate\('\/creator-capital'\)/)
  assert.match(src, /if \(authed && isCreator\) return navigate\('\/dashboard\?tab=capital'\)/)
  assert.match(src, /navigate\('\/signup\?side=creator'\)/)
})
