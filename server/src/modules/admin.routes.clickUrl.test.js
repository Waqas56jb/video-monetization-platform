import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'admin.routes.js'), 'utf8').replace(/\r\n/g, '\n')

/**
 * click_url needs three distinguishable states on PATCH — untouched (field
 * omitted), cleared (empty string), and set (a URL) — which a plain
 * coalesce() cannot express (null-from-omission and null-from-"clear it"
 * would be indistinguishable). Mirrors the same undefined-vs-'' convention
 * account.routes.js's own clearable() already uses for bio/location/etc.
 */
test('the campaign schema accepts an empty string for clickUrl, not only a URL', () => {
  const schema = src.slice(src.indexOf('const campaignSchema'), src.indexOf('const checkWindow'))
  assert.match(schema, /clickUrl: z\.union\(\[z\.literal\(''\), z\.string\(\)/)
})

test('PATCH click_url has three states: omitted keeps it, empty clears it, anything else sets it', () => {
  const route = src.slice(src.indexOf("router.patch(\n  '/ads/:id'"), src.indexOf("router.get(\n  '/ads/:id/videos'"))
  assert.match(
    route,
    /click_url\s*= case when \$13::text is null then click_url when \$13 = '' then null else \$13 end/
  )
  assert.match(route, /b\.clickUrl === undefined \? null : b\.clickUrl/)
})

test('the per-video report route exists and is scoped to one campaign', () => {
  assert.match(src, /router\.get\(\s*\n\s*'\/ads\/:id\/videos'/)
  assert.match(src, /campaignPerformanceByVideo\(campaign\.id\)/)
})
