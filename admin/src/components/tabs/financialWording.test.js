/**
 * "Paid" must mean a completed withdrawal, everywhere in the admin — not an
 * accrued-earnings sum wearing the wrong label.
 *
 * Traced live for the client's Sep 14 report (report2.txt SEP14): Withdrawals
 * correctly showed TZS 1,000 actually paid out across the whole platform,
 * while CreatorsTab and RevenueTab both labelled a creator's or the
 * platform's ACCRUED earnings (`earnings.creator_tzs`, which nothing about a
 * completed payout has happened to) "Paid to Creators" -- for one creator
 * alone that accrued figure was TZS 140,748. AdsTab carried the identical
 * mistake for the 30-day ad-revenue share. None of the three values were
 * wrong; only the word "Paid" on them was.
 *
 * Source-text, in this style, because that is what this project already
 * does for a wording/shape invariant (client/src/pages/Watch.test.js and
 * many others) -- these are the first tests admin/ has had at all, so this
 * also registers `node --test` for it in package.json.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const read = (f) => readFileSync(join(dir, f), 'utf8')

test('CreatorsTab: accrued earnings are labelled Earned, not Paid, and a stale split cannot linger', () => {
  const src = read('CreatorsTab.jsx')
  assert.doesNotMatch(src, /label:\s*'Paid to Creators'/)
  assert.match(src, /label:\s*'Earned by Creators'/)
  assert.match(
    src,
    /useApi\(\(\) => api\.admin\.settings\(\), \[\], \{ refetchOnFocus: true \}\)/,
    'the split shown here must refetch when the tab regains focus, same as OverviewTab and RevenueTab'
  )
})

test('RevenueTab: the recorded creator total is Earned, not Paid', () => {
  const src = read('RevenueTab.jsx')
  assert.doesNotMatch(src, /label:\s*'Paid to Creators \(recorded\)'/)
  assert.match(src, /label:\s*'Earned by Creators \(recorded\)'/)
})

test('AdsTab: the 30-day creator share is Earned, not Paid', () => {
  const src = read('AdsTab.jsx')
  assert.doesNotMatch(src, /label:\s*'Paid to Creators \(30d\)'/)
  assert.match(src, /label:\s*'Earned by Creators \(30d\)'/)
})

test('WithdrawalsTab is untouched -- its "Paid Out" already sums real withdrawals, not earnings', () => {
  const src = read('WithdrawalsTab.jsx')
  assert.match(src, /label:\s*'Paid Out'/)
  assert.match(
    src,
    /all\.filter\(\(w\) => w\.status === 'paid' \|\| w\.status === 'approved'\)\.reduce\(\(n, w\) => n \+ w\.amount_tzs, 0\)/,
    'Paid Out must keep summing withdrawals, not switch to an earnings total'
  )
})
