import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./CreatorCapitalTab.jsx', import.meta.url), 'utf8')

test('every status the server can return has a rendered state, and the default is Building Eligibility', () => {
  for (const status of ['building', 'under_review', 'approved', 'active', 'repaid', 'declined', 'paused']) {
    assert.match(src, new RegExp(`status === '${status}'`), `no rendered state for "${status}"`)
  }
  assert.match(src, /const status = capital\?\.status \|\| 'building'/)
  assert.match(src, /Building Eligibility/)
})

test('Request Review is disabled below the required months, not just hidden', () => {
  const buildingBlock = src.slice(src.indexOf("status === 'building'"), src.indexOf("status === 'under_review'"))
  assert.match(buildingBlock, /disabled=\{busy \|\| monthsWithEarnings < monthsRequired\}/)
})

test('the AirPay disclaimer is always rendered, not tucked inside one state', () => {
  // Outside every per-status conditional block, so it renders regardless of
  // which state the capital record is in.
  const disclaimerAt = src.indexOf('capital-disclaimer')
  const lastStatusBlockAt = src.lastIndexOf("status === ")
  assert.ok(disclaimerAt > lastStatusBlockAt, 'the disclaimer must render outside/after every state branch')
  assert.match(src, /MTONYO\+ is not the lender — AirPay decides eligibility and approval\./)
})
