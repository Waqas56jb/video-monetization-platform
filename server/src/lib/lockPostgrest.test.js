import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('025 enables RLS on share_card_cache and revokes PostgREST roles', () => {
  const sql = readFileSync(join(root, 'db/migrations/025_lock_postgrest.sql'), 'utf8')
  assert.match(sql, /alter table if exists share_card_cache enable row level security/)
  assert.match(sql, /revoke all on all tables in schema public from anon, authenticated, public/)
  assert.match(sql, /alter default privileges for role postgres in schema public/)
  assert.doesNotMatch(sql, /force row level security/i)
})

test('runtime share-card table create also enables RLS and revokes anon', () => {
  const src = readFileSync(join(root, 'lib/shareCardCache.js'), 'utf8')
  assert.match(src, /alter table share_card_cache enable row level security/)
  assert.match(src, /revoke all on table share_card_cache from anon, authenticated, public/)
})

test('026 installs an event trigger so new public tables stay locked', () => {
  const sql = readFileSync(join(root, 'db/migrations/026_lock_new_public_tables.sql'), 'utf8')
  assert.match(sql, /create event trigger lock_new_public_tables/)
  assert.match(sql, /alter table %s enable row level security/)
  assert.match(sql, /revoke all on table %s from anon, authenticated, public/)
})
