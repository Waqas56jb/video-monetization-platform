/**
 * "/library" must open the library, never fall through to the homepage.
 *
 * Found in the 2026-11-18 live regression: there was no /library route, so the
 * catch-all sent it home — including the AirPay return for an unknown order.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

test('/library is an alias for the dashboard library tab', () => {
  const app = readFileSync(fileURLToPath(new URL('./App.jsx', import.meta.url)), 'utf8')
  assert.match(app, /<Route path="\/library" element=\{<Navigate to="\/dashboard\?tab=library" replace \/>\} \/>/)
  assert.ok(app.indexOf('path="/library"') < app.indexOf('path="*"'), 'declared before the catch-all')
})

test('the payment return never sends anyone to a page that does not exist', () => {
  const routes = readFileSync(fileURLToPath(new URL('../../server/src/modules/payments/payments.routes.js', import.meta.url)), 'utf8')
  assert.doesNotMatch(routes, /\$\{home\}\/library`/)
  assert.match(routes, /\$\{home\}\/dashboard\?tab=library`/)
})
