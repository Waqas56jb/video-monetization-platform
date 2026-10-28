#!/usr/bin/env node
/**
 * Money reconciliation — payments ↔ purchases ↔ earnings, read-only.
 *
 *   npm run money:reconcile
 *
 * Every check is a query that must return no rows. Exit code 1 if any does,
 * so this can run after a deploy or a payment incident and say plainly
 * whether every shilling taken is accounted for.
 *
 * Runs inside ONE `begin read only` transaction: the production database is
 * reached through a transaction pooler, where a session-level SET would leak
 * onto the live API's connections.
 */
import { getPool, closePool } from '../db/pool.js'
import { PENDING_EXPIRES_MS } from '../modules/payments/payments.service.js'

export const CHECKS = [
  {
    name: 'every successful payment granted exactly one purchase (or is flagged refund-due)',
    sql: `select p.merchant_order_id, p.status, count(pu.id) purchases
            from payments p left join purchases pu on pu.payment_id = p.id
           where p.status = 'success' and not p.refund_due
           group by p.id having count(pu.id) <> 1`,
  },
  {
    name: 'no purchase exists without a verified payment behind it',
    sql: `select pu.id, p.merchant_order_id, p.status
            from purchases pu left join payments p on p.id = pu.payment_id
           where pu.payment_id is not null and (p.id is null or p.status not in ('success', 'refunded'))`,
  },
  {
    name: 'a purchase costs what its payment charged',
    sql: `select p.merchant_order_id, p.amount_tzs paid, pu.amount_tzs purchase
            from purchases pu join payments p on p.id = pu.payment_id
           where pu.amount_tzs <> p.amount_tzs`,
  },
  {
    name: 'a refunded payment has no active purchase',
    sql: `select p.merchant_order_id from payments p join purchases pu on pu.payment_id = p.id
           where p.status = 'refunded' and pu.status = 'active'`,
  },
  {
    name: 'each sale nets to its price while active, and to zero once refunded',
    sql: `select pu.id, pu.status, pu.amount_tzs, coalesce(sum(e.gross_tzs), 0) net
            from purchases pu left join earnings e on e.purchase_id = pu.id and e.source = 'sale'
           group by pu.id
          having coalesce(sum(e.gross_tzs), 0) <> case when pu.status = 'active' then pu.amount_tzs else 0 end`,
  },
  {
    name: 'every ledger row splits exactly: creator + platform = gross, creator = round(gross × %)',
    sql: `select id, gross_tzs, creator_tzs, platform_tzs, split_percent from earnings
           where creator_tzs + platform_tzs <> gross_tzs
              or (source = 'sale' and creator_tzs <> round(gross_tzs * split_percent / 100.0))`,
  },
  {
    name: 'a purchase records the same split as its ledger row',
    sql: `select pu.id, pu.split_percent, e.split_percent ledger
            from purchases pu join earnings e on e.purchase_id = pu.id and e.source = 'sale' and e.gross_tzs > 0
           where e.split_percent <> pu.split_percent or e.creator_tzs <> pu.creator_amount_tzs`,
  },
  {
    name: 'no payment is left pending past the confirmation window',
    sql: `select merchant_order_id, created_at from payments
           where status = 'pending' and created_at < now() - make_interval(secs => ${PENDING_EXPIRES_MS / 1000 + 600})`,
  },
  {
    name: "a real creator's sale rows with no purchase net to zero (corrections only)",
    sql: `select e.creator_id, sum(e.gross_tzs) net, count(*) rows
            from earnings e left join creator_profiles cp on cp.user_id = e.creator_id
           where e.source = 'sale' and e.purchase_id is null and not coalesce(cp.is_demo, false)
           group by e.creator_id having sum(e.gross_tzs) <> 0`,
  },
  {
    name: 'payments charged twice are waiting for a refund',
    sql: `select merchant_order_id, provider_ref, amount_tzs, created_at from payments where refund_due`,
  },
]

async function run() {
  const client = await getPool().connect()
  let bad = 0
  try {
    await client.query('begin read only')
    console.log('\n  MTONYO+ money reconciliation (read-only)\n')
    for (const c of CHECKS) {
      const { rows } = await client.query(c.sql)
      console.log(`  ${rows.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'} ${c.name}${rows.length ? ` — ${rows.length}` : ''}`)
      if (rows.length) {
        bad++
        console.table(rows.slice(0, 10))
      }
    }

    const { rows: [t] } = await client.query(`
      select
        (select coalesce(sum(amount_tzs), 0) from payments where status = 'success')                  as taken_tzs,
        (select coalesce(sum(amount_tzs), 0) from payments where status = 'success' and refund_due)   as refund_due_tzs,
        (select coalesce(sum(amount_tzs), 0) from purchases where status = 'active')                  as active_sales_tzs,
        (select coalesce(sum(gross_tzs), 0) from earnings where source = 'sale' and purchase_id is not null) as ledger_sales_tzs,
        (select coalesce(sum(e.gross_tzs), 0) from earnings e join creator_profiles cp on cp.user_id = e.creator_id
          where e.source = 'sale' and e.purchase_id is null and cp.is_demo)                             as demo_seed_tzs,
        (select coalesce(sum(creator_tzs), 0) from earnings)                                          as creators_tzs,
        (select coalesce(sum(platform_tzs), 0) from earnings)                                         as platform_tzs,
        (select creator_split_percent from platform_settings where id = 1)                             as split_now`)
    console.log('\n  totals (TZS)')
    console.table([t])
    const balanced = Number(t.taken_tzs) - Number(t.refund_due_tzs) === Number(t.active_sales_tzs)
      && Number(t.active_sales_tzs) === Number(t.ledger_sales_tzs)
    console.log(`  ${balanced ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} money taken (less refund-due) = active sales = ledger sales`)
    if (!balanced) bad++

    const { rows: splits } = await client.query(`
      select split_percent, source, count(*)::int rows, sum(gross_tzs)::int gross, max(created_at)::date last
        from earnings where gross_tzs > 0 group by 1, 2 order by 1, 2`)
    console.log('\n  ledger by split (history keeps the split it was credited at)')
    console.table(splits)
  } finally {
    await client.query('rollback').catch(() => {})
    client.release()
  }
  return bad
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('reconcile.js')) {
  run()
    .then(async (bad) => {
      await closePool()
      console.log(bad ? `\n  ${bad} check(s) failed\n` : '\n  all money accounted for\n')
      process.exit(bad ? 1 : 0)
    })
    .catch(async (err) => {
      console.error(err)
      await closePool().catch(() => {})
      process.exit(1)
    })
}
