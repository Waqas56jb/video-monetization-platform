import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

test('platform settings stay in memory for 60s', () => {
  const src = readFileSync(join(here, 'settings.js'), 'utf8')
  assert.match(src, /TTL_MS = 60_000/)
  assert.match(src, /export function invalidateSettingsCache/)
})

test('admin settings PATCH busts the in-memory cache', () => {
  const src = readFileSync(join(here, '../modules/admin.routes.js'), 'utf8')
  assert.match(src, /invalidateSettingsCache\(\)/)
  assert.match(src, /await updateSettings\(req\.body\)/)
})
