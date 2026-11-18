/**
 * An open tab must not keep running a build that has been replaced.
 *
 * Client, 2026-11-18: still saw "Enter your email and password" with both
 * boxes filled two days after the fix was live — the tab predated the deploy.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createStaleBuildWatch, isStale, SAFE_TO_RELOAD } from './staleBuild.js'

const json = (body) => async () => ({ ok: true, json: async () => body })

test('a different published id means this tab is stale; missing ids never do', () => {
  assert.equal(isStale('b', 'a'), true)
  assert.equal(isStale('a', 'a'), false)
  assert.equal(isStale(undefined, 'a'), false)
  assert.equal(isStale('b', undefined), false)
})

test('sign-in pages and the homepage reload at once; a video page waits for the next navigation', async () => {
  for (const p of ['/', '/login', '/signup', '/forgot-password', '/reset']) assert.match(p, SAFE_TO_RELOAD)
  for (const p of ['/watch/abc', '/dashboard', '/explore', '/upload']) assert.doesNotMatch(p, SAFE_TO_RELOAD)

  let reloads = 0
  let path = '/watch/abc'
  const w = createStaleBuildWatch({ ownId: 'old', fetchImpl: json({ id: 'new' }), reload: () => reloads++, path: () => path })
  await w.onReturn()
  assert.equal(reloads, 0, 'never reload under someone watching')
  assert.equal(w.isStale(), true)
  assert.equal(w.onNavigate(), true, 'the next page they open loads the new build')
  assert.equal(reloads, 1)

  path = '/login'
  const w2 = createStaleBuildWatch({ ownId: 'old', fetchImpl: json({ id: 'new' }), reload: () => reloads++, path: () => path })
  await w2.onReturn()
  assert.equal(reloads, 2, 'login page reloads into the fixed build straight away')
})

test('same build, a failed fetch, or a non-200 never reloads', async () => {
  let reloads = 0
  const opts = { ownId: 'x', reload: () => reloads++, path: () => '/login' }
  await createStaleBuildWatch({ ...opts, fetchImpl: json({ id: 'x' }) }).onReturn()
  await createStaleBuildWatch({ ...opts, fetchImpl: async () => { throw new Error('offline') } }).onReturn()
  await createStaleBuildWatch({ ...opts, fetchImpl: async () => ({ ok: false }) }).onReturn()
  assert.equal(reloads, 0)
})

test('checks are throttled, and the reload goes through the once-per-30s guard', async () => {
  let calls = 0
  let t = 0
  const w = createStaleBuildWatch({ ownId: 'x', now: () => t, fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ id: 'x' }) } } })
  await w.check()
  await w.check()
  assert.equal(calls, 1)
  t += 61_000
  await w.check()
  assert.equal(calls, 2)

  const src = readFileSync(fileURLToPath(new URL('./staleBuild.js', import.meta.url)), 'utf8')
  assert.match(src, /reloadOnceForNewBuild\(\)/, 'no reload loop if a CDN serves an old page beside a new build.json')
})

test('the build publishes build.json with the same id the bundle carries, and the app starts the watch', () => {
  const vite = readFileSync(fileURLToPath(new URL('../../vite.config.js', import.meta.url)), 'utf8')
  assert.match(vite, /fileName: 'build\.json', source: JSON\.stringify\(\{ id: BUILD_ID \}\)/)
  assert.match(vite, /__BUILD_ID__: JSON\.stringify\(BUILD_ID\)/)
  const main = readFileSync(fileURLToPath(new URL('../main.jsx', import.meta.url)), 'utf8')
  assert.match(main, /startStaleBuildWatch\(__BUILD_ID__\)/)
  const nav = readFileSync(fileURLToPath(new URL('../components/layout/ScrollToTop.jsx', import.meta.url)), 'utf8')
  assert.match(nav, /staleBuildWatch\(\)\?\.onNavigate\(\)/)
})
