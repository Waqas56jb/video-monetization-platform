-- ============================================================================
-- 040 · Creator Capital — one global eligibility rule, creator consent, and
--       one live record per creator
-- ============================================================================
--
-- Three corrections from the client's Milestone 2 close-out review
-- (report2.txt SEP17):
--
-- 1. ONE eligibility requirement. 037 made `months_required` a per-row
--    column "so a policy change does not have to be a migration" — and the
--    rows then disagreed with every public surface: the homepage and the
--    creator dashboard said 6 months while Super Admin showed "3 of 2" and
--    "2 of 2" (rows seeded at 2 during manual testing). The rule now lives in
--    ONE place, `platform_settings.capital_months_required`, editable from
--    Super Admin → Settings and read by every surface. The per-row column
--    stays as a record of what the rule was when that request was made; it
--    is no longer where anything reads the rule from.
--
-- 2. Creator consent. Requesting a review means MTONYO+ shares verified
--    earnings and account data with AirPay Microfinance; the creator has to
--    say so, and when they did has to be recorded against the request.
--
-- 3. One LIVE record per creator, not merely one OPEN one. 037's unique
--    index covered under_review/approved/active only, so a `building` row
--    (seeded, or from an abandoned earlier flow) plus a fresh request made two
--    rows for one creator — and `GET /status`'s unordered `limit 1` could then
--    hand back either, showing "Request AirPay Review" again on top of a
--    request already pending. Every non-terminal status is now covered;
--    `repaid` and `declined` stay open so a creator can ask again later.
-- ============================================================================

alter table platform_settings
  add column if not exists capital_months_required smallint not null default 6
    check (capital_months_required > 0);

comment on column platform_settings.capital_months_required is
  'Months of verified (settled) earnings a creator needs before "Request '
  'AirPay Review" unlocks. The single source of truth for that rule — read by '
  'the public site, the creator dashboard, the creator-facing API and Super '
  'Admin alike. Migration 040.';

alter table creator_capital
  add column if not exists consent_at timestamptz;

comment on column creator_capital.consent_at is
  'When the creator consented to MTONYO+ sharing their verified earnings and '
  'account data with AirPay Microfinance for this review. Set by POST '
  '/api/capital/request-review, which refuses without it. Migration 040.';

drop index if exists creator_capital_one_open;
create unique index if not exists creator_capital_one_live
  on creator_capital (creator_id)
  where status in ('building', 'under_review', 'approved', 'active', 'paused');
