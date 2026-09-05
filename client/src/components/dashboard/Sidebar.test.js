import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./Sidebar.jsx', import.meta.url), 'utf8')

/**
 * The Viewer <-> Creator Studio switch used to be admin-only
 * (`accountRole === 'admin' && isCreator`) — a real dual-role person who
 * signed up on both Watch and Create, not staff, had no in-dashboard way to
 * switch sides at all. `sides.creator && sides.viewer` is the same "does
 * this account genuinely have both" test the missing-side prompt elsewhere
 * in this file already uses.
 */
test('the side switch is offered to any genuine dual-role account, not only admins', () => {
  assert.match(src, /Boolean\(sides\?\.creator\) && Boolean\(sides\?\.viewer\)/)
  assert.doesNotMatch(
    src,
    /\{accountRole === 'admin' && isCreator && \(\s*\n\s*<button/,
    'the switch must not be gated on admin-only again'
  )
})

test('the current mode stays visible via the existing role chip, side-aware', () => {
  // menuRole reads `role` from useRole(), which AuthContext derives from
  // panelRole -- already side-aware -- so the badge below needs no new
  // wiring, only confirming it still reads menuRole rather than the raw
  // account role.
  assert.match(src, /<span className=\{`role-chip role-\$\{menuRole\}`\}>/)
  assert.match(src, /menuRole === 'creator' \? 'CREATOR ACCOUNT' : 'VIEWER ACCOUNT'/)
})
