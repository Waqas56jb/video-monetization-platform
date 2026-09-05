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
 * currently has open. A dual-role account looking at its Watch side got
 * full creator analytics (views, unlocks, conversion, revenue) anyway,
 * which is the leak the client's report was about.
 *
 * `side=viewer` is how the client says which one is actually open. It can
 * only ever narrow the response: a viewer with no creator capability was
 * already getting the viewer shape regardless, and this must not change
 * that for anyone who never asks for `side=viewer` at all — every existing
 * caller (nothing sent `?side=`) keeps today's capability-only behaviour.
 */
test('analytics honours an explicit ?side=viewer even when the caller is creator-capable', () => {
  const route = src.slice(src.indexOf("'/analytics'"), src.indexOf("'/analytics'") + 2200)
  assert.match(route, /const isCreator = await hasCreatorAccess\(req\.user\)/)
  assert.match(route, /const wantsViewerSide = req\.query\.side === 'viewer'/)
  assert.match(
    route,
    /if \(!isCreator \|\| wantsViewerSide\) return res\.json\(\{ role: 'viewer', viewer, creator: null \}\)/
  )
})

test('a viewer cannot use ?side= to see creator figures they are not entitled to', () => {
  // wantsViewerSide only ever ORs into the early-return condition — there is
  // no branch anywhere that widens access based on the query string.
  const route = src.slice(src.indexOf("'/analytics'"), src.indexOf("'/analytics'") + 2200)
  assert.doesNotMatch(route, /side === 'creator'/, 'no path may grant creator data because the query string asked for it')
})
