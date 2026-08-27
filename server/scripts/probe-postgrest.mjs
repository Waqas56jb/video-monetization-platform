/**
 * Read-only PostgREST probe using the publishable anon key.
 * Prints HTTP statuses only — never keys, JWTs, or row bodies.
 */
import 'dotenv/config'
import { env } from '../src/config/env.js'

const url = (env.supabase.url || '').replace(/\/$/, '')
const anon = env.supabase.anonKey || ''

if (!url || !anon) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY missing')
  process.exit(1)
}

const tables = [
  'share_card_cache',
  'profiles',
  'creator_profiles',
  'creator_applications',
  'videos',
  'purchases',
  'payments',
  'earnings',
  'withdrawals',
  'platform_settings',
  'audit_log',
  'password_resets',
  'watch_progress',
  'notifications',
  'staff_permissions',
  '_migrations',
]

const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  Accept: 'application/json',
  Prefer: 'count=exact',
}

console.log('=== PostgREST (anon key, GET only, no row bodies) ===')
for (const table of tables) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    method: 'GET',
    headers,
  })
  const range = res.headers.get('content-range') || '-'
  const hint = res.headers.get('www-authenticate') || ''
  const denied =
    res.status === 401 ||
    res.status === 403 ||
    res.status === 425 ||
    /permission denied|PGRST/i.test(hint)
  const flag = res.status === 200 ? 'HTTP-200' : denied ? 'denied' : `HTTP-${res.status}`
  console.log(`${flag.padEnd(10)} ${String(res.status).padEnd(4)}  range=${range}  ${table}`)
}
