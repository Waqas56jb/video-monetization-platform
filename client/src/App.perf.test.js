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
