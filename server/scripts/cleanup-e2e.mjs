/**
 * Remove the end-to-end test data from production.
 *
 * The e2e account is a real account and its purchases are real rows — payments,
 * purchases, earnings and a creator split — so they appear in the client's
 * revenue figures. They are kept deliberately while they are still the fixture
 * for the player, entitlement and cross-browser suites, and reversed at handover.
 *
 * REVERSAL, NOT DELETION. Purchases go back through the admin refund path
 * (`POST /api/admin/payments/:id/refund`), which sets the payment to `refunded`,
 * the purchase to `refunded`, and — the part a raw DELETE would miss — reverses
 * the creator's earnings credit. Deleting the rows instead would leave a creator
 * able to withdraw against money that no longer exists.
 *
 * It does not move money. These are sandbox payments; nothing was ever charged.
 *
 * Dry run by default. Nothing is written without --apply.
 *
 *   node scripts/cleanup-e2e.mjs                      # show what would happen
 *   node scripts/cleanup-e2e.mjs --apply              # do it
 *   node scripts/cleanup-e2e.mjs --only a@b.test --apply
 *
 * Refunds need an admin token: ADMIN_TOKEN=<access token of an admin account>.
 * Account deletion needs SUPABASE_SERVICE_ROLE_KEY, which server/.env has.
 */
import 'dotenv/config'
import { pathToFileURL } from 'node:url'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const { many, one, query } = await import(pathToFileURL(root + '/src/db/pool.js').href)

const APPLY = process.argv.includes('--apply')
const onlyIx = process.argv.indexOf('--only')
const ONLY = onlyIx > -1 ? process.argv[onlyIx + 1] : null
const PATTERN = ONLY || 'e2e+%@mtonyo.test'
const API = process.env.SERVER_PUBLIC_URL || 'https://video-monetization-platform-production.up.railway.app'

const say = (...a) => console.log(...a)
say(`\n${APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written'}   target: ${PATTERN}\n`)

const accounts = await many(
  `select id, email, role::text as role, status::text as status, created_at
     from profiles
    where email ${ONLY ? '= $1' : 'like $1'}
    order by created_at`,
  [PATTERN]
)
if (!accounts.length) {
  say('No matching accounts. Nothing to do.')
  process.exit(0)
}

for (const acct of accounts) {
  say(`── ${acct.email}   role=${acct.role} status=${acct.status}`)

  const rows = await many(
    `select p.id as purchase_id, p.status::text as purchase_status, p.amount_tzs,
            p.payment_id, pay.status::text as payment_status, v.slug
       from purchases p
       left join payments pay on pay.id = p.payment_id
       left join videos v on v.id = p.video_id
      where p.user_id = $1
      order by p.purchased_at`,
    [acct.id]
  )

  if (!rows.length) say('   no purchases')
  for (const r of rows) {
    if (r.purchase_status === 'refunded') { say(`   already refunded · ${r.slug}`); continue }
    if (!r.payment_id) {
      /* A purchase with no payment cannot go through the refund path, and a raw
         update would skip the earnings reversal. Report it rather than guess. */
      say(`   ** ${r.slug}: purchase ${r.purchase_id} has no payment_id — refund path cannot run, needs a human`)
      continue
    }
    say(`   refund ${r.amount_tzs} TZS · ${r.slug} · payment ${r.payment_id} (${r.payment_status})`)
    if (!APPLY) continue
    if (!process.env.ADMIN_TOKEN) { say('     skipped: ADMIN_TOKEN not set'); continue }
    const res = await fetch(`${API}/api/admin/payments/${r.payment_id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'End-to-end test data, reversed at handover' }),
    })
    say(`     → ${res.status} ${JSON.stringify(await res.json().catch(() => null))}`)
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
    await query('delete from profiles where id = $1', [acct.id]).catch((e) => say(`     profile: ${e.message}`))
    say('     → profile row removed')
  } else {
    say('     → profile row went with the auth user')
  }
}

say(`\n${APPLY ? 'Done.' : 'Dry run complete. Re-run with --apply to make these changes.'}`)
process.exit(0)
