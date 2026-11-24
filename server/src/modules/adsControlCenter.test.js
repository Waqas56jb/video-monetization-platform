/**
 * Ads Management control center + Homepage Sponsors flow (client, 2026-11-17,
 * points 5 and 6): the statuses the admin sees, the actions each status allows,
 * and that a draft, a paused, an ended or a capped campaign is never served.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { campaignStatus, endedBecause, STATE_ACTIONS } from './admin.routes.js'
import { sponsorStatus } from './sponsors.routes.js'
import { SERVING } from '../services/ads.js'

const dir = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(dir, p), 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-24T12:00:00Z')
const past = '2026-11-01T00:00:00Z'
const future = '2026-12-24T00:00:00Z'
const base = { state: 'active', active: true, cloudflare_uid: 'cf1', starts_at: null, ends_at: null, impression_cap: null }

test('campaign status: Draft / Scheduled / Live / Paused / Ended, plus "no video"', () => {
  assert.equal(campaignStatus({ ...base, state: 'draft', active: false }, null, NOW), 'draft')
  assert.equal(campaignStatus({ ...base }, null, NOW), 'live')
  assert.equal(campaignStatus({ ...base, starts_at: future }, null, NOW), 'scheduled')
  assert.equal(campaignStatus({ ...base, state: 'paused', active: false }, null, NOW), 'paused')
  assert.equal(campaignStatus({ ...base, state: 'ended', active: false }, null, NOW), 'ended')
  assert.equal(campaignStatus({ ...base, ends_at: past }, null, NOW), 'ended')
  assert.equal(campaignStatus({ ...base, cloudflare_uid: null }, null, NOW), 'no video')
})

test('a campaign that reached its impression cap is ended, and says why', () => {
  const c = { ...base, impression_cap: 1000 }
  assert.equal(campaignStatus(c, { impressions: 999 }, NOW), 'live')
  assert.equal(campaignStatus(c, { impressions: 1000 }, NOW), 'ended')
  assert.equal(endedBecause(c, { impressions: 1000 }, NOW), 'impression cap reached')
  assert.equal(endedBecause({ ...base, ends_at: past }, null, NOW), 'end date passed')
  assert.equal(endedBecause({ ...base, state: 'ended' }, null, NOW), 'ended by an admin')
  assert.equal(endedBecause(base, null, NOW), null)
})

test('state actions: publish a draft, pause / resume a running one, end any but an ended one', () => {
  assert.deepEqual(STATE_ACTIONS.publish, { from: ['draft'], to: 'active', verb: 'published' })
  assert.deepEqual(STATE_ACTIONS.pause.from, ['active'])
  assert.deepEqual(STATE_ACTIONS.resume.from, ['paused'])
  assert.ok(!STATE_ACTIONS.end.from.includes('ended'))
})

test('only a running, uploaded, under-cap campaign is ever served or paid for', () => {
  assert.match(SERVING, /state = 'active'/)
  assert.match(SERVING, /cloudflare_uid is not null/)
  assert.match(SERVING, /impression_cap is null\s+or \(select count\(\*\) from ad_impressions ci where ci\.campaign_id = ad_campaigns\.id\) < impression_cap/)
  const ads = read('../services/ads.js')
  // both the picker and the billing re-check use it
  assert.equal((ads.match(/\$\{SERVING\}/g) || []).length, 2)
})

test('publish / resume refuse a campaign with no advert uploaded', () => {
  const route = read('admin.routes.js')
  const block = route.slice(route.indexOf("'/ads/:id/state'"), route.indexOf("'/ads/:id/preview'"))
  assert.match(block, /step\.to === 'active' && !existing\.cloudflare_uid/)
})

test('a campaign edit can clear a date (null) or leave it (omitted)', () => {
  const route = read('admin.routes.js')
  assert.match(route, /starts_at\s+= case when \$16::boolean then \$6::timestamptz else starts_at end/)
  assert.match(route, /b\.startsAt !== undefined, b\.endsAt !== undefined/)
})

test('sponsor status: Draft / Scheduled / Live / Paused / Ended', () => {
  const s = { state: 'published', active: true, starts_at: null, ends_at: null }
  assert.equal(sponsorStatus({ ...s, state: 'draft', active: false }, NOW), 'draft')
  assert.equal(sponsorStatus(s, NOW), 'live')
  assert.equal(sponsorStatus({ ...s, starts_at: future }, NOW), 'scheduled')
  assert.equal(sponsorStatus({ ...s, state: 'paused', active: false }, NOW), 'paused')
  assert.equal(sponsorStatus({ ...s, ends_at: past }, NOW), 'ended')
  assert.equal(sponsorStatus({ ...s, state: 'ended', active: false }, NOW), 'ended')
})

test('a draft sponsor never reaches the homepage, and views / clicks are kept per day', () => {
  const src = read('sponsors.routes.js')
  assert.match(src, /const LIVE = `state = 'published' and active/)
  assert.match(src, /insert into home_sponsor_daily/)
  assert.match(src, /'\/:id\/stats'/)
  assert.match(src, /'\/:id\/state'/)
})

test('migration 048 is additive and keeps `active` meaningful', () => {
  const sql = read('../db/migrations/048_ads_control_center.sql')
  assert.match(sql, /update ad_campaigns set state = case when active then 'active' else 'paused' end where state is null/)
  assert.match(sql, /update home_sponsors set state = case when active then 'published' else 'paused' end where state is null/)
  assert.doesNotMatch(sql, /drop (table|column)/i)
})
