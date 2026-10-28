/**
 * Milestone 3: "financial consistency at 60/40, with no 70/30 left".
 * New sales take the saved split (60); nothing in code falls back to 70, and
 * the reconciliation that proves every shilling stays read-only.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applySplit } from '../services/settings.js'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('no 70 fallback: schema default, server fallback and the admin slider', () => {
  assert.match(read('../db/migrations/045_split_default_60.sql'), /alter column creator_split_percent set default 60/)
  assert.match(read('../services/settings.js'), /row\?\.override \?\? row\?\.dflt \?\? 60/)
  const tab = read('../../../admin/src/components/tabs/RevenueTab.jsx')
  assert.doesNotMatch(tab, /useState\(70\)/)
  assert.match(tab, /disabled=\{saving \|\| loading \|\| share == null\}/)
})

test('60/40 to the shilling, rounding in the creator\'s favour', () => {
  assert.deepEqual(applySplit(5000, 60), { creator: 3000, platform: 2000, percent: 60 })
  assert.deepEqual(applySplit(1001, 60), { creator: 601, platform: 400, percent: 60 })
  for (const amt of [1, 99, 250, 1234, 10000, 99999]) {
    const s = applySplit(amt, 60)
    assert.equal(s.creator + s.platform, amt)
  }
})

test('reconciliation is read-only and checks the whole chain', () => {
  const src = read('./reconcile.js')
  assert.match(src, /begin read only/)
  assert.match(src, /rollback/)
  assert.doesNotMatch(src, /\b(insert into|update \w+ set|delete from)\b/i)
  assert.doesNotMatch(src, /set default_transaction_read_only/)
})
