import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'account.routes.js'), 'utf8')

/**
 * GET /api/account/analytics used to decide viewer-vs-creator purely on
 * `hasCreatorAccess` — capability, with no idea which dashboard the caller
 * currently has open — UNLESS the caller explicitly asked for `side=viewer`.
 * A dual-role account whose client forgot to send `side` at all (not just
 * one that asked for `side=viewer`) still got full creator analytics, which
 * is the gap PROMPT A2 found: default-deny needs the *absence* of a side to
 * mean viewer too, not only an explicit ask for the narrow one.
 *
 * `side=creator` is now the only value that widens the response. Anything
 * else — `side=viewer`, an unrecognised value, or no `side` at all — narrows
 * it. A pure viewer sending `side=creator` still gets nothing extra, since
 * `isCreator` is still what gates the creator half.
 */
test('analytics defaults to viewer-shaped when no side is given, even for a creator-capable caller', () => {
  const route = src.slice(src.indexOf("'/analytics'"), src.indexOf("'/analytics'") + 3000)
  assert.match(route, /const isCreator = await hasCreatorAccess\(req\.user\)/)
  assert.match(route, /const wantsViewerSide = req\.query\.side !== 'creator'/)
  /**
   * The viewer half moved inside this condition entirely (report2.txt
   * SEP14): it used to always be computed and returned, with `creator: null`
   * only bolted on for the narrow branch. Now the branch decides whether the
   * viewer queries run at all, so this is the guard, not a one-line return.
   */
  assert.match(route, /if \(!isCreator \|\| wantsViewerSide\) \{/)
  assert.match(route, /return res\.json\(\{ role: 'viewer', viewer, creator: null \}\)/)
})

/**
 * The creator branch used to return the full `viewer` object too — every
 * creator-side analytics load carried the same person's purchase history
 * alongside their creator performance. The client's Sep 14 review asked for
 * the opposite: each side shows only what belongs to it.
 */
test('the creator branch does not also hand back the viewer half', () => {
  const creatorBranchAt = src.indexOf("role: 'creator',")
  assert.notEqual(creatorBranchAt, -1)
  const block = src.slice(creatorBranchAt, creatorBranchAt + 60)
  assert.match(block, /role: 'creator',\s*\r?\n\s*viewer: null,/)
})

test('a viewer cannot use ?side=creator to see creator figures they are not entitled to', () => {
  // wantsViewerSide only ever ORs into the early-return condition, and it is
  // driven by `isCreator` first — there is no branch anywhere that grants
  // creator data purely because the query string asked for it.
  const route = src.slice(src.indexOf("'/analytics'"), src.indexOf("'/analytics'") + 2200)
  assert.match(route, /if \(!isCreator \|\| wantsViewerSide\)/, 'isCreator must still gate the creator half')
})
