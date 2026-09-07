/**
 * Data-hygiene invariant: no test-account creator should ever be visible in
 * a public "who is a real, paid creator" surface. Fails if it finds one.
 *
 * Written after `npm run smoke` was found leaking published "Smoke Creator"
 * videos into exactly the spot `show_demo_content_in_stats` exists to
 * protect (`DECISIONS.md`, 2026-09-08) — this is the check that would have
 * caught it before a sign-off sweep had to.
 *
 * Test-pattern emails, not a single one: `e2e+...@mtonyo.test` (the
 * purchase-journey/regression fixtures), `creator.../viewer...@mtonyo.test`
 * (smoke.js's own accounts), and `...@mtonyo.internal` (temporary ops
 * accounts documented in E2E-ACCOUNTS.md). `%@mtonyo.demo` is deliberately
 * excluded from this pattern list — those are the seeded demo catalogue,
 * meant to exist and meant to be flagged, not a leak to detect.
 *
 *   node scripts/check-demo-flagging.mjs
 */
import 'dotenv/config'
import { many } from '../src/db/pool.js'

const TEST_PATTERNS = [
  'e2e+%@mtonyo.test',
  'creator.%@mtonyo.test',
  'viewer.%@mtonyo.test',
  '%@mtonyo.internal',
]

const where = TEST_PATTERNS.map((_, i) => `p.email like $${i + 1}`).join(' or ')

const leaked = await many(
  `select p.id, p.email, p.role, p.is_demo,
          exists(select 1 from videos v where v.creator_id = p.id and v.is_published) as has_published_video
     from profiles p
    where (${where})
      and p.role = 'creator'
      and p.is_demo = false
    order by p.email`,
  TEST_PATTERNS
)

if (leaked.length) {
  console.log(`\x1b[31mFAIL\x1b[0m  ${leaked.length} test-pattern creator(s) not flagged is_demo:`)
  for (const row of leaked) {
    console.log(`  ${row.email}  published_video=${row.has_published_video}`)
  }
  console.log('\nFix: flag them (`update profiles/creator_profiles set is_demo = true`) and, for')
  console.log('any with a published video, unpublish it through POST /api/admin/videos/:id/unpublish —')
  console.log('never a raw write for the unpublish, so the action is audited.')
  process.exit(1)
}

console.log('\x1b[32mPASS\x1b[0m  no test-pattern creator exists with is_demo = false')
process.exit(0)
