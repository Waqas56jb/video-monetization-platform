-- ============================================================================
-- 012 · Integrity the schema was relying on application code to keep
--
-- Three things, all found by reading the final review against the schema
-- rather than by anything failing yet. Each of them is the kind of fault that
-- shows up as money being wrong weeks later, with no way to tell when it went
-- wrong.
-- ============================================================================

/* ====================================================================
   1 · A CREATOR CANNOT BE PAID THE SAME MONEY TWICE

   Withdrawals were guarded in application code: recompute the balance
   inside the transaction, refuse if the amount exceeds it. That is the
   right check and it was not enough. Postgres reads at READ COMMITTED,
   so two requests arriving together both saw the same balance, both
   found it sufficient, and both inserted. Double-tapping the button was
   enough to do it.

   The route now takes an advisory lock per creator, which serialises
   them properly. This index exists for the other half of the problem —
   answering "what has this creator already taken" quickly, on every
   single request, rather than scanning their whole history.
   ==================================================================== */
create index if not exists withdrawals_creator_open_idx
  on withdrawals (creator_id, status)
  where status in ('pending', 'paid');

/* ====================================================================
   2 · THE AUDIT LOG CAN NOW BE ASKED QUESTIONS

   It was read as "the newest hundred rows" and nothing else. With
   filtering by actor, action, entity and date range added, those columns
   are now in WHERE clauses on a table that only ever grows.

   `created_at desc` already had an index; these cover the rest.
   ==================================================================== */
create index if not exists audit_log_action_idx      on audit_log (action, created_at desc);
create index if not exists audit_log_entity_idx      on audit_log (entity_type, created_at desc);

/* ====================================================================
   3 · AD IMPRESSIONS WITHOUT A PLAY ID CANNOT BE DEDUPLICATED

   The unique index that stops one playback being billed twice only
   covers rows where `play_id` is present:

     ad_impressions_once_per_play ... where play_id is not null

   A client that simply omits the play id therefore bypasses it. The
   route now verifies the campaign was genuinely servable before any
   money moves, which is the real fix, but an impression with no play id
   should never have been billable in the first place — it cannot be
   deduplicated, so it cannot be trusted.

   Enforced here rather than in a route, so it holds however the row
   arrives.
   ==================================================================== */
alter table ad_impressions
  drop constraint if exists ad_impressions_billable_needs_play_id;

alter table ad_impressions
  add constraint ad_impressions_billable_needs_play_id
  check (revenue_micro_tzs = 0 or play_id is not null);

/* ====================================================================
   4 · MONEY NEVER GOES BACKWARDS BY ACCIDENT

   A withdrawal is a positive amount by definition, and the column
   already says so. Earnings are different: a refund reversal is a
   deliberate negative row, so they must stay signed. What must not
   happen is a purchase recording a negative price.
   ==================================================================== */
alter table purchases
  drop constraint if exists purchases_amounts_not_negative;

alter table purchases
  add constraint purchases_amounts_not_negative
  check (amount_tzs >= 0 and creator_amount_tzs >= 0 and platform_amount_tzs >= 0);
