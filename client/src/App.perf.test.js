import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('App preloads Watch chunk and Stream SDK after first paint', () => {
  const src = readFileSync(join(dir, 'App.jsx'), 'utf8')
  assert.match(src, /idlePrefetchWatch/)
  assert.match(src, /ensureStreamSdk/)
  assert.match(src, /function BootPrefetch/)
})

test('index.html preloads the Cloudflare Stream SDK', () => {
  const html = readFileSync(join(dir, '../index.html'), 'utf8')
  assert.match(html, /rel="preload" as="script" href="https:\/\/embed\.cloudflarestream\.com\/embed\/sdk\.latest\.js"/)
  assert.match(html, /data-cf-stream-sdk="1"/)
})

test('production can enable timing logs with ?perf=1', () => {
  const src = readFileSync(join(dir, 'lib/perfLog.js'), 'utf8')
  assert.match(src, /q\.get\('perf'\) === '1'/)
  assert.match(src, /mtonyo\.perf\.enabled/)
})

test('the API origin has a warm connection before the bundle asks for data', () => {
  const html = readFileSync(join(dir, '../index.html'), 'utf8')
  const { DEPLOY } = { DEPLOY: { api: 'https://video-monetization-platform-production.up.railway.app' } }

  // It was the one host with no warm connection: DNS + TCP + TLS were all paid
  // after the bundle had parsed and asked for data.
  assert.match(html, new RegExp(`rel="preconnect" href="${DEPLOY.api}"`))
  assert.match(html, new RegExp(`rel="dns-prefetch" href="${DEPLOY.api}"`))

  // The hint is only worth anything if it names the host the app actually calls.
  const urls = readFileSync(join(dir, 'lib/deployUrls.js'), 'utf8')
  assert.match(urls, new RegExp(`api: '${DEPLOY.api}'`))

  // Video segments come from videodelivery.net, not the embed host.
  assert.match(html, /rel="preconnect" href="https:\/\/videodelivery\.net"/)

  /**
   * The origin that does the work must be the origin that is warmed.
   *
   * Preconnect is per-origin, so a hint on the apex `cloudflarestream.com` warms
   * nothing for `customer-<id>.cloudflarestream.com` — and traced on production
   * that subdomain serves the embed SDK (1033 ms including a 301), both of its
   * chunks, and every media segment. The apex hint had already been added once
   * to fix this exact class of miss; it landed one level too high.
   */
  assert.match(html, /rel="preconnect" href="https:\/\/customer-[a-z0-9]+\.cloudflarestream\.com"/)
  assert.match(html, /rel="dns-prefetch" href="https:\/\/customer-[a-z0-9]+\.cloudflarestream\.com"/)
})
