/**
 * Production reset — take the test, probe and demo data out of the live
 * platform before launch, through the platform's own paths.
 *
 * What the client asked for (Milestone 2 close-out, 2026-09-17): a safe plan
 * so Smoke/test/demo users, fake payments, fake views and demo earnings do
 * not appear at launch. This is that plan as a script. It reports first and
 * writes nothing without --apply.
 *
 * RULES IT KEEPS, IN ORDER OF IMPORTANCE
 *
 *   1. Money is reversed, never deleted. A test account's purchases go back
 *      through the admin refund path (POST /api/admin/payments/:id/refund),
 *      which flips the payment and purchase to `refunded` AND writes the
 *      negative earnings row that takes the creator's credit back. A raw
 *      DELETE would leave a creator able to withdraw against money that no
 *      longer exists. (These are sandbox payments; nothing was ever charged.)
 *
 *   2. Nothing that belongs to a real person is touched. Deleting a creator
 *      hard-deletes their videos (FK cascade), and that cascades into every
 *      purchase, payment, view and watch-progress row on those videos —
 *      including the ones REAL viewers made. So an account whose videos have
 *      active purchases by anyone outside the target set is BLOCKED and
 *      listed, never deleted. The real testers who bought demo films are
 *      exactly this case.
 *
 *   3. Videos go through the admin soft-delete (DELETE /api/admin/videos/:id)
 *      before the account goes, so the audit log records what was removed.
 *
 *   4. The documented E2E fixture (E2E-ACCOUNTS.md) is kept unless
 *      --include-fixture is passed.
 *
 * SCOPES (--scope a,b,c — default: smoke,probe,e2e,test-other,orphans,test-announcement,demo-stats)
 *
 *   smoke              creator.*@mtonyo.test / viewer.*@mtonyo.test — Playwright smoke and matrix accounts
 *   probe              probe+*@mtonyo.test — one-off diagnostic accounts
 *   e2e                e2e+*@mtonyo.test — purchase-journey viewers (fixture kept)
 *   test-other         any other *@mtonyo.test
 *   orphans            creator_profiles rows on accounts that are not creators
 *   test-announcement  the announcement titled "test" and the inbox rows it made
 *   demo-stats         platform_settings.show_demo_content_in_stats → false, so demo
 *                      creators, views and earnings leave the public numbers
 *   demo               (opt in with --with-demo) demo.*@mtonyo.demo / is_demo accounts —
 *                      mostly BLOCKED today because real testers bought their films
 *
 *   node scripts/production-reset.mjs                       # report
 *   node scripts/production-reset.mjs --with-demo            # report, demo included
 *   node scripts/production-reset.mjs --apply                # do the default scopes
 *   node scripts/production-reset.mjs --only x@mtonyo.test --apply
 *   node scripts/production-reset.mjs --keep a@b.test --keep c@d.test --apply
 *
 * --apply needs ADMIN_EMAIL + ADMIN_PASSWORD (or ADMIN_TOKEN) for the admin
 * paths and SUPABASE_SERVICE_ROLE_KEY (server/.env) for auth-user deletion.
 * Take a database backup (Supabase → Database → Backups) before --apply;
 * there is no undo for a deleted account.
 */
import 'dotenv/config'
import { pathToFileURL } from 'node:url'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const { many, one, query, getPool } = await import(pathToFileURL(root + '/src/db/pool.js').href)

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const values = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []))
const APPLY = flag('--apply')
const FIXTURE = 'e2e+8238822854@mtonyo.test'
const DEFAULT_SCOPES = ['smoke', 'probe', 'e2e', 'test-other', 'orphans', 'test-announcement', 'demo-stats']
const SCOPES = new Set(
  (values('--scope')[0] || DEFAULT_SCOPES.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
)
if (flag('--with-demo')) SCOPES.add('demo')
const KEEP = new Set(values('--keep').map((e) => e.toLowerCase()))
if (!flag('--include-fixture')) KEEP.add(FIXTURE)
const ONLY = (values('--only')[0] || '').toLowerCase() || null
const API = process.env.API || process.env.SERVER_PUBLIC_URL || 'https://video-monetization-platform-production.up.railway.app'

const say = (...a) => console.log(...a)
const tzs = (n) => `${Number(n || 0).toLocaleString('en-US')} TZS`

/* ---------------------------------------------------------------- admin session */
let adminToken = process.env.ADMIN_TOKEN || null
async function adminSession() {
  if (adminToken) return adminToken
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('--apply needs ADMIN_EMAIL and ADMIN_PASSWORD (or ADMIN_TOKEN)')
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, side: 'viewer' }),
  })
  const j = await r.json().catch(() => ({}))
  adminToken = j?.session?.accessToken
  if (!adminToken) throw new Error(`admin sign-in failed: ${r.status} ${JSON.stringify(j).slice(0, 200)}`)
  return adminToken
}
async function admin(method, path, body) {
  const token = await adminSession()
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, body: j }
}

/* ---------------------------------------------------------------- targets */
const SCOPE_SQL = {
  smoke: "(email like 'creator.%@mtonyo.test' or email like 'viewer.%@mtonyo.test')",
  probe: "email like 'probe+%@mtonyo.test'",
  e2e: "email like 'e2e+%@mtonyo.test'",
  'test-other':
    "(email like '%@mtonyo.test' and email not like 'creator.%' and email not like 'viewer.%' and email not like 'probe+%' and email not like 'e2e+%')",
  demo: '(is_demo = true or email like \'%@mtonyo.demo\')',
}

async function accountsFor(scope) {
  const where = SCOPE_SQL[scope]
  if (!where) return []
  const rows = await many(
    `select id, email, role::text as role, status::text as status, is_demo, created_at
       from profiles where ${where} order by created_at`
  )
  return rows
    .map((r) => ({ ...r, scope }))
    .filter((r) => !KEEP.has(r.email.toLowerCase()))
    .filter((r) => !ONLY || r.email.toLowerCase() === ONLY)
}

say(`\n${APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written'}   scopes: ${[...SCOPES].join(', ')}`)
say(`kept: ${[...KEEP].join(', ') || '(none)'}${ONLY ? `   only: ${ONLY}` : ''}   api: ${API}\n`)

/* An account can match two scopes (the smoke accounts are flagged is_demo);
   it is listed once, under the first scope that claimed it. */
const targets = []
const seen = new Set()
for (const scope of ['smoke', 'probe', 'e2e', 'test-other', 'demo']) {
  if (!SCOPES.has(scope)) continue
  for (const acct of await accountsFor(scope)) {
    if (seen.has(acct.id)) continue
    seen.add(acct.id)
    targets.push(acct)
  }
}
const targetIds = targets.map((t) => t.id)

/* ---------------------------------------------------------------- per-account inventory */
async function inventory(acct) {
  const videos = await many(
    `select id, slug, title, is_published, deleted_at from videos where creator_id = $1 order by created_at`,
    [acct.id]
  )
  const purchases = await many(
    `select p.id as purchase_id, p.status::text as purchase_status, p.amount_tzs, p.payment_id,
            pay.status::text as payment_status, v.slug
       from purchases p
       left join payments pay on pay.id = p.payment_id
       left join videos v on v.id = p.video_id
      where p.user_id = $1 order by p.purchased_at`,
    [acct.id]
  )
  const money = await one(
    `select coalesce(sum(creator_tzs), 0)::bigint as earned,
            (select count(*)::int from withdrawals where creator_id = $1) as withdrawals
       from earnings where creator_id = $1`,
    [acct.id]
  )
  /* Active purchases on THIS account's videos by anyone not being removed. */
  const external = await many(
    `select b.email, v.slug, pu.amount_tzs
       from purchases pu
       join videos v on v.id = pu.video_id
       join profiles b on b.id = pu.user_id
      where v.creator_id = $1 and pu.status = 'active' and not (b.id = any($2::uuid[]))
      order by b.email`,
    [acct.id, targetIds]
  )
  /* NO ACTION foreign keys that would make the profile delete fail. */
  const holds = await one(
    `select
       (select count(*)::int from video_deletion_requests r join videos v on v.id = r.video_id
         where (r.requested_by = $1 or r.decided_by = $1) and v.creator_id <> $1)                    as deletion_requests,
       (select count(*)::int from videos where (reviewed_by = $1 or deleted_by = $1) and creator_id <> $1) as reviewed_videos,
       (select count(*)::int from creator_capital where decided_by = $1 and creator_id <> $1)         as capital_decisions,
       (select count(*)::int from withdrawals where decided_by = $1 and creator_id <> $1)             as withdrawal_decisions`,
    [acct.id]
  )
  return { videos, purchases, money, external, holds }
}

/* ---------------------------------------------------------------- accounts */
const summary = { accounts: 0, blocked: 0, refunds: 0, refundTzs: 0, videos: 0, humans: 0, done: 0 }
const blockedList = []

for (const acct of targets) {
  summary.accounts += 1
  const inv = await inventory(acct)
  say(`── ${acct.email}   ${acct.role} · ${acct.status}${acct.is_demo ? ' · demo' : ''} · ${acct.scope}`)

  const holdReasons = Object.entries(inv.holds)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k.replace(/_/g, ' ')} on other people's rows`)
  if (inv.external.length) {
    const buyers = [...new Set(inv.external.map((e) => e.email))]
    holdReasons.push(`${inv.external.length} active purchase(s) by ${buyers.length} real account(s): ${buyers.join(', ')}`)
  }
  if (holdReasons.length) {
    summary.blocked += 1
    blockedList.push({ email: acct.email, reasons: holdReasons })
    say(`   BLOCKED — ${holdReasons.join('; ')}`)
    say(`   (deleting this account would cascade into those rows — refund those buyers in Admin → Payments first, or keep the account)`)
    continue
  }

  const live = inv.videos.filter((v) => !v.deleted_at)
  if (live.length) say(`   videos: ${live.length} live (${live.filter((v) => v.is_published).length} published) — soft-delete via admin path`)
  if (Number(inv.money.earned) !== 0 || inv.money.withdrawals) {
    say(`   ledger: ${tzs(inv.money.earned)} earned · ${inv.money.withdrawals} withdrawal(s) — goes with the account (test money, never paid out)`)
  }

  for (const p of inv.purchases) {
    if (p.purchase_status !== 'active') continue
    if (!p.payment_id) {
      summary.humans += 1
      say(`   ** ${p.slug}: purchase ${p.purchase_id} has no payment_id — refund path cannot run, needs a human`)
      continue
    }
    summary.refunds += 1
    summary.refundTzs += Number(p.amount_tzs)
    say(`   refund ${tzs(p.amount_tzs)} · ${p.slug} · payment ${p.payment_id} (${p.payment_status})`)
    if (!APPLY) continue
    const r = await admin('POST', `/api/admin/payments/${p.payment_id}/refund`, {
      reason: 'Test data reversed before launch (production reset)',
    })
    say(`     → ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`)
  }

  for (const v of live) {
    summary.videos += 1
    if (!APPLY) continue
    const r = await admin('DELETE', `/api/admin/videos/${v.id}`)
    say(`     video "${v.title}" → ${r.status}`)
  }

  say(`   delete account ${acct.id}`)
  if (!APPLY) continue
  const { deleteAuthUser } = await import(pathToFileURL(root + '/src/lib/supabase.js').href)
  try {
    await deleteAuthUser(acct.id)
    say('     → auth user deleted')
  } catch (err) {
    say(`     → auth delete failed: ${err.message}`)
  }
  const left = await one('select id from profiles where id = $1', [acct.id])
  if (left) {
    try {
      await query('delete from profiles where id = $1', [acct.id])
      say('     → profile row removed (dependants cascaded)')
    } catch (e) {
      say(`     → profile delete failed: ${e.message}`)
      continue
    }
  } else {
    say('     → profile row went with the auth user')
  }
  summary.done += 1
}

/* ---------------------------------------------------------------- orphans */
if (SCOPES.has('orphans')) {
  say(`\n── creator_profiles rows on accounts that are not creators`)
  const rows = await many(
    `select p.id, p.email, p.role::text as role,
            (select count(*)::int from videos where creator_id = p.id) as videos,
            (select count(*)::int from earnings where creator_id = p.id) as earnings
       from creator_profiles cp join profiles p on p.id = cp.user_id
      where p.role <> 'creator' order by p.email`
  )
  if (!rows.length) say('   none')
  for (const r of rows) {
    if (r.videos || r.earnings) {
      say(`   ** ${r.email} (${r.role}) has ${r.videos} video(s) / ${r.earnings} earning row(s) — not touching, needs a human`)
      continue
    }
    say(`   ${r.email} (${r.role}) — remove the dangling creator_profiles row`)
    if (APPLY) {
      await query('delete from creator_profiles where user_id = $1', [r.id])
      say('     → removed')
    }
  }
}

/* ---------------------------------------------------------------- the "test" announcement */
if (SCOPES.has('test-announcement')) {
  say(`\n── announcements titled "test"`)
  const rows = await many(
    `select a.id, a.title, a.created_at,
            (select count(*)::int from notifications n where n.announcement_id = a.id) as inbox_rows
       from announcements a where a.title ilike 'test' order by a.created_at`
  )
  if (!rows.length) say('   none')
  for (const a of rows) {
    say(
      `   "${a.title}" ${a.id} sent ${new Date(a.created_at).toISOString().slice(0, 10)} — ${a.inbox_rows} inbox row(s) go with it (FK cascade) — delete via admin path`
    )
    if (APPLY) {
      const r = await admin('DELETE', `/api/staff/announcements/${a.id}`)
      say(`     → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)
    }
  }
}

/* ---------------------------------------------------------------- demo content in public stats */
if (SCOPES.has('demo-stats')) {
  say(`\n── platform_settings.show_demo_content_in_stats`)
  const s = await one('select show_demo_content_in_stats from platform_settings where id = 1')
  if (!s.show_demo_content_in_stats) {
    say('   already false — demo creators, views and earnings are out of the public numbers')
  } else {
    say('   true → set false via PATCH /api/admin/settings (homepage counts, top creators and /api/stats stop counting demo rows)')
    if (APPLY) {
      const r = await admin('PATCH', '/api/admin/settings', { show_demo_content_in_stats: false })
      say(`     → ${r.status} show_demo_content_in_stats=${r.body?.settings?.show_demo_content_in_stats}`)
    }
  }
}

/* ---------------------------------------------------------------- summary */
say(`\n══ ${APPLY ? 'DONE' : 'DRY RUN'} ══`)
say(
  `   accounts in scope: ${summary.accounts}   blocked: ${summary.blocked}   ${APPLY ? `deleted: ${summary.done}` : `would delete: ${summary.accounts - summary.blocked}`}`
)
say(`   refunds via admin path: ${summary.refunds} (${tzs(summary.refundTzs)})   videos soft-deleted: ${summary.videos}   need a human: ${summary.humans}`)
if (blockedList.length) {
  say(`\n   Blocked accounts (kept as they are):`)
  for (const b of blockedList) say(`     ${b.email}: ${b.reasons.join('; ')}`)
}
if (!APPLY) say(`\n   Re-run with --apply (ADMIN_EMAIL/ADMIN_PASSWORD + SUPABASE_SERVICE_ROLE_KEY set) to make these changes.`)

/* What the public will see afterwards. */
const after = await one(
  `select (select count(*)::int from profiles where role = 'creator' and status = 'active' and not is_demo) as real_creators,
          (select count(*)::int from profiles where email like '%@mtonyo.test') as test_accounts,
          (select count(*)::int from profiles where is_demo or email like '%@mtonyo.demo') as demo_accounts,
          (select count(*)::int from videos where deleted_at is null and is_published) as published_videos`
)
say(
  `\n   now: ${after.real_creators} real active creators · ${after.test_accounts} @mtonyo.test accounts · ${after.demo_accounts} demo accounts · ${after.published_videos} published videos`
)
await getPool().end()
process.exit(0)
