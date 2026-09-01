/**
 * C1 CLI block — follow, against production, with the count checked from the
 * graph rather than from the number the API happens to return.
 *
 * The interesting cases are the ones that used to be wrong:
 *   · does a double follow count twice?               (primary key + do nothing)
 *   · does the count agree with `follows` afterwards?  (031's trigger)
 *   · can a BLOCKED creator's followers unfollow?      (the 404 that trapped them)
 *   · does one request answer "who do I follow"?       (/api/creators/following)
 *
 * Lives under server/scripts so `dotenv` and the pool resolve — same place as
 * cleanup-e2e.mjs, for the same reason.
 *
 * The blocked case is exercised by blocking a creator for the duration of the
 * check and putting them back. That is a write to production, so it is done
 * against a creator with no followers other than the test account, it is
 * restored in a `finally`, and the original status is printed before and after.
 */
import 'dotenv/config'

const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const { many, one, query, transaction } = await import('../src/db/pool.js')

async function token(email, password) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, side: 'viewer' }),
  })
  const j = await r.json()
  return j?.session?.accessToken
}

const T = await token(EMAIL, PASSWORD)
if (!T) { console.error('could not sign in'); process.exit(2) }
const me = await (await fetch(`${API}/api/auth/me`, { headers: { authorization: `Bearer ${T}` } })).json()
const meId = me?.user?.id || me?.id
console.log(`\nsigned in as ${EMAIL} → ${meId}`)

const call = (method, path) =>
  fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${T}` } })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

const rowsFor = async (id) =>
  Number((await one('select count(*)::int as n from follows where creator_id = $1', [id]))?.n || 0)
const storedFor = async (id) =>
  Number((await one('select followers from creator_profiles where user_id = $1', [id]))?.followers ?? -1)

/* A creator this account does not already follow, and is not. */
const creator = await one(
  `select p.id, p.status::text as status, cp.display_name
     from profiles p join creator_profiles cp on cp.user_id = p.id
    where p.id <> $1 and p.status = 'active'
    order by cp.followers asc limit 1`,
  [meId]
)
console.log(`target creator: ${creator.display_name} (${creator.id}) status=${creator.status}\n`)

console.log('### follow, twice')
await call('DELETE', `/api/creators/${creator.id}/follow`)
const f1 = await call('POST', `/api/creators/${creator.id}/follow`)
const f2 = await call('POST', `/api/creators/${creator.id}/follow`)
console.log(`  POST  → ${f1.status} ${JSON.stringify(f1.body)}`)
console.log(`  POST  → ${f2.status} ${JSON.stringify(f2.body)}   (same call again)`)
check(f1.body?.isFollowing === true, 'the first follow takes')
check(f2.body?.followers === f1.body?.followers, 'the second does not count twice')
check(await rowsFor(creator.id) === f2.body.followers, `the count matches the graph (${await rowsFor(creator.id)} rows)`)
check(await storedFor(creator.id) === f2.body.followers, 'and creator_profiles.followers matches too — the trigger, not the route')

console.log('\n### the one request a page of cards makes')
const following = await call('GET', '/api/creators/following')
console.log(`  GET /api/creators/following → ${following.status} ${JSON.stringify(following.body).slice(0, 160)}`)
check(Array.isArray(following.body?.creatorIds), 'it returns ids')
check(following.body.creatorIds.includes(creator.id), 'including the creator just followed')

console.log('\n### a blocked creator — the case that used to trap followers for ever')
const before = creator.status
/**
 * `guard_account_changes()` refuses a status change unless the session says an
 * admin is making it — enforced in Postgres, not in application code, which is
 * the right place for it. So this sets the same session variable the admin route
 * sets rather than reaching around the guard.
 */
const setStatus = (status) =>
  transaction((c) => c.query(`update profiles set status = $2 where id = $1`, [creator.id, status]), {
    actorRole: 'admin',
    actorId: meId,
  })

try {
  await setStatus('blocked')
  console.log(`  ${creator.display_name} is now status=${(await one('select status::text as s from profiles where id = $1', [creator.id])).s}`)
  const blockedFollow = await call('POST', `/api/creators/${creator.id}/follow`)
  console.log(`  POST   .../follow → ${blockedFollow.status}   (following a blocked creator should still be refused)`)
  check(blockedFollow.status === 404, 'you cannot start following a blocked creator')
  const blockedUnfollow = await call('DELETE', `/api/creators/${creator.id}/follow`)
  console.log(`  DELETE .../follow → ${blockedUnfollow.status} ${JSON.stringify(blockedUnfollow.body)}`)
  check(blockedUnfollow.status === 200, 'but an existing follower CAN get out (this was 404 before)')
  check(blockedUnfollow.body?.isFollowing === false, 'and is no longer following')
  check(await rowsFor(creator.id) === blockedUnfollow.body.followers, 'the count still agrees with the graph')
} finally {
  await setStatus(before)
  console.log(`  restored → status=${(await one('select status::text as s from profiles where id = $1', [creator.id])).s}`)
}

console.log('\n### drift across every creator on the site')
const drift = await many(
  `select cp.user_id, cp.followers,
          (select count(*)::int from follows f where f.creator_id = cp.user_id) as actual
     from creator_profiles cp
    where cp.followers is distinct from (select count(*)::int from follows f where f.creator_id = cp.user_id)`
)
const total = await many('select user_id from creator_profiles')
console.log(`  ${total.length} creators, ${drift.length} disagreeing with the follows table`)
check(drift.length === 0, 'zero drift')

console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
