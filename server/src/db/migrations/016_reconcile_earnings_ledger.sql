-- ============================================================================
-- 016 · Make every earnings row name the purchase it came from
--
-- The ledger did not reconcile with the money. Payments and purchases agreed
-- exactly — six successful payments, TZS 16,000, split 11,200/4,800, which is
-- 70/30 to the shilling — but `earnings` held TZS 22,500 of sales against them.
-- Two symptoms, one cause: four earnings rows had no `purchase_id` and looked
-- conjured from nothing, and two purchases had no earnings row and looked as
-- though their creator had never been credited. They were the same
-- transactions, never joined.
--
-- The cause was in the demo seeder: it wrote payment → purchase → earnings in
-- one transaction but left `purchase_id` out of the earnings insert. The real
-- payment path (payments/payments.service.js) has always written it. That is
-- fixed at the source; this reconciles what the old code left behind.
--
-- Why it mattered beyond tidiness: `earnings.routes.js` derives both the
-- creator's balance and the withdrawal ceiling from `sum(creator_tzs)` over
-- this table. An unlinked row is withdrawable money the platform never
-- received. The teardown could not clear them either — it deleted demo earnings
-- *through* `purchase_id`, so unlinked rows survived every cycle and
-- accumulated.
--
-- Two passes, in this order:
--   1. Link, don't invent. Where an uncredited purchase and an unlinked
--      earnings row describe the same sale — same video, same gross, same
--      creator — they are the same event and are joined.
--   2. Delete only what pass 1 could not place, and only for demo creators.
--      A real creator's ledger is never touched by this migration.
-- ============================================================================

-- ---- pass 1: join the halves that belong together -------------------------
with candidate as (
  select pu.id  as purchase_id,
         e.id   as earning_id,
         row_number() over (
           partition by pu.id
           order by abs(extract(epoch from (e.created_at - pu.purchased_at)))
         ) as by_purchase,
         row_number() over (
           partition by e.id
           order by abs(extract(epoch from (e.created_at - pu.purchased_at)))
         ) as by_earning
    from purchases pu
    join videos v  on v.id = pu.video_id
    join earnings e on e.source = 'sale'
                   and e.purchase_id is null
                   and e.video_id   = pu.video_id
                   and e.creator_id = v.creator_id
                   and e.gross_tzs  = pu.amount_tzs
   where not exists (select 1 from earnings x where x.purchase_id = pu.id)
)
update earnings e
   set purchase_id = c.purchase_id
  from candidate c
 where e.id = c.earning_id
   and c.by_purchase = 1
   and c.by_earning  = 1;

-- ---- pass 2: retire the surplus, demo creators only -----------------------
-- What is left is a duplicate produced by re-running the seeder: an earnings
-- row with no purchase and no payment anywhere behind it. Scoped by creator
-- email so this cannot reach real accounting.
delete from earnings e
 where e.source = 'sale'
   and e.purchase_id is null
   and exists (
         select 1 from profiles p
          where p.id = e.creator_id
            and p.email like 'demo.%@mtonyo.demo'
       );

-- Reading the ledger by purchase is how reconciliation is checked from now on.
create index if not exists earnings_purchase_idx on earnings (purchase_id)
  where purchase_id is not null;
