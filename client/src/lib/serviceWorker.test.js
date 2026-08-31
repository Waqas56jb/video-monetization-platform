/**
 * The service worker must not be able to pin a stale or wrong build.
 *
 * A service worker is the one part of the app that can outlive a deploy and keep
 * serving yesterday's code to a returning visitor — which reads as "the bug you
 * fixed is still there" and is unfalsifiable from the developer's own machine.
 * The four properties that prevent it are all in place; these assertions exist so
 * that stays true, because each of them is invisible until it is missing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sw = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8')
const main = readFileSync(fileURLToPath(new URL('../main.jsx', import.meta.url)), 'utf8')
const vite = readFileSync(fileURLToPath(new URL('../../vite.config.js', import.meta.url)), 'utf8')

test('cache names are versioned per build, end to end', () => {
  // vite stamps a fresh id -> main.jsx puts it in the registration URL ->
  // sw.js reads it back off its own script URL. Break any link and every
  // deploy reuses one cache name, which is how a months-old bundle survives.
  assert.match(vite, /__BUILD_ID__/)
  assert.match(main, /register\(`\/sw\.js\?v=\$\{__BUILD_ID__\}`\)/)
  assert.match(sw, /searchParams\.get\('v'\)/)
  assert.match(sw, /const SHELL_CACHE = `\$\{VERSION\}/)
  assert.match(sw, /const ASSET_CACHE = `\$\{VERSION\}/)
})

test('a new worker takes over immediately and clears the old caches', () => {
  assert.match(sw, /self\.skipWaiting\(\)/)
  assert.match(sw, /self\.clients\.claim\(\)/)
  assert.match(sw, /keys\.filter\(\(k\) => !k\.startsWith\(VERSION\)\)/)
})

test('the page reloads when a new worker takes control, and cannot loop', () => {
  assert.match(main, /controllerchange/)
  // Both guards matter: hadController stops a reload on first install, and
  // `reloading` stops a loop if the event fires twice.
  assert.match(main, /const hadController = !!navigator\.serviceWorker\.controller/)
  assert.match(main, /if \(!hadController \|\| reloading\) return/)
})

test('navigations are network-first and are not all filed under "/"', () => {
  // Every successful navigation used to be written to the key '/', so opening a
  // video replaced the offline home page with that video's server-rendered
  // document.
  assert.doesNotMatch(sw, /c\.put\('\/', copy\)/, "navigations must not be cached under '/'")
  assert.match(sw, /caches\.open\(SHELL_CACHE\)\.then\(\(c\) => c\.put\(request, copy\)\)/)
  // '/' still comes from the install precache, so the offline fallback survives.
  assert.match(sw, /const SHELL = \[\s*'\/'/)
  assert.match(sw, /\.then\(\(exact\) => exact \|\| caches\.match\('\/'\)\)/)
})

test('only successful responses are ever cached', () => {
  // The /assets/ branch is cache-first and never revalidates, so a 404 or 502
  // body stored there is served as JS for the life of the build version.
  const guards = sw.match(/if \(res && res\.ok\)/g) || []
  assert.ok(
    guards.length >= 2,
    `both the navigate and asset branches must check res.ok, found ${guards.length}`
  )
})
