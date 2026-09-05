-- ============================================================================
-- 037 · Creator Capital — interface + manual workflow, no lending engine
--
-- MTONYO+ is not the lender. AirPay decides who is approved and for how
-- much; this table is where that decision, and the manual review that leads
-- to it, is recorded and shown back to the creator. Nothing here disburses
-- money — disbursement and collection are AirPay's own system, reached
-- outside this platform. What lives here is: are they eligible to ask, did
-- they ask, what did AirPay/the admin decide, and where do they stand on
-- repaying it.
-- ============================================================================

do $$ begin
  create type creator_capital_status as enum
    ('building', 'under_review', 'approved', 'active', 'repaid', 'declined', 'paused');
exception when duplicate_object then null; end $$;

-- A new admin permission module for the review screen — additive, so a
-- sub-admin's existing grants are unaffected either way.
alter type staff_module add value if not exists 'capital';

create table if not exists creator_capital (
  id                 uuid primary key default gen_random_uuid(),
  creator_id         uuid not null references profiles(id) on delete cascade,
  status             creator_capital_status not null default 'building',

  -- Eligibility inputs. `months_required` is configurable per row so a
  -- policy change does not have to be a migration; the platform default is 6.
  months_required    smallint not null default 6 check (months_required > 0),

  -- Set once AirPay (or the admin, standing in for AirPay pre-integration)
  -- makes a decision. Null until then.
  approved_amount_tzs   integer check (approved_amount_tzs is null or approved_amount_tzs > 0),
  purpose               text,
  repayment_terms       text,
  amount_repaid_tzs     integer not null default 0 check (amount_repaid_tzs >= 0),
  -- Computed, not stored twice: remaining balance is a generated column so
  -- it can never drift from the two numbers it is derived from.
  remaining_balance_tzs integer generated always as
    (greatest(coalesce(approved_amount_tzs, 0) - amount_repaid_tzs, 0)) stored,

  next_review_at     timestamptz,
  admin_notes        text,

  requested_at       timestamptz,        -- when the creator hit "Request review"
  decided_at         timestamptz,
  decided_by         uuid references profiles(id),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table creator_capital is
  'Creator Capital eligibility, review and repayment state. AirPay is the '
  'lender and makes the credit decision; this table records that decision '
  'and the manual workflow around it. No disbursement or collection logic '
  'lives here.';

-- One open program per creator: a creator with an active or under-review
-- application cannot start a second one until it resolves.
create unique index if not exists creator_capital_one_open
  on creator_capital (creator_id)
  where status in ('under_review', 'approved', 'active');

create index if not exists creator_capital_creator_idx on creator_capital (creator_id);
create index if not exists creator_capital_status_idx on creator_capital (status);

/* ----------------------------------------------------------------- lock it
   Same reasoning as 032/033: 026's event trigger covers tables created
   outside migrations as a safety net, but protection stated only there is
   protection someone will assume has been dropped. Stated here explicitly. */
alter table creator_capital enable row level security;
revoke all on table creator_capital from anon, authenticated, public;

drop policy if exists creator_capital_own_read on creator_capital;
create policy creator_capital_own_read on creator_capital
  for select using (creator_id = auth.uid() or auth_role() = 'admin');

-- No creator INSERT/UPDATE/DELETE policy is granted here on purpose: every
-- write, including "request review", goes through server routes running as
-- the service role, exactly like `withdrawals` and `creator_applications`
-- today — neither of those has a client-side RLS write path either.
