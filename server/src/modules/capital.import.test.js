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

/* ------------------------------------------------------------------------
   Client's Sep 17 Milestone 2 review, items 1, 3, 4, 5 — migration 040.
   ------------------------------------------------------------------------ */

const migration = readFileSync(join(root, 'db/migrations/040_capital_global_months_and_consent.sql'), 'utf8')
const settingsSrc = readFileSync(join(root, 'services/settings.js'), 'utf8')

test('item 1: ONE eligibility rule — platform_settings.capital_months_required, read by both the creator route and the admin list', () => {
  assert.match(migration, /add column if not exists capital_months_required smallint not null default 6/)
  assert.match(settingsSrc, /'capital_months_required'/, 'editable through updateSettings')
  assert.match(adminSrc, /capital_months_required: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(36\)\.optional\(\)/)

  // Creator side reads the setting, never the row.
  assert.match(creatorSrc, /async function requiredMonths\(\)/)
  assert.match(creatorSrc, /settings\?\.capital_months_required/)
  assert.doesNotMatch(creatorSrc, /priorRow\?\.months_required/, 'the old per-row read is gone')

  // Admin list reads the setting and passes it into every row's shape.
  const list = adminSrc.slice(adminSrc.indexOf("'/capital',"), adminSrc.indexOf('const capitalDecideSchema'))
  assert.match(list, /getSettings\(\)/)
  assert.match(list, /shapeCapitalAdmin\(r, monthsRequired\)/)
  assert.match(adminSrc, /function shapeCapitalAdmin\(row, monthsRequired\)/)
  assert.match(adminSrc, /monthsRequired: monthsRequired \?\? row\.months_required/)
})

test('item 3: one LIVE record per creator — index over every non-terminal status, ordered status read, upsert of a leftover building row', () => {
  assert.match(migration, /drop index if exists creator_capital_one_open/)
  assert.match(
    migration,
    /create unique index if not exists creator_capital_one_live\s+on creator_capital \(creator_id\)\s+where status in \('building', 'under_review', 'approved', 'active', 'paused'\)/
  )
  assert.match(creatorSrc, /const LIVE_STATUSES = \['building', 'under_review', 'approved', 'active', 'paused'\]/)
  // /status never does an unordered limit 1 again.
  assert.match(creatorSrc, /order by \(status = any\(\$2::creator_capital_status\[\]\)\) desc, created_at desc\s+limit 1/)
  // request-review: refuse an open one, else turn a leftover building row into this request, else insert.
  const rr = creatorSrc.slice(creatorSrc.indexOf("'/request-review'"))
  assert.match(rr, /status in \('under_review', 'approved', 'active', 'paused'\)/)
  assert.match(rr, /where creator_id = \$1 and status = 'building'/)
  assert.match(rr, /on conflict \(creator_id\) where status in \('building','under_review','approved','active','paused'\)/)
})

test('item 5: consent is required by the server and recorded against the request', () => {
  assert.match(migration, /add column if not exists consent_at timestamptz/)
  const rr = creatorSrc.slice(creatorSrc.indexOf("'/request-review'"))
  assert.match(rr, /consent: z\s*\.boolean\(\{ required_error: CONSENT_MESSAGE, invalid_type_error: CONSENT_MESSAGE \}\)\s*\.refine\(\(v\) => v === true/)
  assert.match(creatorSrc, /consent to MTONYO\+ sharing your verified earnings and account data with AirPay Microfinance/)
  assert.match(rr, /consent_at = now\(\)/)
  assert.match(rr, /requested_at, consent_at\)/)
  assert.match(creatorSrc, /consentAt: row\.consent_at/)
  assert.match(adminSrc, /consentAt: row\.consent_at/)
})

test('item 4: recording an AirPay approval needs amount AND repayment terms; publishing checks both again', () => {
  const decide = adminSrc.slice(adminSrc.indexOf("'/capital/:id/decide'"), adminSrc.indexOf("'/capital/:id/publish-offer'"))
  assert.match(decide, /!b\.approvedAmountTzs \|\| !String\(b\.repaymentTerms \|\| ''\)\.trim\(\)/)
  assert.match(decide, /approved amount and repayment terms are both required to record an approval/)
  assert.match(decide, /recorded AirPay's \$\{b\.decision === 'approve' \? 'approval' : 'decline'\}/)
  const publish = adminSrc.slice(adminSrc.indexOf("'/capital/:id/publish-offer'"), adminSrc.indexOf("'/capital/:id/pause'"))
  assert.match(publish, /!existing\.approved_amount_tzs \|\| !String\(existing\.repayment_terms \|\| ''\)\.trim\(\)/)
  assert.match(publish, /before publishing the offer/)
})

test('the public stats expose the one rule and a real "creators earning" count', () => {
  const stats = readFileSync(join(root, 'modules/stats.routes.js'), 'utf8')
  assert.match(stats, /capitalMonthsRequired: Number\(settings\.capital_months_required\) \|\| 6/)
  assert.match(stats, /creatorsEarning: earning\.n/)
  assert.match(stats, /where e\.creator_tzs > 0 and p\.status = 'active'/)
  assert.match(stats, /\$1::boolean or not p\.is_demo/, 'respects the demo-content switch like top-creators does')
})

test('cleanup: the overview counts suspended accounts too, so the counters can reconcile', () => {
  const overview = adminSrc.slice(adminSrc.indexOf("'/overview'"), adminSrc.indexOf("'/activity'"))
  assert.match(overview, /count\(\*\) filter \(where status = 'active'\)::int as active/)
  assert.match(overview, /count\(\*\) filter \(where status = 'suspended'\)::int as suspended/)
})
