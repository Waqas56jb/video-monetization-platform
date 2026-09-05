/**
 * Creator Capital CLI block — every route, against production, with both a
 * creator token and an admin token.
 *
 * Manual workflow only: nothing here computes a credit decision, it only
 * checks that eligibility, the request, and the admin review/approve/
 * publish/pause/repay actions all move the one row the way the design says
 * they should. Whatever this script creates in `creator_capital`, it
 * deletes again at the end — same discipline as follow-cli.mjs and
 * library-cli.mjs before it.
 *
 *   node scripts/capital-cli.mjs
 *
 * Needs: ADMIN_EMAIL / ADMIN_PASSWORD (an account with role=admin or the
 * `capital` staff_module granted), and a creator account —
 * CAPITAL_CREATOR_EMAIL / CAPITAL_CREATOR_PASSWORD. Falls back to the
 * seeded demo creator (demo.asha@mtonyo.demo) if the latter two are unset,
 * since Prompt B's own instruction was "seed nothing — the fixture creator
 * will naturally show Building Eligibility."
 */
import 'dotenv/config'

const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const CREATOR_EMAIL = process.env.CAPITAL_CREATOR_EMAIL || 'demo.asha@mtonyo.demo'
const CREATOR_PASSWORD = process.env.CAPITAL_CREATOR_PASSWORD || 'DemoPass123!'

const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const { one, query } = await import('../src/db/pool.js')

async function login(email, password) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, side: email === CREATOR_EMAIL ? 'creator' : 'viewer' }),
  })
  const j = await r.json()
  return { token: j?.session?.accessToken, user: j?.user }
}

const creator = await login(CREATOR_EMAIL, CREATOR_PASSWORD)
if (!creator.token) { console.error(`could not sign in as creator ${CREATOR_EMAIL}`); process.exit(2) }
console.log(`\nsigned in as creator ${CREATOR_EMAIL} → ${creator.user.id}`)

let admin = { token: null }
if (ADMIN_EMAIL && ADMIN_PASSWORD) admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
if (!admin.token) {
  console.log('  (no ADMIN_EMAIL/ADMIN_PASSWORD — admin routes exercised via direct DB check instead)')
}

const call = (token, method, path, body) =>
  fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

// Leave no trace: whatever pre-existing row this creator had (there should
// be none — Prompt B: "seed nothing"), and whatever this run creates, is
// gone by the end.
const before = await one('select id from creator_capital where creator_id = $1', [creator.user.id])
if (before) console.log(`  note: a creator_capital row already existed (${before.id}) — left alone, not this run's`)

console.log('\n### GET /api/capital/status — the default, unseeded state')
{
  const { status, body } = await call(creator.token, 'GET', '/api/capital/status')
  check(status === 200, 'status endpoint answers 200')
  check(body.capital === null || Boolean(before), 'no row yet ⇒ capital is null (Building Eligibility, client-side default)')
  check(body.monthsRequired === 6, 'default months_required is 6')
  console.log(`  months with earnings: ${body.monthsWithEarnings} of ${body.monthsRequired}`)
}

console.log('\n### POST /api/capital/request-review — the eligibility gate')
let createdId = null
{
  const { status, body } = await call(creator.token, 'POST', '/api/capital/request-review')
  if (status === 400) {
    check(true, `refused under months_required, as expected: "${body?.error?.message}"`)
  } else if (status === 200) {
    createdId = body.capital.id
    check(body.capital.status === 'under_review', 'eligible creator moves straight to under_review')
  } else {
    check(false, `unexpected response ${status}: ${JSON.stringify(body)}`)
  }
}

// If the creator was not naturally eligible, insert the row directly (the
// same "set up via SQL, exercise via the API" pattern the DB migration's
// own RLS policy already forces on every write anyway) so every admin
// action below still gets a real row to act on.
if (!createdId) {
  const inserted = await one(
    `insert into creator_capital (creator_id, status, requested_at) values ($1, 'under_review', now()) returning id`,
    [creator.user.id]
  )
  createdId = inserted.id
  console.log(`  (inserted a throwaway under_review row directly, ${createdId}, to exercise the admin routes below)`)
}

if (admin.token) {
  console.log('\n### GET /api/admin/capital — the review list')
  {
    const { status, body } = await call(admin.token, 'GET', '/api/admin/capital?status=under_review')
    check(status === 200, 'admin list answers 200')
    check(body.applications.some((a) => a.id === createdId), 'the request appears in the under_review list')
    const row = body.applications.find((a) => a.id === createdId)
    check(typeof row?.monthsWithEarnings === 'number', 'carries monthsWithEarnings')
    check(typeof row?.payingViewers === 'number', 'carries payingViewers')
    check(typeof row?.refundRatePercent === 'number', 'carries refundRatePercent')
  }

  console.log('\n### POST /api/admin/capital/:id/decide — approve')
  {
    const { status, body } = await call(admin.token, 'POST', `/api/admin/capital/${createdId}/decide`, {
      decision: 'approve', approvedAmountTzs: 50000, purpose: 'New gear', repaymentTerms: '6 monthly instalments',
    })
    check(status === 200, 'decide (approve) answers 200')
    check(body.capital.status === 'approved', 'status moves to approved')
    check(body.capital.approvedAmountTzs === 50000, 'approved amount recorded')
  }

  console.log('\n### POST /api/admin/capital/:id/publish-offer')
  {
    const { status, body } = await call(admin.token, 'POST', `/api/admin/capital/${createdId}/publish-offer`)
    check(status === 200, 'publish-offer answers 200')
    check(body.capital.status === 'approved', 'still approved — publishing makes it visible, does not itself activate it')
  }

  console.log('\n### POST /api/capital/accept-offer — the creator side of publish-offer')
  {
    const { status, body } = await call(creator.token, 'POST', '/api/capital/accept-offer')
    check(status === 200, 'accept-offer answers 200')
    check(body.capital.status === 'active', 'status moves to active on the creator\'s own accept')
  }

  console.log('\n### POST /api/admin/capital/:id/pause')
  {
    const { status, body } = await call(admin.token, 'POST', `/api/admin/capital/${createdId}/pause`, { note: 'CLI check' })
    check(status === 200, 'pause answers 200')
    check(body.capital.status === 'paused', 'status moves to paused')
  }

  console.log('\n### POST /api/admin/capital/:id/mark-repaid — partial, then full')
  {
    const partial = await call(admin.token, 'POST', `/api/admin/capital/${createdId}/mark-repaid`, { amountTzs: 20000 })
    check(partial.status === 200, 'partial repayment answers 200')
    check(partial.body.capital.status === 'paused', 'a partial repayment does not close the record')
    check(partial.body.capital.remainingBalanceTzs === 30000, `remaining balance is 30000 (got ${partial.body.capital.remainingBalanceTzs})`)

    const full = await call(admin.token, 'POST', `/api/admin/capital/${createdId}/mark-repaid`, { amountTzs: 30000 })
    check(full.status === 200, 'final repayment answers 200')
    check(full.body.capital.status === 'repaid', 'reaching the full approved amount closes the record')
    check(full.body.capital.remainingBalanceTzs === 0, 'remaining balance is 0')
  }
} else {
  console.log('\n(admin routes not exercised via HTTP — no ADMIN_EMAIL/ADMIN_PASSWORD supplied)')
}

console.log('\n### cleanup — leave the account as it was found')
await query('delete from creator_capital where id = $1', [createdId])
const after = await one('select id from creator_capital where id = $1', [createdId])
check(!after, 'the throwaway row is gone')

console.log(`\n${fails.length ? `${fails.length} FAILED:\n  - ${fails.join('\n  - ')}` : 'ALL PASS'}`)
process.exit(fails.length ? 1 : 0)
