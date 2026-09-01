/**
 * C7 — take the two test uploads off the public site, through the admin API,
 * and prove the buyer keeps what they paid for.
 *
 * The two are `WhatsApp Video 2026-08-15…` and `80915499123 FD8FEAC4…`: raw
 * filenames, no description, no category, no chosen poster. They are on Explore
 * today, so the client has already seen them.
 *
 * THROUGH THE ADMIN ROUTE, not with an UPDATE. `POST /api/admin/videos/:id/
 * unpublish` writes an audit row, notifies the creator and returns "Unpublished
 * — buyers keep their access". A direct write to `is_published` would look the
 * same in the videos table and skip all of that, and would prove nothing about
 * the route an administrator will actually use at handover.
 *
 * The staff account is the seeded demo moderator, whose password is published in
 * `src/cli/demo.js` and is meant for exactly this. No real administrator's
 * credentials are touched.
 *
 *   node scripts/unpublish-test-uploads.mjs           # show what would happen
 *   node scripts/unpublish-test-uploads.mjs --apply
 */
import 'dotenv/config'

const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const APPLY = process.argv.includes('--apply')
const STAFF_EMAIL = process.env.STAFF_EMAIL || 'demo.moderator@mtonyo.demo'
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'DemoPass123!'
const BUYER_EMAIL = process.env.E2E_EMAIL
const BUYER_PASSWORD = process.env.E2E_PASSWORD

const TARGET_SLUGS = [
  'whatsapp-video-2026-08-15-at-11-50-34-pm',
  '80915499123-fd8feac4-6609-4d3e-8739-d3a2cdde7f76',
]

const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written'}\n`)

async function token(email, password) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, side: 'viewer' }),
  })
  const j = await r.json()
  return j?.session?.accessToken
}

const staff = await token(STAFF_EMAIL, STAFF_PASSWORD)
if (!staff) { console.error(`could not sign in as ${STAFF_EMAIL}`); process.exit(2) }
console.log(`staff: ${STAFF_EMAIL}`)

const buyer = BUYER_EMAIL ? await token(BUYER_EMAIL, BUYER_PASSWORD) : null
console.log(`buyer: ${BUYER_EMAIL || '(none given)'}\n`)

/** What the server grants this viewer for this video. */
async function entitlement(tok, id) {
  const r = await fetch(`${API}/api/playback/${id}/playback`, {
    headers: tok ? { authorization: `Bearer ${tok}` } : {},
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, kind: j?.playback?.kind ?? null, owned: j?.access?.owned ?? null }
}

const catalogue = await (await fetch(`${API}/api/videos?limit=50`)).json()
const publicSlugs = new Set((catalogue.videos || []).map((v) => v.slug))

for (const slug of TARGET_SLUGS) {
  console.log(`### ${slug}`)
  const meta = await (await fetch(`${API}/api/videos/${slug}`)).json().catch(() => ({}))
  const video = meta?.video
  if (!video) { console.log('  not found — already gone?\n'); continue }
  console.log(`  id ${video.id}   published on Explore: ${publicSlugs.has(slug)}`)

  const before = buyer ? await entitlement(buyer, video.id) : null
  if (before) console.log(`  buyer before: kind=${before.kind} owned=${before.owned}`)

  if (!APPLY) { console.log('  (dry run — not unpublishing)\n'); continue }

  const res = await fetch(`${API}/api/admin/videos/${video.id}/unpublish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${staff}`, 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'Test upload, removed before handover' }),
  })
  const body = await res.json().catch(() => ({}))
  console.log(`  POST /api/admin/videos/${video.id}/unpublish → ${res.status} ${body?.message || JSON.stringify(body).slice(0, 120)}`)
  check(res.ok, `${slug} unpublished through the admin route`)

  /* Off the public catalogue… */
  const after = await (await fetch(`${API}/api/videos?limit=50`)).json()
  const stillListed = (after.videos || []).some((v) => v.slug === slug)
  check(!stillListed, 'it is off Explore')

  /* …and still the buyer's. */
  if (before?.owned) {
    const now = await entitlement(buyer, video.id)
    console.log(`  buyer after:  kind=${now.kind} owned=${now.owned}`)
    check(now.kind === 'full', 'THE BUYER KEEPS FULL ACCESS — a purchase does not vanish with a listing')
    const lib = await (await fetch(`${API}/api/library`, { headers: { authorization: `Bearer ${buyer}` } })).json()
    check(
      (lib.purchased || lib.videos || []).some((v) => v.slug === slug),
      'and it is still in their library'
    )
  } else {
    console.log('  (this account never bought this one — nothing to check)')
  }
  console.log('')
}

console.log(fails.length ? `${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : APPLY ? 'ALL PASS' : 'dry run complete')
process.exit(fails.length ? 1 : 0)
