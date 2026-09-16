import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./CreatorCapitalTab.jsx', import.meta.url), 'utf8')

test('every status the server can return has a rendered state, and the default is Building Eligibility', () => {
  for (const status of ['building', 'under_review', 'approved', 'active', 'repaid', 'declined', 'paused']) {
    assert.match(src, new RegExp(`status === '${status}'`), `no rendered state for "${status}"`)
  }
  assert.match(src, /const status = capital\?\.status \|\| 'building'/)
  assert.match(src, /Building Eligibility/)
})

test('Request Review is disabled below the required months AND without consent, not just hidden', () => {
  const buildingBlock = src.slice(src.indexOf("status === 'building'"), src.indexOf("status === 'under_review'"))
  assert.match(buildingBlock, /disabled=\{busy \|\| monthsWithEarnings < monthsRequired \|\| !consent\}/)
})

/**
 * Client's Sep 17 review, item 5: requesting an AirPay review shares the
 * creator's verified earnings and account data with AirPay, so the creator
 * consents in words first, and the request carries that consent — the server
 * refuses one that does not (capital.routes.js).
 */
test('the creator consents to data sharing with AirPay before requesting, and the request carries it', () => {
  const buildingBlock = src.slice(src.indexOf("status === 'building'"), src.indexOf("status === 'under_review'"))
  assert.match(src, /const \[consent, setConsent\] = useState\(false\)/)
  assert.match(buildingBlock, /className="check-row capital-consent"/)
  assert.match(buildingBlock, /I consent to MTONYO\+ sharing my verified earnings history and relevant account\s+details with AirPay Microfinance/)
  assert.match(buildingBlock, /MTONYO\+ is not the lender/)
  assert.match(src, /api\.capital\.requestReview\(\{ consent \}\)/)
})

/**
 * Item 3: once a request is pending there is no button to send another.
 * The under_review state renders no Request button at all, and says so.
 */
test('under_review shows no way to request again', () => {
  const block = src.slice(src.indexOf("status === 'under_review'"), src.indexOf("status === 'approved'"))
  assert.doesNotMatch(block, /requestReview|Request AirPay Review/)
  assert.match(block, /One request at a time/)
})

test('the required months come from the API (the platform rule), with 6 only as a missing-field fallback', () => {
  assert.match(src, /const monthsRequired = data\.monthsRequired \|\| 6/)
  const hardcodedSix = src.match(/\b6 months\b/g) || []
  assert.equal(hardcodedSix.length, 0, 'no rendered "6 months" literal — the number is the setting')
})

test('the AirPay disclaimer is always rendered, not tucked inside one state', () => {
  // Outside every per-status conditional block, so it renders regardless of
  // which state the capital record is in.
  const disclaimerAt = src.indexOf('capital-disclaimer')
  const lastStatusBlockAt = src.lastIndexOf("status === ")
  assert.ok(disclaimerAt > lastStatusBlockAt, 'the disclaimer must render outside/after every state branch')
  assert.match(
    src,
    /MTONYO\+ is not the lender — AirPay Microfinance decides eligibility, approval and financing\s+terms\./
  )
})

/**
 * report2.txt §2: "building" carries two labels over one status — the
 * heading and the Request button both change once eligibility is reached,
 * driven by the same monthsWithEarnings/monthsRequired comparison the
 * disabled-button check already uses, not a second persisted state.
 */
test('building splits into two labels by eligibility, not a new status', () => {
  const buildingBlock = src.slice(src.indexOf("status === 'building'"), src.indexOf("status === 'under_review'"))
  assert.match(buildingBlock, /monthsWithEarnings >= monthsRequired/)
  assert.match(buildingBlock, /Eligibility Unlocked/)
  assert.match(buildingBlock, /Ready for AirPay Review/)
  assert.match(buildingBlock, /Building Eligibility/)
})

test('the under_review state is labelled "Under AirPay Review", naming AirPay', () => {
  const block = src.slice(src.indexOf("status === 'under_review'"), src.indexOf("status === 'approved'"))
  assert.match(block, /Under AirPay Review/)
  assert.match(block, /AirPay is reviewing/)
})

test('the tab badge names AirPay, not "manual"', () => {
  const badge = src.slice(src.indexOf('action={'), src.indexOf("status === 'building'"))
  assert.match(badge, /AIRPAY REVIEW/)
  assert.doesNotMatch(badge, /MANUAL/i)
})
