// Section F3/F4/F5 live: consent required, duplicate refused, incomplete approval refused — then closed via the admin path.
import { createRequire } from 'node:module'
const require = createRequire('D:/fiverr/video-monetization-platform/server/package.json')
require('dotenv').config({ path: 'D:/fiverr/video-monetization-platform/server/.env' })
const pg = require('pg')
const { API } = process.env
const fails = []
const check = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(m); return c }
const login = async (email, password, side = 'viewer') => (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, side }) })).json()).session.accessToken
const call = async (method, path, token, body) => { const r = await fetch(`${API}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json().catch(() => ({})) } }
const admin = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
const creator = await login(process.env.CREATOR_EMAIL, process.env.CREATOR_PASSWORD, 'creator')
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await db.connect()
const months = async (v) => (await call('PATCH', '/api/admin/settings', admin, { capital_months_required: v })).body.settings?.capital_months_required

const me = await call('GET', '/api/capital/status', creator)
const before = (await call('GET', '/api/admin/settings', admin)).body.settings.capital_months_required
console.log(`capital_months_required = ${before}; demo.asha months with earnings = ${me.body.monthsWithEarnings ?? me.body.eligibility?.months_with_earnings ?? JSON.stringify(me.body).slice(0, 200)}`)
let requestId = null
try {
  console.log('\n### at the real rule (6 months)')
  const r0 = await call('POST', '/api/capital/request-review', creator, { consent: true })
  check(r0.status === 400, `an ineligible creator is refused (${r0.status}: ${r0.body.error?.message})`)

  console.log(`\n### temporarily 1 month, so a real request can exist -> ${await months(1)}`)
  const r1 = await call('POST', '/api/capital/request-review', creator, {})
  check(r1.status === 400 && /consent/i.test(r1.body.error?.message || ''), `F5 no consent field -> ${r1.status}: "${r1.body.error?.message}"`)
  const r2 = await call('POST', '/api/capital/request-review', creator, { consent: false })
  check(r2.status === 400 && /consent/i.test(r2.body.error?.message || ''), `F5 consent:false -> ${r2.status}`)
  const r3 = await call('POST', '/api/capital/request-review', creator, { consent: true })
  requestId = r3.body.request?.id || r3.body.capital?.id || r3.body.id || (await db.query("select c.id from creator_capital c join profiles p on p.id=c.creator_id where p.email=$1 and c.status='under_review'", [process.env.CREATOR_EMAIL])).rows[0]?.id
  check([200, 201].includes(r3.status) && requestId, `with consent, the request is accepted (${r3.status}) — id ${requestId}`)
  const consentAt = (await db.query('select consent_at, status from creator_capital where id=$1', [requestId])).rows[0]
  check(consentAt?.consent_at && consentAt.status === 'under_review', `consent recorded at ${consentAt?.consent_at?.toISOString?.()}, status ${consentAt?.status}`)
  const r4 = await call('POST', '/api/capital/request-review', creator, { consent: true })
  check(r4.status === 409, `F3 a second request while one is open -> ${r4.status}: "${r4.body.error?.message}"`)
  const n = (await db.query("select count(*)::int n from creator_capital c join profiles p on p.id=c.creator_id where p.email=$1 and c.status in ('under_review','approved','active','paused')", [process.env.CREATOR_EMAIL])).rows[0].n
  check(n === 1, `and exactly ONE open request exists in the database (${n})`)

  console.log('\n### F4 admin side')
  const a1 = await call('POST', `/api/admin/capital/${requestId}/decide`, admin, { decision: 'approve' })
  check(a1.status === 400, `Record AirPay Approval with no amount and no terms -> ${a1.status}: "${a1.body.error?.message}"`)
  const a2 = await call('POST', `/api/admin/capital/${requestId}/decide`, admin, { decision: 'approve', approvedAmountTzs: 500000 })
  check(a2.status === 400, `with an amount but no repayment terms -> ${a2.status}`)
  const a3 = await call('POST', `/api/admin/capital/${requestId}/decide`, admin, { decision: 'approve', repaymentTerms: '6 monthly instalments' })
  check(a3.status === 400, `with terms but no amount -> ${a3.status}`)
  const a4 = await call('POST', `/api/admin/capital/${requestId}/publish-offer`, admin, {})
  check(a4.status === 409 || a4.status === 400, `publishing an offer that was never approved -> ${a4.status}: "${a4.body.error?.message}"`)
  const still = (await db.query('select status, approved_amount_tzs, repayment_terms from creator_capital where id=$1', [requestId])).rows[0]
  check(still.status === 'under_review' && !still.approved_amount_tzs && !still.repayment_terms, 'none of those changed the request')
} finally {
  if (requestId) {
    const d = await call('POST', `/api/admin/capital/${requestId}/decide`, admin, { decision: 'decline', note: 'Final audit 2026-09-25 — test request, recorded as declined through the admin path' })
    console.log(`\nclose it: Record AirPay Decline -> ${d.status} (${d.body.request?.status ?? d.body.capital?.status ?? ''})`)
  }
  console.log(`restore capital_months_required -> ${await months(before)}`)
  const s = (await db.query('select capital_months_required from platform_settings')).rows[0]
  check(s.capital_months_required === before, `setting back to ${before} in the database`)
  await db.end()
}
console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`)
for (const f of fails) console.log(`  - ${f}`)
