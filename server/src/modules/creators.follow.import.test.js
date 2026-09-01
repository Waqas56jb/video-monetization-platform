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

  const index = readFileSync(join(root, 'routes/index.js'), 'utf8')
  assert.match(index, /\/creators/)
})

test("a blocked creator's followers can still get out", () => {
  const lib = readFileSync(join(root, 'lib/follows.js'), 'utf8')
  const unfollow = lib.slice(lib.indexOf('export async function unfollowCreator'))

  /**
   * `requireCreator` filters `status <> 'blocked'`, so routing unfollow through
   * it meant that the moment an administrator blocked a creator, every follower
   * got a 404 and stayed counted for ever with a Following button that would not
   * turn off. Blocking is exactly when a viewer wants out.
   */
  assert.doesNotMatch(unfollow, /requireCreator/)
  assert.match(unfollow, /delete from follows where follower_id = \$1 and creator_id = \$2/)

  // Following still checks the creator is real and not blocked.
  const follow = lib.slice(lib.indexOf('export async function followCreator'), lib.indexOf('export async function unfollowCreator'))
  assert.match(follow, /requireCreator/)
})

test('nothing in application code writes the followers count any more', () => {
  const lib = readFileSync(join(root, 'lib/follows.js'), 'utf8')

  /**
   * 006 moved videos.views and paid_unlocks onto triggers because a counter
   * anything may write is a counter that drifts — the client caught 3.2K views
   * against 67 rows. `followers` was left behind and 031 finishes the job.
   */
  assert.doesNotMatch(lib, /update creator_profiles/)

  const sql = readFileSync(join(root, 'db/migrations/031_follows_counter_trigger.sql'), 'utf8')
  assert.match(sql, /create trigger follows_sync_counter/)
  assert.match(sql, /after insert or update or delete on follows/)
  assert.match(sql, /select count\(\*\)::int from follows/)
  // A cascaded delete of a viewer has to correct every creator they followed.
  assert.match(sql, /array_remove\(array\[old\.creator_id, new\.creator_id\], null\)/)
})

test('one request answers "who do I follow" for a whole page of cards', () => {
  const lib = readFileSync(join(root, 'lib/follows.js'), 'utf8')
  assert.match(lib, /export async function followingIds/)
  const routes = readFileSync(join(dir, 'creators.routes.js'), 'utf8')
  assert.match(routes, /get\(\s*'\/following'/)
  assert.match(routes, /creatorIds/)
})

test('029 creates follows and locks PostgREST out', () => {
  const sql = readFileSync(join(root, 'db/migrations/029_follows.sql'), 'utf8')
  assert.match(sql, /create table if not exists follows/)
  assert.match(sql, /primary key \(follower_id, creator_id\)/)
  assert.match(sql, /alter table follows enable row level security/)
  assert.match(sql, /revoke all on table follows from anon, authenticated, public/)
})
