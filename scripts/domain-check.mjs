#!/usr/bin/env node
/**
 * Custom-domain readiness / verification (Milestone 3). Read-only HTTP.
 *
 *   node scripts/domain-check.mjs --site https://mtonyo.co.tz \
 *        [--api https://api.mtonyo.co.tz] [--admin https://admin.mtonyo.co.tz] [--old https://…vercel.app]
 *
 * Checks that the site, admin and API all agree on the new addresses and that
 * nothing a viewer, a crawler or a payment gateway touches still points at
 * the old *.vercel.app / *.railway.app hosts.
 */
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1].replace(/\/$/, '') : d }
const SITE = arg('site')
const API = arg('api', 'https://video-monetization-platform-production.up.railway.app')
const ADMIN = arg('admin', 'https://video-monetization-platform-admin.vercel.app')
const OLD = arg('old', 'https://video-monetization-platform-chi.vercel.app')
if (!SITE) { console.error('Usage: --site https://your-domain [--api …] [--admin …] [--old …]'); process.exit(2) }

const WA = 'WhatsApp/2.24.8.78 A'
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }
const host = (u) => { try { return new URL(u).host } catch { return '' } }
const OLD_HOSTS = /vercel\.app|railway\.app/i

async function get(url, opts = {}) {
  try {
    const r = await fetch(url, { redirect: 'manual', ...opts })
    return { status: r.status, headers: r.headers, text: opts.method === 'OPTIONS' ? '' : await r.text() }
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.message, headers: new Headers(), text: '' }
  }
}

console.log(`\n  site ${SITE}\n  api  ${API}\n  admin ${ADMIN}\n  old  ${OLD}\n`)

console.log('### site')
const home = await get(`${SITE}/`)
check(home.status === 200, `homepage over HTTPS → ${home.status || home.error}`)
check(!/%SITE_URL%/.test(home.text), 'no unreplaced %SITE_URL% placeholder')
const ogImg = home.text.match(/og:image" content="([^"]+)/)?.[1] || ''
check(host(ogImg) === host(SITE), `platform og:image on the new host (${ogImg || 'missing'})`)
const sw = await get(`${SITE}/sw.js`)
check(sw.status === 200, `service worker served (${sw.status})`)

console.log('\n### API agrees on the addresses')
const health = await get(`${API}/health`)
let h = {}
try { h = JSON.parse(health.text) } catch { /* reported below */ }
check(health.status === 200 && h.ok, `API health ${health.status || health.error}`)
check(h.urls?.publicApp?.replace(/\/$/, '') === SITE, `PUBLIC_WEB_URL = ${h.urls?.publicApp}`)
check(h.urls?.adminApp?.replace(/\/$/, '') === ADMIN, `ADMIN_WEB_URL = ${h.urls?.adminApp}`)
check((h.urls?.allowedOrigins || []).includes(SITE), 'CORS allows the new site')
check((h.urls?.allowedOrigins || []).includes(ADMIN), 'CORS allows the admin')
check(h.proxy?.ok !== false, 'proxy hop setting healthy')
for (const origin of [SITE, ADMIN]) {
  const pre = await get(`${API}/api/videos?limit=1`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } })
  check(pre.headers.get('access-control-allow-origin') === origin, `preflight from ${host(origin)} → ${pre.headers.get('access-control-allow-origin') || pre.status}`)
}

console.log('\n### a shared link, as WhatsApp sees it')
let slug = null
try { slug = JSON.parse((await get(`${API}/api/videos?limit=1&sort=trending`)).text).videos?.[0]?.slug } catch { /* none */ }
if (slug) {
  const card = await get(`${SITE}/watch/${slug}`, { headers: { 'User-Agent': WA } })
  const ogUrl = card.text.match(/og:url" content="([^"]+)/)?.[1] || ''
  const ogImage = card.text.match(/og:image" content="([^"]+)/)?.[1] || ''
  check(card.status === 200, `/watch/${slug} for WhatsApp → ${card.status}`)
  check(host(ogUrl) === host(SITE), `og:url on the new host (${ogUrl})`)
  check(Boolean(ogImage), `og:image present (${host(ogImage)})`)
  const share = await get(`${API}/api/share/${slug}`)
  let s = {}
  try { s = JSON.parse(share.text) } catch { /* reported */ }
  check(host(s.shareLink || s.deepLink || "") === host(SITE), `share links point at the new host (${s.shareLink || s.deepLink})`)
} else {
  check(false, 'could not list a published video to test a shared link')
}

console.log('\n### payment return lands on the new site')
const ret = await get(`${API}/api/payments/return/${h.payments?.provider || 'sandbox'}`)
const loc = ret.headers.get('location') || ''
check(ret.status === 303 && host(loc) === host(SITE), `return → ${ret.status} ${loc}`)

console.log('\n### the old address')
const old = await get(`${OLD}/watch/${slug || ''}`)
const to = old.headers.get('location') || ''
check([301, 307, 308].includes(old.status) && host(to) === host(SITE), `${host(OLD)} redirects to the new site (${old.status} ${to || ''})`)
check(!OLD_HOSTS.test(host(SITE)), 'the site itself is not on vercel.app')

console.log(fails.length ? `\n${fails.length} FAIL\n` : '\nALL PASS — the domain move is complete\n')
process.exit(fails.length ? 1 : 0)
