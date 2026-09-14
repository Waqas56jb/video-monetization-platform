/**
 * `balanceFor`'s "paid" total is real completed withdrawals only, not
 * everything matched by `status in ('paid','pending')`.
 *
 * Traced live for the client's Sep 14 report: the old query summed
 * `amount_tzs` for every row where status was 'paid' OR 'pending' into the
 * single `paid` field, with no per-row filter -- so a creator holding a
 * pending withdrawal request had it counted as ALREADY paid (overstating
 * "Already paid out" on their dashboard) and, because `available` then
 * subtracted `pending` again on top of that, double-subtracted from
 * "Available to withdraw" (understating it). It went unnoticed because no
 * account tested so far happened to have a pending request outstanding at
 * the same time as a paid one -- report2.txt SEP14.
 *
 * Source-text: this reaches a live database the moment it runs for real
 * (`server/.env` on this machine is production), so the fix is pinned by
 * reading the SQL rather than by exercising it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'earnings.routes.js'), 'utf8')

test('the paid total is filtered per row, exactly like the pending total beside it', () => {
  assert.match(
    src,
    /sum\(case when status = 'paid'\s+then amount_tzs else 0 end\),0\)::int as paid/,
    "paid must be case-filtered to status = 'paid', not an unfiltered sum over the whole status in (...) set"
  )
  assert.doesNotMatch(
    src,
    /select coalesce\(sum\(amount_tzs\),0\)::int as paid,/,
    'this is the exact shape of the bug: an unfiltered sum labelled paid'
  )
})

test('available balance still subtracts both paid and pending exactly once each', () => {
  assert.match(src, /const available = totals\.lifetime - paidOut\.paid - paidOut\.pending/)
})
