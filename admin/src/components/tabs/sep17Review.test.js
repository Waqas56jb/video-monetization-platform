/**
 * The client's Sep 17 Milestone 2 close-out review — the admin-side items,
 * pinned. Source-text, matching financialWording.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const read = (f) => readFileSync(join(dir, f), 'utf8')

test('item 4: no Capital button implies MTONYO+ is the lender — every decision names AirPay', () => {
  const src = read('CapitalTab.jsx')
  assert.match(src, />\s*Record AirPay Approval\s*</)
  assert.match(src, />\s*Record AirPay Decline\s*</)
  assert.match(src, />\s*Publish AirPay Offer\s*</)
  assert.doesNotMatch(src, /<Check size=\{14\} \/> Approve\s*</)
  assert.doesNotMatch(src, /<X size=\{14\} \/> Decline\s*</)
  assert.doesNotMatch(src, />\s*Publish Offer\s*</)
})

test('item 4: amount AND repayment terms are required before an approval can be recorded', () => {
  const src = read('CapitalTab.jsx')
  assert.match(src, /if \(!f\.approvedAmountTzs \|\| !\(f\.repaymentTerms \|\| ''\)\.trim\(\)\)/)
  assert.match(src, /placeholder="Repayment terms, from AirPay \(required\)"/)
  assert.doesNotMatch(src, /Repayment terms, from AirPay \(optional\)/)
})

test('item 1: the admin hint reads the platform rule, not a literal 6', () => {
  const src = read('CapitalTab.jsx')
  assert.match(src, /after \$\{list\.data\?\.monthsRequired \?\? 6\} months of verified earnings/)
  assert.doesNotMatch(src, /after 6 months of verified earnings/)
})

test('item 5: the creator\'s data-sharing consent is visible to the reviewer', () => {
  const src = read('CapitalTab.jsx')
  assert.match(src, /r\.consentAt && \(/)
  assert.match(src, /Data-sharing consent/)
})

test('item 1: the one rule is editable from Super Admin settings and saved with the rest', () => {
  const src = read('SettingsTab.jsx')
  assert.match(src, /id="set-capital-months"/)
  assert.match(src, /onChange=\{set\('capital_months_required'\)\}/)
  assert.match(src, /capital_months_required: Number\(settings\.capital_months_required\)/)
})

test('item 6: the review queue calls the rights checkbox what it is — a declaration, not a confirmation', () => {
  const src = read('ReviewTab.jsx')
  assert.match(src, /Rights declared · creator attested/)
  assert.match(src, /No rights declaration/)
  assert.doesNotMatch(src, /Rights confirmed|Rights not confirmed/)
})

test('cleanup: Users counters reconcile — suspended and blocked are both counted, not just blocked', () => {
  const src = read('UsersTab.jsx')
  assert.match(src, /label: 'Suspended or blocked'/)
  assert.match(src, /u\.blocked \+ u\.suspended/)
  assert.doesNotMatch(src, /label: 'Blocked', value: compact\(rows\.filter\(\(u\) => u\.status === 'blocked'\)/)
})

test('final audit D8: the Users counters come from the server, not from a list capped at 100 rows', () => {
  const src = read('UsersTab.jsx')
  assert.match(src, /limit: 100/, 'the list is still capped — which is exactly why it cannot be the count')
  assert.match(src, /api\.admin\.overview\(\)/)
  for (const label of ['Total Accounts', 'Active', 'Creators', 'Suspended or blocked']) {
    const line = src.split('\n').find((l) => l.includes(`label: '${label}'`)) || ''
    assert.doesNotMatch(line, /rows\./, `${label} must not count the capped list`)
  }
  assert.match(src, /overview\.reload\(\{ quiet: true \}\)/, 'and a block/unblock refreshes the counts')
})
