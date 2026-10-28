/**
 * Homepage sponsors (Milestone 3): what the admin may save, what the public
 * sees, and that a click can only ever go where the admin pointed it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sponsorBody, publicSponsor } from './sponsors.routes.js'

const ok = { sponsor: 'Vodacom', title: 'Data weekends', clickUrl: 'https://vodacom.co.tz/offer' }
const parse = (b) => sponsorBody.safeParse({ ...ok, ...b })

test('a normal sponsor saves, with blank optionals as null and sensible defaults', () => {
  const r = parse({ tagline: '', cta: '  ' })
  assert.equal(r.success, true)
  assert.deepEqual([r.data.tagline, r.data.cta, r.data.active, r.data.position, r.data.startsAt], [null, null, true, 0, null])
  assert.equal(parse({ startsAt: '2026-11-01T00:00:00+03:00', endsAt: '2026-11-30T23:59:00+03:00' }).success, true)
})

test('rejected: script / non-web links, bad dates, empty or oversized text, silly order', () => {
  for (const clickUrl of ['javascript:alert(1)', 'ftp://x.example/file', 'data:text/html,hi', 'vodacom.co.tz', '', 'https://' + 'a'.repeat(600) + '.tz']) {
    assert.equal(parse({ clickUrl }).success, false, clickUrl.slice(0, 30))
  }
  assert.equal(parse({ startsAt: '2026-11-30T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }).success, false)
  assert.equal(parse({ startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }).success, false)
  assert.equal(parse({ startsAt: 'next tuesday' }).success, false)
  assert.equal(parse({ sponsor: '   ' }).success, false)
  assert.equal(parse({ title: 'x'.repeat(81) }).success, false)
  assert.equal(parse({ tagline: 'x'.repeat(161) }).success, false)
  assert.equal(parse({ position: 1000 }).success, false)
  assert.equal(parse({ position: -1 }).success, false)
})

test('the public shape never carries the raw address, the author or the counters', () => {
  const row = { id: 'id-1', sponsor: 'S', title: 'T', tagline: null, cta: null, image_url: null, click_url: 'https://x.tz', created_by: 'admin-uuid', impressions: 9, clicks: 3, active: true }
  const p = publicSponsor(row)
  assert.deepEqual(Object.keys(p).sort(), ['clickPath', 'cta', 'id', 'imageUrl', 'sponsor', 'tagline', 'title'])
  assert.equal(p.clickPath, '/api/sponsors/id-1/click')
  assert.equal(p.cta, 'Learn more')
})

test('routes: only live sponsors are public, managing needs the Ads permission, a click goes only to the stored address', () => {
  const src = readFileSync(new URL('./sponsors.routes.js', import.meta.url), 'utf8')
  assert.match(src, /active and \(starts_at is null or starts_at <= now\(\)\) and \(ends_at is null or ends_at > now\(\)\)/)
  assert.match(src, /manage\.use\(requireAuth\(\), requireStaff\(\), requirePermission\('ads'\)\)/)
  assert.match(src, /res\.redirect\(302, s\.click_url\)/)
  assert.doesNotMatch(src, /redirect\([^)]*req\./)
  assert.match(src, /root\.use\('\/manage', manage\)\nroot\.use\('\/', router\)/)
  const mig = readFileSync(new URL('../db/migrations/047_home_sponsors.sql', import.meta.url), 'utf8')
  assert.match(mig, /check \(click_url ~ '\^https\?:\/\/'\)/)
  assert.match(mig, /revoke all on table home_sponsors from anon, authenticated, public/)
})
