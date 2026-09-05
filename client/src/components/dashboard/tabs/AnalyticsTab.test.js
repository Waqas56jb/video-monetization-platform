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
