-- 048 · Ads Management control center and the Homepage Sponsors flow
--
-- Client, 2026-11-17 (points 5 and 6):
--   campaigns: status Draft / Scheduled / Live / Paused / Ended, an impression
--   cap, edit / pause / resume / end / delete;
--   sponsors:  UPLOAD → PREVIEW → SAVE DRAFT → PUBLISH/SCHEDULE → EDIT/PAUSE → VIEW STATS.
--
-- `state` is what the admin chose. Scheduled / Live / Ended-by-date are worked
-- out from it and the dates when the list is read, so they can never drift.
-- `active` stays, kept equal to (state = 'active' / 'published'), so every
-- query already written against it keeps meaning exactly what it meant.
-- Additive only: the code before this migration runs unchanged on top of it.

-- ------------------------------------------------------------- ad campaigns
alter table ad_campaigns
  add column if not exists state          text,
  add column if not exists impression_cap integer,
  add column if not exists ended_at       timestamptz;

update ad_campaigns set state = case when active then 'active' else 'paused' end where state is null;

alter table ad_campaigns alter column state set default 'active';
alter table ad_campaigns alter column state set not null;

do $$ begin
  alter table ad_campaigns add constraint ad_campaigns_state_check
    check (state in ('draft', 'active', 'paused', 'ended'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ad_campaigns add constraint ad_campaigns_cap_check
    check (impression_cap is null or impression_cap > 0);
exception when duplicate_object then null; end $$;

comment on column ad_campaigns.state is
  'What the admin chose: draft (never served), active, paused, ended (stopped for good). '
  'Scheduled and ended-by-date are derived from starts_at / ends_at. active = (state = ''active'').';
comment on column ad_campaigns.impression_cap is
  'Stop serving once this many impressions have been delivered. Null = no cap.';

-- ----------------------------------------------------------- home sponsors
alter table home_sponsors
  add column if not exists state    text,
  add column if not exists ended_at timestamptz;

update home_sponsors set state = case when active then 'published' else 'paused' end where state is null;

alter table home_sponsors alter column state set default 'published';
alter table home_sponsors alter column state set not null;

do $$ begin
  alter table home_sponsors add constraint home_sponsors_state_check
    check (state in ('draft', 'published', 'paused', 'ended'));
exception when duplicate_object then null; end $$;

comment on column home_sponsors.state is
  'draft (saved, never shown), published (shown inside its dates), paused, ended. '
  'active = (state = ''published'').';

-- Views and clicks per day, for the sponsor report ("VIEW STATS").
create table if not exists home_sponsor_daily (
  sponsor_id  uuid not null references home_sponsors(id) on delete cascade,
  day         date not null,
  impressions integer not null default 0,
  clicks      integer not null default 0,
  primary key (sponsor_id, day)
);

alter table home_sponsor_daily enable row level security;
revoke all on table home_sponsor_daily from anon, authenticated, public;
