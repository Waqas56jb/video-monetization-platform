/**
 * `/api/admin/creators` counts the same set of accounts `/api/admin/overview`
 * does -- both "a creator" by `profiles.role = 'creator'`, not merely "has a
 * row in creator_profiles".
 *
 * Traced live for the client's "31 on some Super Admin pages, 32 on Creator
 * Management" report (report2.txt SEP14): the one row present in the join
 * but absent from the role-filtered count was an internal test account
 * (`waqas56jb@gmail.com`) promoted to `sub_admin` and suspended, whose
 * leftover `creator_profiles` row this route was still listing as an active
 * creator to manage.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'admin.routes.js'), 'utf8')

test("GET /admin/creators filters on role = 'creator', matching /overview's definition", () => {
  const start = src.indexOf("'/creators',")
  assert.notEqual(start, -1, 'the /creators route exists')
  const block = src.slice(start, src.indexOf("router.post(\n  '/creators/:id/verify'", start))
  assert.match(
    block,
    /from profiles p join creator_profiles cp on cp\.user_id = p\.id\s+where p\.role = 'creator'/,
    "the join must be narrowed to role = 'creator', not left as every creator_profiles row"
  )
})

test("/overview's own creator count uses the same definition", () => {
  assert.match(src, /count\(\*\) filter \(where role = 'creator'\)::int as creators/)
})
