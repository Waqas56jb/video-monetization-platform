import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'account.routes.js'), 'utf8').replace(/\r\n/g, '\n')

/**
 * GET/PATCH /api/account used to hand back the full `creator_profiles` row
 * (payout phone/method, revenue split, category, socials, followers, bio)
 * regardless of which dashboard side was open — a dual-role account's Watch
 * side got the same payload as its Create side. Both routes now reduce
 * through `creatorForSide`, imported from the shared shaper so this route
 * and auth.routes.js's `/login` and `/me` cannot quietly drift apart.
 */
test('account.routes.js imports the shared side-reducer, not a local reimplementation', () => {
  assert.match(src, /import \{ creatorForSide, sideFromQuery \} from '\.\.\/lib\/creatorSideShape\.js'/)
})

function routeBody(marker) {
  const start = src.indexOf(marker)
  assert.notEqual(start, -1, `could not find ${marker} in account.routes.js`)
  const next = src.indexOf('\nrouter.', start + marker.length)
  return src.slice(start, next === -1 ? undefined : next)
}

test('GET / reduces through creatorForSide before responding', () => {
  const route = routeBody("router.get(\n  '/',")
  assert.match(route, /creator: creatorForSide\(shaped\.creator, sideFromQuery\(req\)\)/)
})

test('PATCH / also reduces through creatorForSide, not the raw shape() output', () => {
  const route = routeBody("router.patch(\n  '/',")
  assert.match(route, /creator: creatorForSide\(shaped\.creator, sideFromQuery\(req\)\)/)
  assert.doesNotMatch(
    route,
    /res\.json\(shape\(profile, creator\)\)/,
    'the response must go through creatorForSide, not the bare shape() object'
  )
})
