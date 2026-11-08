import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Found 2026-11-08 while recording the admin training video: Users → Block,
 * Restore access and creator Suspend / Restore all failed in production with
 * "Only an admin can change an account status (actor: unknown)". They ran a
 * bare `update profiles set status` — the database guard only accepts a status
 * change inside a transaction that names an admin actor.
 */
const files = ['admin.routes.js', 'staff.routes.js'].map((f) => [f, readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')])

test('no route changes an account status outside an admin transaction', () => {
  for (const [f, src] of files) {
    const bare = [...src.matchAll(/await (one|query|many)\(\s*[`'"]update profiles set status/g)]
    assert.equal(bare.length, 0, `${f}: status changed with a bare ${bare[0]?.[1]}()`)
  }
})

test('block / restore and creator suspend / restore go through setStatusAsAdmin', () => {
  const src = files[0][1]
  const helper = src.slice(src.indexOf('async function setStatusAsAdmin'), src.indexOf("'/users/:id/status'"))
  assert.match(helper, /actorRole: 'admin', actorId: req\.user\.id/)
  for (const route of ["'/users/:id/status'", "'/creators/:id/suspend'", "'/creators/:id/restore'"]) {
    const body = src.slice(src.indexOf(route), src.indexOf('router.', src.indexOf(route) + 10))
    assert.match(body, /setStatusAsAdmin\(req,/, `${route} must use setStatusAsAdmin`)
  }
})
