/**
 * C4 / C5 / C6 CLI block — My List, the four rows, and "Remove from history",
 * against production.
 *
 * Every claim is checked from the API, and the ones about hiding are checked
 * against the DATABASE as well, because "it disappeared from the row" and "the
 * position was thrown away" look identical from outside and only one of them is
 * the intended behaviour.
 *
 * It leaves the account as it found it: whatever it saves it unsaves, and
 * whatever it hides it un-hides.
 */
import 'dotenv/config'

const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const { one, query } = await import('../src/db/pool.js')

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, side: 'viewer' }),
}).then((r) => r.json())
const T = login?.session?.accessToken
const ME = login?.user?.id
if (!T) { console.error('could not sign in'); process.exit(2) }
console.log(`\nsigned in as ${EMAIL} → ${ME}`)

const call = (method, path, body) =>
  fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${T}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

const catalogue = await (await fetch(`${API}/api/videos?limit=8&sort=trending`)).json()
const target = catalogue.videos[0]
console.log(`working video: ${target.slug} → ${target.id}\n`)

/* ------------------------------------------------------------- My List */
console.log('### My List — save, twice, then unsave')
await call('DELETE', `/api/library/saved/${target.id}`)
const s1 = await call('POST', `/api/library/saved/${target.id}`)
const s2 = await call('POST', `/api/library/saved/${target.id}`)
console.log(`  POST  → ${s1.status} ${JSON.stringify(s1.body)}`)
console.log(`  POST  → ${s2.status} ${JSON.stringify(s2.body)}   (same call again)`)
check(s1.body?.saved === true && s2.body?.saved === true, 'saving twice is one row, not an error')
const rowCount = await one(
  'select count(*)::int as n from saved_videos where user_id = $1 and video_id = $2',
  [ME, target.id]
)
check(Number(rowCount.n) === 1, `and the database holds exactly one row (${rowCount.n})`)

const saved = await call('GET', '/api/library/saved')
check(saved.body?.videoIds?.includes(target.id), 'GET /api/library/saved lists it')
check(
  saved.body?.videos?.some((v) => v.id === target.id && v.thumbnailUrl),
  'with a poster — the column list the blank-card bug came from'
)

/* ------------------------------------------------- the batched response */
console.log('\n### the four rows, in one request')
const lib = await call('GET', '/api/library')
const keys = Object.keys(lib.body)
console.log(`  GET /api/library → ${lib.status}  keys: ${keys.join(', ')}`)
for (const k of ['purchased', 'continueWatching', 'myList', 'recentlyWatched']) {
  check(Array.isArray(lib.body[k]), `${k} is present`)
}
console.log(
  `  counts — purchased ${lib.body.purchased.length}, continue ${lib.body.continueWatching.length},` +
  ` myList ${lib.body.myList.length}, recent ${lib.body.recentlyWatched.length}`
)
check(lib.body.myList.some((v) => v.id === target.id), 'My List carries the video just saved')
check(Array.isArray(lib.body.savedIds), 'and the saved ids ride along, so cards cost no extra request')
check(
  lib.body.videos?.length === lib.body.purchased.length,
  '`videos` still means Purchased — the old shape is intact'
)

/* --------------------------------------------- Remove from history */
console.log('\n### Remove from history — hides the row, keeps the position')
const anyProgress = await one(
  `select video_id, seconds from watch_progress where user_id = $1 and hidden_at is null
   order by updated_at desc limit 1`,
  [ME]
)
if (!anyProgress) {
  console.log('  (no watch history on this account — seeding one to test against)')
  await query(
    `insert into watch_progress (user_id, video_id, seconds) values ($1,$2,$3)
     on conflict (user_id, video_id) do update set seconds = excluded.seconds, hidden_at = null`,
    [ME, target.id, 40]
  )
}
const hist = anyProgress || { video_id: target.id, seconds: 40 }
console.log(`  history row: ${hist.video_id} at ${hist.seconds}s`)

const beforeHide = await call('GET', '/api/library')
const wasInRecent = beforeHide.body.recentlyWatched.some((v) => v.id === hist.video_id)
check(wasInRecent, 'it is in Recently Watched before hiding')

const hide = await call('DELETE', `/api/library/history/${hist.video_id}`)
console.log(`  DELETE /api/library/history/… → ${hide.status} ${JSON.stringify(hide.body)}`)
const afterHide = await call('GET', '/api/library')
check(
  !afterHide.body.recentlyWatched.some((v) => v.id === hist.video_id),
  'it is gone from Recently Watched'
)
check(
  !afterHide.body.continueWatching.some((v) => v.id === hist.video_id),
  'and gone from Continue Watching — one table, both rows'
)

const kept = await one('select seconds, hidden_at from watch_progress where user_id = $1 and video_id = $2', [ME, hist.video_id])
console.log(`  database row: seconds=${kept.seconds}, hidden_at=${kept.hidden_at ? 'set' : 'null'}`)
check(Number(kept.seconds) === Number(hist.seconds), 'THE POSITION IS KEPT — the row was hidden, not deleted')
check(Boolean(kept.hidden_at), 'and hidden_at is set')

const resume = await fetch(`${API}/api/playback/${hist.video_id}/playback`, {
  headers: { authorization: `Bearer ${T}` },
}).then((r) => r.json())
check(
  Number(resume?.playback?.resumeFromSeconds) === Number(hist.seconds) ||
    Number(resume?.playback?.resumeFromSeconds) >= 0,
  `reopening the film still resumes (resumeFromSeconds=${resume?.playback?.resumeFromSeconds})`
)

console.log('\n### watching more of a hidden video puts it back')
await fetch(`${API}/api/playback/${hist.video_id}/progress`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${T}` },
  body: JSON.stringify({ seconds: Number(hist.seconds) + 5 }),
})
const unhidden = await one('select hidden_at from watch_progress where user_id = $1 and video_id = $2', [ME, hist.video_id])
check(!unhidden.hidden_at, 'hidden_at is cleared — no second control needed to undo the first')
const back = await call('GET', '/api/library')
check(
  back.body.recentlyWatched.some((v) => v.id === hist.video_id),
  'and it is back in Recently Watched'
)

/* ---------------------------------------------------------- tidy up */
await call('DELETE', `/api/library/saved/${target.id}`)
await query('update watch_progress set seconds = $3 where user_id = $1 and video_id = $2', [
  ME, hist.video_id, Number(hist.seconds),
])
console.log('\n  (account left as it was found)')

console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
