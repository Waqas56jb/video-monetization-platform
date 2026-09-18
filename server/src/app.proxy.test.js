import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * The rate limiter must see the CALLER, not Railway's edge.
 *
 * 2026-09-18: production's /health said `hops: 2, trustProxyHops: 1` and
 * `ip` was a Datapacket edge address — so every visitor shared one
 * 120-per-minute bucket and the client saw "Too many requests" on videos,
 * Trending and the payment sheet while nothing else on their connection was
 * slow. This boots the app and sends the exact two-hop chain the host
 * produces, and asserts on the address Express resolves — not on the source.
 */
let n = 0
async function healthWith(env, xff) {
  const saved = { TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS }
  if (env.TRUST_PROXY_HOPS === undefined) delete process.env.TRUST_PROXY_HOPS
  else process.env.TRUST_PROXY_HOPS = env.TRUST_PROXY_HOPS
  const { default: app } = await import(`./app.js?proxy=${n++}`)
  const server = app.listen(0)
  try {
    await new Promise((resolve) => server.once('listening', resolve))
    const res = await fetch(`http://127.0.0.1:${server.address().port}/health`, {
      headers: { 'X-Forwarded-For': xff },
    })
    return (await res.json()).proxy
  } finally {
    await new Promise((resolve) => server.close(resolve))
    if (saved.TRUST_PROXY_HOPS === undefined) delete process.env.TRUST_PROXY_HOPS
    else process.env.TRUST_PROXY_HOPS = saved.TRUST_PROXY_HOPS
  }
}

const CHAIN = '203.0.113.9, 152.233.15.121' // caller, then Railway's edge

test("default: Railway's two-hop chain resolves to the caller, and /health says the setting is right", async () => {
  const proxy = await healthWith({}, CHAIN)
  assert.equal(proxy.ip, '203.0.113.9')
  assert.equal(proxy.hops, 2)
  assert.equal(proxy.trustProxyHops, 2)
  assert.equal(proxy.ok, true)
})

test('trusting too few hops resolves to the edge — the shared-bucket failure — and /health says so', async () => {
  const proxy = await healthWith({ TRUST_PROXY_HOPS: '1' }, CHAIN)
  assert.equal(proxy.ip, '152.233.15.121', 'this is what production was doing')
  assert.equal(proxy.ok, false)
})

test('the environment variable still wins over the default', async () => {
  const proxy = await healthWith({ TRUST_PROXY_HOPS: '3' }, '198.51.100.7, 203.0.113.9, 152.233.15.121')
  assert.equal(proxy.trustProxyHops, 3)
  assert.equal(proxy.ip, '198.51.100.7')
  assert.equal(proxy.ok, true)
})
