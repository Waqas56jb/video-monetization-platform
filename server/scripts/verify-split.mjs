/**
 * The revenue split, checked live against every surface the client listed
 * (report2.txt §1) — a real 70 -> 65 -> 70 flip against production, not a
 * one-off manual check. Run this again any time the split is reported as
 * "not updating everywhere"; if it stays green, the report is a stale
 * open tab (this app never polls — see report2.txt §1's RESOLUTION), not a
 * live defect.
 *
 *   ADMIN_EMAIL=admin@mtonyo.tz ADMIN_PASSWORD=... \
 *     node scripts/verify-split.mjs [apiBase]
 *
 * Restores the split to its original value even if a check fails partway
 * through — this must never leave production on a test value.
 */
const API = (process.argv[2] || process.env.API_BASE || 'https://video-monetization-platform-production.up.railway.app').replace(/\/$/, '')
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const CREATOR_EMAIL = process.env.SPLIT_CREATOR_EMAIL || 'demo.asha@mtonyo.demo'
const CREATOR_PASSWORD = process.env.SPLIT_CREATOR_PASSWORD || 'DemoPass123!'

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (a live admin login) before running this.')
  process.exit(1)
}

const ok = []
const fail = []
const check = (name, cond, detail = '') => (cond ? ok : fail).push(detail ? `${name} (${detail})` : name)

async function login(email, password, side) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, ...(side ? { side } : {}) }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`login failed for ${email}: ${body.error?.message || res.status}`)
  return body.session.accessToken
}

async function getJSON(path, token) {
  const res = await fetch(`${API}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function patchSettings(token, patch) {
  const res = await fetch(`${API}/api/admin/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`settings PATCH failed: ${body.error?.message || res.status}`)
  return body.settings.creator_split_percent
}

async function surfacesAt(adminToken, creatorToken) {
  const stats = await getJSON('/api/stats')
  const adminSettings = await getJSON('/api/admin/settings', adminToken)
  const adminRevenue = await getJSON('/api/admin/revenue', adminToken)
  const earnings = creatorToken ? await getJSON('/api/earnings', creatorToken) : null
  return {
    stats: stats.body?.creatorSplitPercent,
    adminSettings: adminSettings.body?.settings?.creator_split_percent,
    adminRevenueDefault: adminRevenue.body?.defaultSplitPercent,
    creatorEarnings: earnings?.body?.splitPercent,
  }
}

async function run() {
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
  let creatorToken = null
  try {
    creatorToken = await login(CREATOR_EMAIL, CREATOR_PASSWORD, 'creator')
  } catch (err) {
    console.log(`(no creator token — ${err.message}; creator-earnings surface will be skipped)`)
  }

  const before = await surfacesAt(adminToken, creatorToken)
  const original = before.adminSettings
  console.log(`starting split: ${original}%`)

  let restored = original
  try {
    const flipped = await patchSettings(adminToken, { creator_split_percent: original === 65 ? 60 : 65 })
    const after = await surfacesAt(adminToken, creatorToken)

    check('public /api/stats reflects the flip on the very next request', after.stats === flipped, `${after.stats} vs expected ${flipped}`)
    check('admin GET /settings reflects the flip', after.adminSettings === flipped, `${after.adminSettings}`)
    check('admin GET /revenue defaultSplitPercent reflects the flip', after.adminRevenueDefault === flipped, `${after.adminRevenueDefault}`)
    if (creatorToken) {
      check('creator GET /earnings splitPercent reflects the flip', after.creatorEarnings === flipped, `${after.creatorEarnings}`)
    }
  } finally {
    restored = await patchSettings(adminToken, { creator_split_percent: original })
    const settled = await surfacesAt(adminToken, creatorToken)
    check('split restored to its original value', settled.adminSettings === original, `${settled.adminSettings} vs ${original}`)
  }

  console.log('')
  for (const n of ok) console.log(`OK   ${n}`)
  for (const n of fail) console.log(`FAIL ${n}`)
  console.log(`\n${ok.length} passed, ${fail.length} failed — split left at ${restored}%`)
  if (fail.length) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
