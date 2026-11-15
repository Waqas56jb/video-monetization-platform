import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./stats.routes.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const handler = src.slice(src.indexOf("router.get(\n  '/',"), src.indexOf('res.json('))

test('with demo content off, public people and money totals leave demo accounts out', () => {
  const queries = handler.split('one(').slice(1)
  const people = queries.find((q) => /as creators/.test(q))
  const money = queries.find((q) => /as to_creators/.test(q))
  const earning = queries.find((q) => /count\(distinct e\.creator_id\)/.test(q))
  for (const [name, q] of Object.entries({ people, money, earning })) {
    assert.ok(q, `${name} query present`)
    assert.match(q, /\$1::boolean or \(?not (p\.)?is_demo/, `${name} obeys the switch`)
    assert.match(q, /show_demo_content_in_stats/, `${name} is given the switch`)
  }
  // money has to reach the creator's profile to know whether it is demo money
  assert.match(money, /join profiles p on p\.id = e\.creator_id/)
})

test('public money and "Creators Are Getting Paid" count only real money (client, 2026-11-15)', () => {
  const real = src.slice(src.indexOf('export const REAL_EARNING_SQL'), src.indexOf('router.get('))
  assert.match(real, /pay\.provider <> 'sandbox'/, 'a sandbox TEST payment is never real earnings')
  assert.match(real, /e\.source = 'sale' and exists/, 'a sale needs a payment behind it')
  assert.match(real, /notes like 'Demo campaign\.%'/, 'the seeded demo advert campaign is not real earnings')
  const demoCli = readFileSync(new URL('../cli/demo.js', import.meta.url), 'utf8')
  assert.match(demoCli, /'Demo campaign\. Remove with npm run demo:clear\.'/, 'the marker the filter relies on is what the seeder writes')

  const queries = handler.split('one(').slice(1)
  for (const q of [queries.find((x) => /as to_creators/.test(x)), queries.find((x) => /count\(distinct e\.creator_id\)/.test(x))]) {
    assert.match(q, /\$1::boolean or \(not p\.is_demo and \$\{REAL_EARNING_SQL\}\)/)
  }
  const top = src.slice(src.indexOf("'/top-creators'"))
  assert.match(top, /left join earnings e on e\.creator_id = p\.id\s+and \(\$1::boolean or \$\{REAL_EARNING_SQL\}\)/)
  assert.match(top, /p\.role = 'creator'/, 'a revoked creator is not spotlighted')
  assert.match(top, /illustrative: Boolean\(settings\.show_demo_content_in_stats\)/)
})
