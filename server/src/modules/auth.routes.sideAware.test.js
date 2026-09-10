import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'auth.routes.js'), 'utf8').replace(/\r\n/g, '\n')

/**
 * POST /login and GET /me used to hand back the full creator row (payout
 * phone/method, revenue split, bio, location, followers) regardless of
 * which side was being logged into or which app/page called `/me` — a
 * dual-role account's Watch-side login, and every page load afterward via
 * `AuthContext.reload()`, carried the Create side's private fields the
 * whole time. Both now reduce through the shared `creatorForSide`.
 */
test('auth.routes.js imports the shared side-reducer, not a local reimplementation', () => {
  assert.match(src, /import \{ creatorForSide, sideFromQuery \} from '\.\.\/lib\/creatorSideShape\.js'/)
})

function routeBody(marker) {
  const start = src.indexOf(marker)
  assert.notEqual(start, -1, `could not find ${marker} in auth.routes.js`)
  const next = src.indexOf('\nrouter.', start + marker.length)
  return src.slice(start, next === -1 ? undefined : next)
}

test('POST /login reduces through creatorForSide, keyed on the side just logged into', () => {
  const route = routeBody("router.post(\n  '/login',")
  assert.match(route, /creator: creatorForSide\(creatorFull, side\)/)
})

test('GET /me reduces through creatorForSide, defaulting to viewer via sideFromQuery', () => {
  const route = routeBody("router.get(\n  '/me',")
  assert.match(route, /creator: creatorForSide\(creatorFull, sideFromQuery\(req\)\)/)
})
