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
    assert.match(q, /\$1::boolean or not (p\.)?is_demo/, `${name} obeys the switch`)
    assert.match(q, /show_demo_content_in_stats/, `${name} is given the switch`)
  }
  // money has to reach the creator's profile to know whether it is demo money
  assert.match(money, /join profiles p on p\.id = e\.creator_id/)
})
