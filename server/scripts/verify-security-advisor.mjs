/**
 * Advisor-equivalent checks + API smoke after the PostgREST lock.
 * Writes server/tmp/security-advisor-equivalent.html (gitignored).
 * Never prints keys or row bodies.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../src/config/env.js'
import { one, many, query, closePool } from '../src/db/pool.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, '..', 'tmp')
fs.mkdirSync(OUT_DIR, { recursive: true })

const rlsOff = await many(`
  select n.nspname as schema, c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
   order by 1, 2
`)

const anonGrants = await many(`
  select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated', 'PUBLIC')
   group by table_name, grantee
   order by 1, 2
`)

const tables = await many(`
  select c.relname as name, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by 1
`)

const trigger = await one(`
  select evtname, evtenabled
    from pg_event_trigger
   where evtname = 'lock_new_public_tables'
`)

await query(`create table if not exists _lock_probe_026 (id int)`)
const probe = await one(`
  select c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = '_lock_probe_026'
`)
const probeGrants = await many(`
  select grantee
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = '_lock_probe_026'
     and grantee in ('anon', 'authenticated')
`)
await query(`drop table if exists _lock_probe_026`)

const storageRls = await many(`
  select c.relname, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relkind = 'r'
   order by 1
`)

const url = (env.supabase.url || '').replace(/\/$/, '')
const anon = env.supabase.anonKey || ''
const rest = {}
if (url && anon) {
  const res = await fetch(`${url}/rest/v1/share_card_cache?select=*&limit=0`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      Accept: 'application/json',
    },
  })
  rest.share_card_cache = res.status
  const res2 = await fetch(`${url}/rest/v1/profiles?select=*&limit=0`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      Accept: 'application/json',
    },
  })
  rest.profiles = res2.status
}

let api = { videos: null, stats: null, share: null }
try {
  const v = await fetch('https://video-monetization-platform-production.up.railway.app/api/videos?limit=1')
  const body = await v.json()
  api.videos = { status: v.status, count: Array.isArray(body.videos) ? body.videos.length : null }
} catch (err) {
  api.videos = { error: err.message }
}
try {
  const s = await fetch('https://video-monetization-platform-production.up.railway.app/api/stats')
  api.stats = { status: s.status }
} catch (err) {
  api.stats = { error: err.message }
}

const lint0013 = rlsOff.length === 0 ? 'PASS — 0 tables with RLS disabled (Advisor ERROR 0013)' : `FAIL — ${rlsOff.map((t) => t.name).join(', ')}`
const grantsOk = anonGrants.length === 0 ? 'PASS — anon/authenticated have no table privileges in public' : 'FAIL — grants remain'
const restOk =
  rest.share_card_cache === 401 && rest.profiles === 401
    ? 'PASS — PostgREST denies anon (HTTP 401)'
    : `CHECK — share_card_cache=${rest.share_card_cache} profiles=${rest.profiles}`
const triggerOk = trigger?.evtname ? 'PASS — event trigger lock_new_public_tables is installed' : 'FAIL — trigger missing'
const probeOk =
  probe?.rls && probeGrants.length === 0
    ? 'PASS — new public table got RLS and no anon GRANT'
    : 'FAIL — event trigger did not lock a new table'

const generated = new Date().toISOString()

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>MTONYO+ Security Advisor equivalent — ${generated}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0f1115; color: #e8eaed; margin: 0; padding: 32px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .sub { color: #9aa0a6; margin-bottom: 28px; }
    .card { background: #1a1d24; border: 1px solid #2d3139; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; }
    .pass { color: #81c995; font-weight: 700; }
    .fail { color: #f28b82; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #2d3139; }
    th { color: #9aa0a6; font-weight: 600; }
    .ok { color: #81c995; }
    code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Supabase Security Advisor — equivalent checks (live database)</h1>
  <p class="sub">Lint 0013 <em>Table publicly accessible</em> / RLS disabled. Generated ${generated}. This is the same SQL the Advisor runs; it is not the dashboard UI.</p>
  <div class="card"><div class="${rlsOff.length ? 'fail' : 'pass'}">${lint0013}</div></div>
  <div class="card"><div class="${anonGrants.length ? 'fail' : 'pass'}">${grantsOk}</div></div>
  <div class="card"><div class="${rest.share_card_cache === 401 ? 'pass' : 'fail'}">${restOk}</div></div>
  <div class="card"><div class="${trigger?.evtname ? 'pass' : 'fail'}">${triggerOk}</div></div>
  <div class="card"><div class="${probe?.rls && !probeGrants.length ? 'pass' : 'fail'}">${probeOk}</div></div>
  <div class="card">
    <p>Express API still serves catalogue (owner connection, not PostgREST): videos HTTP ${api.videos?.status} count=${api.videos?.count}; stats HTTP ${api.stats?.status}</p>
  </div>
  <div class="card">
    <h2 style="font-size:16px;margin:0 0 12px">public tables</h2>
    <table>
      <tr><th>table</th><th>RLS</th></tr>
      ${tables.map((t) => `<tr><td><code>${t.name}</code></td><td class="ok">${t.rls ? 'enabled' : 'DISABLED'}</td></tr>`).join('')}
    </table>
  </div>
  <div class="card">
    <p style="color:#9aa0a6;margin:0">storage schema RLS (avatars/thumbnails buckets are intentionally public-read images, not SQL table dumps): ${storageRls.map((s) => s.relname + '=' + (s.rls ? 'on' : 'off')).join(', ') || 'n/a'}</p>
  </div>
</body>
</html>`

const htmlPath = path.join(OUT_DIR, 'security-advisor-equivalent.html')
fs.writeFileSync(htmlPath, html)
console.log(lint0013)
console.log(grantsOk)
console.log(restOk)
console.log(triggerOk)
console.log(probeOk)
console.log('api', JSON.stringify(api))
console.log('storage', storageRls)
console.log('wrote', htmlPath)

await closePool()
