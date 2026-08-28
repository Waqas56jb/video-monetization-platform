import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const root = join(dir, '..')

test('follow routes exist and write the follows table', () => {
  const routes = readFileSync(join(dir, 'creators.routes.js'), 'utf8')
  assert.match(routes, /post\(\s*'\/:id\/follow'/)
  assert.match(routes, /delete\(\s*'\/:id\/follow'/)
  assert.match(routes, /requireAuth/)
  assert.match(routes, /followCreator/)
  assert.match(routes, /unfollowCreator/)

  const lib = readFileSync(join(root, 'lib/follows.js'), 'utf8')
  assert.match(lib, /insert into follows/)
  assert.match(lib, /delete from follows/)
  assert.match(lib, /You cannot follow your own page/)
  assert.match(lib, /creator_profiles[\s\S]*followers/)

  const index = readFileSync(join(root, 'routes/index.js'), 'utf8')
  assert.match(index, /\/creators/)
})

test('029 creates follows and locks PostgREST out', () => {
  const sql = readFileSync(join(root, 'db/migrations/029_follows.sql'), 'utf8')
  assert.match(sql, /create table if not exists follows/)
  assert.match(sql, /primary key \(follower_id, creator_id\)/)
  assert.match(sql, /alter table follows enable row level security/)
  assert.match(sql, /revoke all on table follows from anon, authenticated, public/)
})
