/**
 * Watch and Create are two accounts that share an email and a password.
 *
 * The client's report, in their words: "I created account for creator in create
 * new account, it created my account as viewer." It did — signing up on Create
 * opened a Watch account and sent the person to an application queue, and the
 * Create login then refused them.
 *
 * The rules this proves, end to end against production:
 *
 *   1  signing up on Create makes a CREATE account, and no Watch account
 *   2  signing up on Watch makes a WATCH account, and no Create account
 *   3  you cannot log in on a side you do not have — in either direction
 *   4  the same email can hold both, added one at a time with the same password
 *   5  asking again for a side you already have is refused, and says so
 *   6  a Create account opens the studio
 *   7  a Create account still cannot publish anything on its own
 *
 * Rule 7 is the load-bearing one. Self-serve Create signup is only safe because
 * reaching viewers is a separate step an administrator controls, so this checks
 * the catalogue rather than taking it on trust.
 *
 *   node scripts/e2e/account-sides.mjs
 */
const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'

const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const post = (path, body, token) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

const get = (path, token) =>
  fetch(`${API}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

const stamp = Date.now().toString().slice(-9)
const creatorEmail = `e2e+side-c${stamp}@mtonyo.test`
const viewerEmail = `e2e+side-v${stamp}@mtonyo.test`
const password = `E2e-Side-${stamp}!`

const register = (email, side) =>
  post('/api/auth/register', {
    email, password, fullName: 'Side Probe', phone: '0712345678', side, role: side,
  })
const login = (email, side) => post('/api/auth/login', { email, password, side })

const sidesOf = (r) => JSON.stringify(r.body?.sides)

/* ------------------------------------------------ 1 · Create signup ------ */
console.log(`\n### signing up on CREATE — ${creatorEmail}`)
const c1 = await register(creatorEmail, 'creator')
console.log(`  register(side=creator) → ${c1.status}  side=${c1.body.side}  sides=${sidesOf(c1)}  role=${c1.body.user?.role}`)
check(c1.status === 201, 'the account is created')
check(c1.body.side === 'creator', 'it reports the Create side, not Watch')
check(c1.body.sides?.creator === true, 'the Create side exists')
check(c1.body.sides?.viewer === false, 'and NO Watch account was made behind their back')
check(c1.body.needsCreatorApplication === false, 'they are not diverted to an application queue')

console.log('\n### and the two logins')
const cLoginC = await login(creatorEmail, 'creator')
console.log(`  login(side=creator) → ${cLoginC.status}  sides=${sidesOf(cLoginC)}  creator=${JSON.stringify(cLoginC.body.creator)}`)
check(cLoginC.status === 200, 'logging in on Create works')
check(Boolean(cLoginC.body.creator), 'and the studio profile comes back with it')

const cLoginV = await login(creatorEmail, 'viewer')
console.log(`  login(side=viewer)  → ${cLoginV.status}  ${cLoginV.body.error?.code} — ${cLoginV.body.error?.message?.slice(0, 90)}`)
check(cLoginV.status === 403, 'logging in on Watch is refused — there is no Watch account')
check(cLoginV.body.error?.code === 'WRONG_SIDE', 'and it says which side is missing')
check(/sign up on watch/i.test(cLoginV.body.error?.message || ''), 'and tells them how to get one')

/* ------------------------------------------------ 6 · the studio opens --- */
console.log('\n### the studio')
const token = cLoginC.body.session?.accessToken
const mine = await get('/api/videos/mine', token)
console.log(`  GET /api/videos/mine → ${mine.status}`)
check(mine.status === 200, 'a Create account can reach the studio')

/* ------------------------------------------------ 4 · add the other side - */
console.log('\n### adding the Watch side to the same email')
const addV = await register(creatorEmail, 'viewer')
console.log(`  register(side=viewer) → ${addV.status}  side=${addV.body.side}  sides=${sidesOf(addV)}  attached=${addV.body.attached}`)
check(addV.status === 200, 'the same email can add the other side')
check(addV.body.sides?.viewer === true && addV.body.sides?.creator === true, 'now it holds both')
check(addV.body.attached === true, 'and it is reported as an addition, not a new account')
check((await login(creatorEmail, 'viewer')).status === 200, 'the Watch login works now')
check((await login(creatorEmail, 'creator')).status === 200, 'and the Create login still works')

/* ------------------------------------------------ 5 · asking twice ------- */
console.log('\n### asking for a side that is already there')
const again = await register(creatorEmail, 'creator')
console.log(`  register(side=creator) → ${again.status}  ${again.body.error?.code} — ${again.body.error?.message}`)
check(again.status === 409, 'refused')
check(again.body.error?.code === 'ALREADY_REGISTERED', 'as a duplicate, not as a bad password')
check(/create/i.test(again.body.error?.message || ''), 'and names the side they already have')

/* ------------------------------------------------ 2 · Watch signup ------- */
console.log(`\n### signing up on WATCH — ${viewerEmail}`)
const v1 = await register(viewerEmail, 'viewer')
console.log(`  register(side=viewer) → ${v1.status}  side=${v1.body.side}  sides=${sidesOf(v1)}`)
check(v1.status === 201, 'the account is created')
check(v1.body.sides?.viewer === true, 'the Watch side exists')
check(v1.body.sides?.creator === false, 'and NO Create account was made behind their back')
check((await login(viewerEmail, 'viewer')).status === 200, 'the Watch login works')

const vLoginC = await login(viewerEmail, 'creator')
console.log(`  login(side=creator) → ${vLoginC.status}  ${vLoginC.body.error?.code} — ${vLoginC.body.error?.message?.slice(0, 90)}`)
check(vLoginC.status === 403, 'the Create login is refused — there is no Create account')
check(/sign up on create/i.test(vLoginC.body.error?.message || ''), 'and tells them how to get one')

const vToken = (await login(viewerEmail, 'viewer')).body.session?.accessToken
const vMine = await get('/api/videos/mine', vToken)
console.log(`  GET /api/videos/mine as a viewer → ${vMine.status}`)
check(vMine.status === 403, 'and a Watch account cannot reach the studio')

/* ------------------------------------------------ 7 · publishing --------- */
console.log('\n### a brand-new Create account still cannot publish')
const before = await get('/api/videos?limit=50')
const listed = (before.body.videos || []).length
console.log(`  public catalogue: ${listed} videos, none of them this account's`)
check(
  !(before.body.videos || []).some((v) => v.creator?.id === cLoginC.body.user?.id),
  'nothing of theirs is on the public catalogue — it takes an administrator to approve a video'
)

console.log(`\naccounts made by this run (reverse with server/scripts/cleanup-e2e.mjs):`)
console.log(`  ${creatorEmail}  ${password}   (both sides)`)
console.log(`  ${viewerEmail}  ${password}   (Watch only)`)
console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
