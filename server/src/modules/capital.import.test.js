import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const root = join(dir, '..')
const creatorSrc = readFileSync(join(dir, 'capital.routes.js'), 'utf8')
const adminSrc = readFileSync(join(dir, 'admin.routes.js'), 'utf8')

test('the creator-facing routes exist and are gated to a creator, not any signed-in account', () => {
  assert.match(creatorSrc, /router\.use\(requireAuth\(\), requireCreator\(\)\)/)
  assert.match(creatorSrc, /get\(\s*\n?\s*'\/status'/)
  assert.match(creatorSrc, /post\(\s*\n?\s*'\/request-review'/)
  assert.match(creatorSrc, /post\(\s*\n?\s*'\/accept-offer'/)

  const index = readFileSync(join(root, 'routes/index.js'), 'utf8')
  assert.match(index, /'\/capital'/)
  assert.match(index, /modules\/capital\.routes\.js/)
})

test('request-review re-derives eligibility server-side rather than trusting the client', () => {
  const fn = creatorSrc.slice(creatorSrc.indexOf("'/request-review'"))
  assert.match(fn, /eligibility\.months_with_earnings < monthsRequired/)
  assert.match(fn, /throw badRequest/)
})

test("months_with_earnings comes from earnings, not video views or unsettled activity", () => {
  const fn = creatorSrc.slice(0, creatorSrc.indexOf('function shapeCapital'))
  assert.match(fn, /from earnings e/)
  assert.doesNotMatch(fn, /from video_views/)
})

test('every admin action exists, gated by the capital permission module, admin-decides not automated', () => {
  assert.match(adminSrc, /router\.use\('\/capital', requirePermission\('capital'\)\)/)
  assert.match(adminSrc, /'\/capital\/:id\/decide'/)
  assert.match(adminSrc, /'\/capital\/:id\/publish-offer'/)
  assert.match(adminSrc, /'\/capital\/:id\/pause'/)
  assert.match(adminSrc, /'\/capital\/:id\/mark-repaid'/)
})

test('the admin list carries the columns the client asked for', () => {
  const sql = adminSrc.slice(adminSrc.indexOf('const CAPITAL_LIST_SQL'), adminSrc.indexOf('const CAPITAL_LIST_SQL') + 1800)
  assert.match(sql, /months_with_earnings/)
  assert.match(sql, /lifetime_creator_tzs/)
  assert.match(sql, /recent_90d_creator_tzs/)
  assert.match(sql, /paying_viewers/)
  assert.match(sql, /repeat_buyers/)
  assert.match(sql, /refund_rate_pct/)
  assert.match(sql, /cp\.verified/)
})

test('no lending math beyond amount_repaid vs approved_amount — mark-repaid does simple addition, not interest', () => {
  const fn = adminSrc.slice(adminSrc.indexOf("'/capital/:id/mark-repaid'"), adminSrc.indexOf("'/capital/:id/mark-repaid'") + 1500)
  assert.match(fn, /amount_repaid_tzs = amount_repaid_tzs \+ \$2/)
  assert.doesNotMatch(fn, /interest|apr|rate\s*\*/i)
})

test('nothing here disburses or collects money — it records a decision already made elsewhere', () => {
  const wholeSection = adminSrc.slice(adminSrc.indexOf('CREATOR CAPITAL'))
  assert.doesNotMatch(wholeSection, /cf\.|cloudflare|payment provider|mpesa|airtel/i)
})
