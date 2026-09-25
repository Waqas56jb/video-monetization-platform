import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('./043_system_text_out_of_bios.sql', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../../modules/admin.routes.js', import.meta.url), 'utf8')

test('043 clears only the exact system strings from creator bios', () => {
  assert.match(sql, /update creator_profiles\s+set bio = null\s+where bio in \(/)
  assert.match(sql, /'Creator account created before applications existed\.'/)
  assert.match(sql, /'No application on file — this creator account was granted access before MTONYO\+ had a review process\.'/)
  assert.doesNotMatch(sql, /like|ilike/i, 'exact matches only — never a creator\'s own words')
})

test('approving an application never turns system text into a bio', () => {
  assert.match(routes, /app\.bio \|\| \(SYSTEM_APPLICATION_TEXT\.includes\(app\.description\) \? null : app\.description\) \|\| null/)
  for (const s of ['Creator account created before applications existed.', 'No application on file — this creator account was granted access before MTONYO+ had a review process.']) {
    assert.ok(routes.includes(`'${s}'`), s)
  }
})
