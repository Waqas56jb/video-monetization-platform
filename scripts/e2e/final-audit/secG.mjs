// Section G1-G4: release models on a real video through the real admin API, then restored exactly.
import { createRequire } from 'node:module'
const require = createRequire('D:/fiverr/video-monetization-platform/server/package.json')
require('dotenv').config({ path: 'D:/fiverr/video-monetization-platform/server/.env' })
const pg = require('pg')
const { API } = process.env
const VID = '8067e5ca-8bf2-494b-b999-582093284298' // behind-the-fame-a-coast-documentary — the E2E fixture owns it
const SLUG = 'behind-the-fame-a-coast-documentary'
const fails = []
const check = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(m); return c }
const login = async (email, password, side = 'viewer') => (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, side }) })).json()).session.accessToken
const admin = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
const owner = await login(process.env.E2E_EMAIL, process.env.E2E_PASSWORD)
const creator = await login(process.env.CREATOR_EMAIL, process.env.CREATOR_PASSWORD, 'creator')
const call = async (method, path, token, body) => { const r = await fetch(`${API}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json().catch(() => ({})) } }
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await db.connect()
const row = async () => (await db.query('select access_type, release_model, is_original, price_tzs, premiere_days, premiere_ends_at, ads_enabled, is_published, featured, free_preview_seconds, preview_uid from videos where id=$1', [VID])).rows[0]
const jobSrc = require('fs').readFileSync('D:/fiverr/video-monetization-platform/server/src/jobs/premiere.js', 'utf8')
const isDueSrc = jobSrc.replace(/\r\n/g, '\n').match(/function isDue\(video\) \{[\s\S]*?\n\}/)[0]
const isDue = new Function(`${isDueSrc}; return isDue`)() // the job's own function, evaluated from source
const state = async (label) => {
  const r = await row()
  const anon = await call('GET', `/api/playback/${SLUG}/playback`)
  const own = await call('GET', `/api/playback/${SLUG}/playback`, owner)
  const future = { ...r, premiere_ends_at: new Date(Date.now() - 1000).toISOString() }
  console.log(`  [${label}] release=${r.release_model} access=${r.access_type} price=${r.price_tzs} original=${r.is_original} published=${r.is_published} | anon ${anon.status} kind=${anon.body.playback?.kind ?? '—'} | buyer ${own.status} kind=${own.body.playback?.kind ?? '—'} | job would convert if expired: ${isDue(future)}`)
  return { r, anon, own, dueIfExpired: isDue(future) }
}

const original = await row()
console.log('original:', JSON.stringify(original))
try {
  console.log('\n### baseline (premiere_to_free)')
  const b = await state('baseline')
  check(b.own.body.playback?.kind === 'full' && b.anon.body.playback?.kind === 'preview', 'buyer gets full, anonymous gets the preview')
  check(b.dueIfExpired === true, 'a premiere_to_free video IS converted by the job once its window ends')

  console.log('\n### G2 MTONYO+ Original flag')
  const creatorTry = await call('PATCH', `/api/videos/${VID}`, creator, { isOriginal: true, releaseModel: 'exclusive' })
  const afterCreator = await row()
  check(afterCreator.is_original === false && afterCreator.release_model === 'premiere_to_free', `the video's own creator cannot set Original or Exclusive (PATCH -> ${creatorTry.status}; DB still original=${afterCreator.is_original}, release=${afterCreator.release_model})`)
  const o = await call('PATCH', `/api/admin/videos/${VID}`, admin, { isOriginal: true })
  const g2 = await state('Original on')
  check(o.status === 200 && g2.r.is_original === true, 'an admin can set it')
  check(g2.r.release_model === 'premiere_to_free' && g2.r.access_type === 'paid_premiere' && String(g2.r.premiere_ends_at) === String(original.premiere_ends_at) && g2.r.price_tzs === original.price_tzs, 'setting Original changes nothing about release, access, price or the premiere clock — it forces no conversion')

  console.log('\n### G1/G3 Exclusive — paid')
  const e1 = await call('PATCH', `/api/admin/videos/${VID}`, admin, { releaseModel: 'exclusive', isOriginal: false })
  const x1 = await state('exclusive, still paid')
  check(e1.status === 200 && x1.r.release_model === 'exclusive', 'admin sets Exclusive')
  check(x1.dueIfExpired === false, 'G3: the premiere job would NOT convert an Exclusive video even with its window over (isDue=false)')
  const dueSql = (await db.query(`select count(*)::int n from videos where id=$1 and access_type='paid_premiere' and release_model='premiere_to_free' and is_published and deleted_at is null and premiere_ends_at is not null and premiere_ends_at <= now() + interval '100 years'`, [VID])).rows[0].n
  check(dueSql === 0, `G3: and the job's own selection (with the clock pushed 100 years ahead) picks it up ${dueSql} times`)
  check(x1.own.body.playback?.kind === 'full' && x1.anon.body.playback?.kind === 'preview', 'Exclusive paid: buyer full, others preview')

  console.log('\n### G1 Exclusive — free')
  const e2 = await call('PATCH', `/api/admin/videos/${VID}`, admin, { accessType: 'free_with_ads' })
  const x2 = await state('exclusive, free')
  check(e2.status === 200 && x2.r.release_model === 'exclusive' && x2.r.access_type === 'free_with_ads', 'an access change keeps it Exclusive (not silently re-derived)')
  check(x2.anon.body.playback?.kind === 'full', 'Exclusive free: everyone gets the full film')

  console.log('\n### G1 Exclusive — unavailable (unpublished) / G4 buyer keeps access')
  const e3 = await call('PATCH', `/api/admin/videos/${VID}`, admin, { accessType: 'ppv_forever', priceTzs: original.price_tzs })
  const u = await call('POST', `/api/admin/videos/${VID}/unpublish`, admin, {})
  const x3 = await state('exclusive, unpublished')
  check(e3.status === 200 && u.status === 200 && x3.r.is_published === false, 'admin makes it unavailable (unpublish)')
  check(x3.anon.body.playback?.kind !== 'full', `anonymous can no longer watch it (${x3.anon.status}, kind=${x3.anon.body.playback?.kind ?? '—'})`)
  check(x3.own.body.playback?.kind === 'full', 'G4: the buyer still gets the FULL film after release-model + publish-status changes')
} finally {
  console.log('\n### restore')
  const p = await call('POST', `/api/admin/videos/${VID}/publish`, admin, {})
  const r = await call('PATCH', `/api/admin/videos/${VID}`, admin, { accessType: original.access_type, releaseModel: original.release_model, priceTzs: original.price_tzs, premiereDays: original.premiere_days, adsEnabled: original.ads_enabled, isOriginal: original.is_original, featured: original.featured })
  const now = await row()
  const same = Object.keys(original).every((k) => String(now[k]) === String(original[k]))
  console.log(`  publish -> ${p.status}, PATCH -> ${r.status}`)
  for (const k of Object.keys(original)) if (String(now[k]) !== String(original[k])) console.log(`  DIFF ${k}: was ${JSON.stringify(original[k])} now ${JSON.stringify(now[k])}`)
  check(same, 'every column is back to its original value')
  await state('restored')
  await db.end()
}
console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`)
for (const f of fails) console.log(`  - ${f}`)
