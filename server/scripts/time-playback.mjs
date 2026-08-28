/**
 * Time GET /api/playback/:id/playback against a running local API.
 * Usage: node scripts/time-playback.mjs [baseUrl]
 */
const base = (process.argv[2] || 'http://127.0.0.1:4001').replace(/\/$/, '')

const CASES = [
  { name: 'unpaid preview (paid_premiere, anon)', slug: 'rpreplay-final1589783013-2', auth: false },
  { name: 'anon free+ads', slug: 'how-to-cook-pilau-properly', auth: false },
  { name: 'paid full (demo.viewer)', slug: 'whatsapp-video-2026-08-15-at-11-50-34-pm', auth: true },
]

async function playback(slug, token) {
  const t0 = Date.now()
  const headers = { accept: 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${base}/api/playback/${slug}/playback`, { headers })
  const ms = Date.now() - t0
  const json = await res.json().catch(() => ({}))
  return {
    ms,
    status: res.status,
    kind: json.playback?.kind ?? (json.previewPending ? 'pending' : json.playback === null ? 'null' : 'other'),
    owned: json.access?.owned,
    canWatchFull: json.access?.canWatchFull,
    requiresPayment: json.access?.requiresPayment,
    error: json.error?.message,
  }
}

async function login() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'demo.viewer@mtonyo.demo',
      password: 'DemoPass123!',
      side: 'viewer',
    }),
  })
  const json = await res.json()
  const token = json.session?.accessToken
  if (!token) throw new Error(`login failed ${res.status} ${JSON.stringify(json).slice(0, 300)}`)
  return token
}

async function once(label, fn) {
  const result = await fn()
  console.log(`${label.padEnd(42)} ${String(result.ms).padStart(5)}ms  status=${result.status} kind=${result.kind} full=${result.canWatchFull} owned=${result.owned}${result.error ? ` err=${result.error}` : ''}`)
  return result
}

const token = await login().catch((err) => {
  console.warn('login skipped:', err.message)
  return null
})

console.log(`\nplayback timings against ${base}\n`)

for (const c of CASES) {
  if (c.auth && !token) {
    console.log(`${c.name}: skipped (no token)`)
    continue
  }
  const run = () => playback(c.slug, c.auth ? token : null)
  await once(`${c.name}  cold`, run)
  await once(`${c.name}  warm`, run)
  await once(`${c.name}  warm2`, run)
}

console.log('')
