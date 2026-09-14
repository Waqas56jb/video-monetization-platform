import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./AnalyticsTab.jsx', import.meta.url), 'utf8')

/**
 * A dual-role account viewing My Activity on the Watch side got full
 * creator analytics regardless — the server had no idea which side was
 * open, only whether the account was capable of selling at all. `side` is
 * how the client tells it; this pins that the request actually carries it
 * and re-fetches when the side changes rather than only on mount.
 */
test('analytics is requested with the current dashboard side, and re-fetched when it changes', () => {
  assert.match(src, /const \{ accountSide \} = useAuth\(\)/)
  assert.match(src, /api\.account\.analytics\(accountSide\)/)
  assert.match(src, /useApi\(\(\) => api\.account\.analytics\(accountSide\), \[accountSide\]\)/)
})

// Rendering itself already keys off `data.role`, the server's own answer —
// which is the point: once the server is told the side, the client needs
// no separate client-side re-gating here, unlike ProfileTab (whose fields
// render from data the account.GET route always returns regardless of side).
test('which half renders is still decided by the server-supplied role, not a second client guess', () => {
  assert.match(src, /const isCreator = data\.role === 'creator' \|\| data\.role === 'admin' \|\| data\.role === 'sub_admin'/)
})

/**
 * The viewer half ("In your library", "Total spent", "What you have
 * bought") used to render unconditionally — every account, every side, no
 * gate at all. A dual-role account's Creator Analytics carried its own
 * purchase history alongside creator performance, which is exactly the
 * "viewer information inside the Creator Analytics page" the client's
 * Sep 14 review named (report2.txt SEP14). The two halves must now be
 * mutually exclusive on `isCreator`, matching the server's `role`.
 */
test('the viewer half is gated on !isCreator, mirroring the creator half — not rendered unconditionally', () => {
  assert.match(src, /\{isCreator && \(/, 'the creator half must still be gated')
  assert.match(src, /\{!isCreator && \(/, 'the viewer half must be gated on the opposite of the same flag')

  const creatorBlock = src.slice(src.indexOf('{isCreator && ('), src.indexOf('{!isCreator && ('))
  const viewerBlock = src.slice(src.indexOf('{!isCreator && ('))
  assert.match(creatorBlock, /Total views/, 'creator stats stay in the creator-gated block')
  assert.match(viewerBlock, /In your library/, 'viewer stats moved into the viewer-gated block')
  assert.match(viewerBlock, /What you have bought/)
  assert.doesNotMatch(creatorBlock, /In your library|What you have bought/, 'no viewer wording left ungated in the creator block')
})
