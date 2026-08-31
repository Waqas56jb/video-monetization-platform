import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The API needs Node 22 or newer, and the reason is not a preference.
 *
 * `@supabase/supabase-js` requires a global `WebSocket`, which Node exposes
 * from 22. On anything older `createClient` throws before it does any work —
 * "Node.js detected but native WebSocket not found" — which took down sign-in
 * on the live site: every route that authenticates returned 500, while the
 * database, health and video listings were untouched, because the Supabase
 * client is only built on the first auth call.
 *
 * It said `>=20` while the serverless host happened to run something newer, so
 * the floor was never tested. Railway reads this field and honours it exactly,
 * which is how a permissive range became an outage.
 */
test('the API declares Node 22 or newer', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const range = pkg.engines?.node || ''
  const floor = Number(range.replace(/[^\d.]/g, '').split('.')[0])
  assert.ok(floor >= 22, `engines.node is "${range}" — supabase-js needs a global WebSocket, Node 22+`)
})

test('the host is pinned by .nvmrc as well as engines', () => {
  // Two mechanisms because build images read different ones, and the cost of
  // the disagreement is the whole authentication system.
  const nvmrc = readFileSync(join(root, '.nvmrc'), 'utf8').trim()
  assert.ok(Number(nvmrc.replace(/^v/, '').split('.')[0]) >= 22, `.nvmrc says ${nvmrc}`)
})

test('the process actually running the tests satisfies it', () => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 22, `running Node ${process.versions.node}`)
  assert.equal(typeof WebSocket, 'function', 'global WebSocket must exist — supabase-js requires it')
})
