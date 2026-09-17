import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * The production reset (PRODUCTION-RESET.md) is a script that deletes
 * accounts on the live database. These pin the rules that make it safe to
 * hand to someone: dry run unless told otherwise, money reversed through
 * the refund path rather than deleted, nothing that belongs to a real
 * person touched, the documented fixture kept.
 */
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'production-reset.mjs'), 'utf8')

test('writes nothing unless --apply is passed', () => {
  assert.match(src, /const APPLY = flag\('--apply'\)/)
  // Every write is behind APPLY.
  for (const write of ['deleteAuthUser(', "query('delete from profiles", "query('delete from creator_profiles", "admin('POST'", "admin('DELETE'", "admin('PATCH'"]) {
    const at = src.indexOf(write)
    assert.ok(at > -1, `${write} is present`)
    const before = src.slice(Math.max(0, at - 400), at)
    assert.match(before, /if \(!APPLY\) continue|if \(APPLY\)|if \(!APPLY\) \{/, `${write} is guarded by APPLY`)
  }
})

test('money is reversed through the admin refund path, never deleted', () => {
  assert.match(src, /\/api\/admin\/payments\/\$\{p\.payment_id\}\/refund/)
  assert.doesNotMatch(src, /delete from (purchases|payments|earnings|withdrawals)/i)
  assert.doesNotMatch(src, /update (purchases|payments|earnings)/i)
  // A purchase with no payment cannot be refunded properly — it is reported, not guessed at.
  assert.match(src, /has no payment_id — refund path cannot run, needs a human/)
})

test('an account whose videos real people bought is BLOCKED, not deleted', () => {
  assert.match(src, /where v\.creator_id = \$1 and pu\.status = 'active' and not \(b\.id = any\(\$2::uuid\[\]\)\)/)
  assert.match(src, /active purchase\(s\) by .* real account\(s\)/)
  assert.match(src, /say\(`   BLOCKED — \$\{holdReasons\.join\('; '\)\}`\)\s*\n[^\n]*\n\s*continue/)
})

test('videos go through the admin soft-delete so the audit log records them', () => {
  assert.match(src, /admin\('DELETE', `\/api\/admin\/videos\/\$\{v\.id\}`\)/)
  assert.doesNotMatch(src, /delete from videos/i)
})

test('the documented E2E fixture is kept unless explicitly included', () => {
  assert.match(src, /const FIXTURE = 'e2e\+8238822854@mtonyo\.test'/)
  assert.match(src, /if \(!flag\('--include-fixture'\)\) KEEP\.add\(FIXTURE\)/)
})

test('demo accounts are opt-in, and the demo-stats switch goes through the settings route', () => {
  assert.match(src, /if \(flag\('--with-demo'\)\) SCOPES\.add\('demo'\)/)
  assert.doesNotMatch(src, /DEFAULT_SCOPES = \[[^\]]*'demo'[^\]]*\]/)
  assert.match(src, /admin\('PATCH', '\/api\/admin\/settings', \{ show_demo_content_in_stats: false \}\)/)
  assert.doesNotMatch(src, /update platform_settings/i)
})

test('an account matching two scopes is processed once', () => {
  assert.match(src, /const seen = new Set\(\)/)
  assert.match(src, /if \(seen\.has\(acct\.id\)\) continue/)
})
