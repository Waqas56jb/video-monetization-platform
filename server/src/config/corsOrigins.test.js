import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * CORS_ORIGINS must mean what it says.
 *
 * A viewer reported `OPTIONS /api/auth/login → 403`, which blocks signing in
 * outright. The two deployed apps were fine; the origin refused was one that had
 * been configured and then quietly discarded — while the 403 body read "Add it to
 * CORS_ORIGINS on the server and redeploy". Following that instruction changed
 * nothing, because localhost entries were filtered out on the way in.
 *
 * Each case re-imports env.js under a fresh query string, since the list is
 * computed once at module load.
 */
async function allowed(value) {
  const saved = process.env.CORS_ORIGINS
  if (value === undefined) delete process.env.CORS_ORIGINS
  else process.env.CORS_ORIGINS = value
  try {
    const { env } = await import(`./env.js?cors=${allowed.n++}`)
    return env.corsOrigins
  } finally {
    if (saved === undefined) delete process.env.CORS_ORIGINS
    else process.env.CORS_ORIGINS = saved
  }
}
allowed.n = 0

const PUBLIC_APP = 'https://video-monetization-platform-chi.vercel.app'
const ADMIN_APP = 'https://video-monetization-platform-admin.vercel.app'

test('the two live apps are always allowed, whatever is configured', async () => {
  // The guarantee that matters most: a mistake in this variable can never lock
  // the real site out of its own API.
  for (const value of [undefined, '', 'https://example.com']) {
    const list = await allowed(value)
    assert.ok(list.includes(PUBLIC_APP), `public app missing for ${JSON.stringify(value)}`)
    assert.ok(list.includes(ADMIN_APP), `admin app missing for ${JSON.stringify(value)}`)
  }
})

test('a configured localhost origin is honoured, not silently dropped', async () => {
  // This is the reported failure. It used to be filtered out.
  const list = await allowed('http://localhost:5173')
  assert.ok(list.includes('http://localhost:5173'))
  assert.ok(list.includes(PUBLIC_APP), 'and the live apps still work')
})

test('every configured origin survives, including several at once', async () => {
  const list = await allowed('http://localhost:5173, http://127.0.0.1:5174 ,https://staging.example.com')
  assert.ok(list.includes('http://localhost:5173'))
  assert.ok(list.includes('http://127.0.0.1:5174'))
  assert.ok(list.includes('https://staging.example.com'))
})

test('nothing is allowed by default that was not allowed before', async () => {
  // Opting in is the operator's decision; the default must not widen.
  const list = await allowed(undefined)
  assert.deepEqual(list, [PUBLIC_APP, ADMIN_APP])
})

test('the list does not repeat an origin that is also a live app', async () => {
  const list = await allowed(PUBLIC_APP)
  assert.equal(list.filter((o) => o === PUBLIC_APP).length, 1)
})
