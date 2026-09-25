import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Client, 2026-09-21: "The Creator Capital page still becomes long plain
 * text and feels like a Word/terms page. Please make the information
 * visual and premium: cards/steps/icons/status examples/clear sections.
 * Do not change the business logic, just improve the presentation."
 *
 * These pin two things at once: the OLD plain-prose structure is gone, and
 * every fact the old page stated is still here somewhere — reorganised,
 * not rewritten. sep17Review.test.js already covers "no literal 6 months"
 * and "no literal 70/30"; this file is the redesign itself.
 */
const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'CreatorCapitalInfo.jsx'),
  'utf8'
)

test('the plain legal-document shell is gone — this is the same cc- visual language the homepage section uses', () => {
  assert.doesNotMatch(src, /className="legal"/)
  assert.doesNotMatch(src, /className="legal-body"/)
  assert.match(src, /className="section cc-section"/)
  assert.match(src, /className="cc-steps"/)
  assert.match(src, /className="cc-block"/)
})

test('cards, steps and icons are all present, not just headings', () => {
  assert.match(src, /const STEPS = \[/)
  assert.match(src, /cc-step-ic/)
  assert.match(src, /cc-step-num/)
  assert.match(src, /\.map\(\(step, i\) =>/, 'steps render from data, not four copy-pasted blocks')
})

test('status examples are present — the real states, labelled as a legend, never as the viewer\'s own data', () => {
  assert.match(src, /const STATUS_JOURNEY = \[/)
  assert.match(src, /Building Eligibility/)
  assert.match(src, /Under AirPay Review/)
  assert.match(src, /Offer Ready/)
  assert.match(src, /\bActive\b/)
  assert.match(src, /Repaid/)
  assert.match(src, /Illustrative — the real amount, purpose and terms are AirPay/)
})

test('every fact the old prose page stated survives, word for word', () => {
  // "How it works", paragraph 1 and 2 — split at sentence boundaries, not reworded.
  assert.match(src, /Every sale and every advertising payout you earn on MTONYO\+ is verified — settled\s*\n?\s*money, not views or pending payments\./)
  assert.match(src, /Requesting a review means consenting to MTONYO\+ sharing that verified history and your\s*\n?\s*account details with AirPay\./)
  assert.match(src, /Not automatic, not instant\. AirPay looks at your months of verified earnings, lifetime\s*\n?\s*and recent revenue, how many people pay you, how many buy from you more than once, and\s*\n?\s*your refund rate — the same figures a lender would want to see\./)
  // "Who decides" — verbatim, still the strongest statement on the page.
  assert.match(src, /MTONYO\+ is not the lender — AirPay Microfinance decides eligibility, approval\s*\n?\s*and financing terms\./)
  assert.match(src, /MTONYO\+ verifies your earnings history and puts your request in front of AirPay;\s*\n?\s*AirPay makes the credit decision, sets the amount and the terms, and is who you\s*\n?\s*repay\./)
  // "If you are approved" — verbatim.
  assert.match(src, /You will see the offer — the amount, its purpose, and the repayment terms — in\s*\n?\s*your Creator Capital tab, with/)
  assert.match(src, /nothing to accept until you choose to\. Your repayment balance is tracked there\s*\n?\s*for as long as it is open\./)
  // The headline and intro sentence, and the CTA — unchanged.
  assert.match(src, /Create\. Earn\. Build Your Record\. Unlock Capital\./)
  assert.match(src, /Build Eligibility/)
})

test('no new eligibility rule is introduced — the one platform value still gates every number shown', () => {
  assert.match(src, /capitalMonthsRequired/)
  const monthsUses = (src.match(/\$\{months\}/g) || []).length
  assert.ok(monthsUses >= 2, 'the months figure is interpolated, not hand-typed, everywhere it appears')
})

test('the CSS this page depends on exists and matches the homepage section\'s own language', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/global.css'), 'utf8')
  assert.match(css, /\.cc-status-journey\{/)
  assert.match(css, /\.cc-journey-item\{/)
  assert.match(css, /\.cc-approved-row\{/)
})

test('final audit F9: the disclaimer is complete in both places on this page, including the trust tile', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'CreatorCapitalInfo.jsx'), 'utf8')
  const flat = src.replace(/<\/?(b|small)>/g, ' ').replace(/\s+/g, ' ')
  const hits = flat.match(/MTONYO\+ is not the lender — AirPay Microfinance decides eligibility, approval and financing terms\./g) || []
  assert.equal(hits.length, 2, 'the "Who decides" callout and the trust tile')
})

test('final audit F10: the info page has a "Use your funding for" section, from the same list as the homepage', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'CreatorCapitalInfo.jsx'), 'utf8')
  assert.match(src, /<h3>Use your funding for<\/h3>/)
  assert.match(src, /import \{ FUNDING_USES \} from '@\/data\/fundingUses'/)
  assert.doesNotMatch(src, /from '@\/components\/landing\/CreatorCapital'/, 'importing the homepage section would pull its lazy chunk into the main bundle')
  assert.match(src, /FUNDING_USES\.map\(/)
})
