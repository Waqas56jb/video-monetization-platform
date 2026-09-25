import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isChunkLoadError, withChunkReload } from './chunkReload.js'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('the failures a stale build produces are recognised as chunk-load errors', () => {
  for (const m of [
    'Failed to fetch dynamically imported module: https://x/assets/Watch-abc.js',
    'Importing a module script failed.',
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\"",
    'error loading dynamically imported module',
  ]) assert.equal(isChunkLoadError(new Error(m)), true, m)
  assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false)
})

test('an ordinary error from a loader is still thrown, not swallowed by a reload', async () => {
  const boom = new Error('Cannot read properties of undefined')
  await assert.rejects(withChunkReload(() => Promise.reject(boom))(), boom)
})

test('every lazy chunk goes through the reload guard, and a missing asset is a real 404', () => {
  assert.match(read('./prefetchWatch.js'), /export const loadWatchPage = withChunkReload\(/)
  assert.match(read('./prefetchWatch.js'), /export const loadLandingPage = withChunkReload\(/)
  assert.match(read('../pages/Landing.jsx'), /lazy\(withChunkReload\(\(\) => import\('@\/components\/landing\/CreatorCapital'\)\)\)/)
  assert.match(read('../main.jsx'), /addEventListener\('vite:preloadError'/)
  const vercel = JSON.parse(read('../../vercel.json'))
  const catchAll = vercel.rewrites.find((r) => r.destination === '/index.html')
  assert.equal(catchAll.source, '/((?!assets/).*)', 'the SPA fallback must not answer for /assets/*')
  assert.ok(read('../../public/sw.js').includes('!/text\\/html/i.test('), 'the worker never caches HTML as an asset')
})

test('a fresh load that misses its own entry script or stylesheet reloads once too', () => {
  const html = read('../../index.html')
  const head = html.slice(0, html.indexOf('</script>'))
  assert.match(head, /window\.addEventListener\('error', function \(e\) \{/)
  assert.match(head, /t\.tagName !== 'SCRIPT' && t\.tagName !== 'LINK'/)
  assert.match(head, /indexOf\('\/assets\/'\) < 0/)
  assert.match(head, /'mtonyo\.chunkReloadAt'/, 'shares the guard with chunkReload.js — never two reloads')
  assert.match(head, /Date\.now\(\) - last < 30000\) return/)
  assert.match(head, /\}, true\)/, 'capture phase — resource errors do not bubble')
})
