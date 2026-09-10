import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'ads.js'), 'utf8')

/**
 * report2.txt §5's click-through CTA. A click must never be recordable
 * merely because the overlay was tapped — the same discipline
 * `recordImpression` already applies to billing (money only moves on a
 * genuine, re-verified completion), extended here to clicks: a click is
 * only ever recorded against a play_id that already has a real, completed
 * ad_impressions row for the same campaign and video.
 */
test('recordClick refuses without campaignId or playId, before touching the database', () => {
  const body = src.slice(src.indexOf('export async function recordClick'), src.indexOf('export async function recordClick') + 300)
  assert.match(body, /if \(!campaignId \|\| !playId\) return \{ recorded: false/)
})

test('recordClick requires an existing, completed impression for the same campaign/video/play', () => {
  const fn = src.slice(
    src.indexOf('export async function recordClick'),
    src.indexOf('export async function campaignPerformance')
  )
  assert.match(fn, /where campaign_id = \$1 and video_id = \$2 and play_id = \$3 and completed = true/)
  assert.match(fn, /if \(!impression\) \{\s*\n\s*return \{ recorded: false/)
})

test('recordClick never writes to ad_clicks before the impression check has run', () => {
  const fn = src.slice(
    src.indexOf('export async function recordClick'),
    src.indexOf('export async function campaignPerformance')
  )
  const impressionCheckIdx = fn.indexOf('from ad_impressions')
  const insertIdx = fn.indexOf('insert into ad_clicks')
  assert.ok(impressionCheckIdx > -1 && insertIdx > impressionCheckIdx, 'the impression check must run before the ad_clicks insert')
})

test('recordClick is not exposed a billing side effect — it never touches earnings or revenue columns', () => {
  const fn = src.slice(
    src.indexOf('export async function recordClick'),
    src.indexOf('export async function campaignPerformance')
  )
  assert.doesNotMatch(fn, /insert into earnings/)
  assert.doesNotMatch(fn, /revenue_micro_tzs/)
})

test('campaignPerformance and campaignPerformanceByVideo both compute CTR the same way', () => {
  const ctrHits = src.match(/Math\.round\(\(r\.clicks \/ r\.impressions\) \* 1000\) \/ 10/g) || []
  assert.equal(ctrHits.length, 2, 'expected the identical CTR formula in both functions, not two different ones')
  assert.match(src, /ctrPercent: r\.impressions > 0 \? Math\.round/)
})
