-- ============================================================================
-- 013 · Content rights, and a way to report content
--
-- Two things the platform describes in its own Creator Agreement but had no
-- record of and no mechanism for.
--
-- The agreement says a creator confirms, on upload, that they hold every right
-- needed to sell the work. Nothing ever asked them, and nothing stored an
-- answer — so if a claim arrived there was no record that the creator had ever
-- made that representation. The Copyright & Reporting page tells a viewer to
-- write to support; there was no way to report anything from the video itself,
-- and nothing that put a report in front of the moderation team.
-- ============================================================================

/* ====================================================================
   THE CREATOR'S REPRESENTATION

   Stored on the video rather than the account, because it is made per
   upload. A creator who holds the rights to one film does not thereby
   hold them to the next one.

   Nullable on purpose: videos uploaded before this existed did not make
   the representation, and back-filling a legal confirmation nobody gave
   would be worse than leaving it empty and knowing which ones it is.
   ==================================================================== */
alter table videos
  add column if not exists rights_confirmed_at timestamptz,
  -- Kept alongside the timestamp so the record says what was agreed to, not
  -- merely that something was. Wording changes; this does not.
  add column if not exists rights_statement    text;

/* ====================================================================
   REPORTS

   A viewer's route into the same moderation queue staff already work
   from. Deliberately open to signed-out visitors as well — somebody who
   finds infringing material should not have to create an account to say
   so — with the reporter recorded when we know who they are.
   ==================================================================== */
do $$ begin
  create type report_reason as enum (
    'copyright',      -- someone else's work
    'inappropriate',  -- explicit, hateful, or otherwise against the rules
    'misleading',     -- not what the page said it was
    'illegal',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_status as enum ('open', 'upheld', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists content_reports (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid not null references videos(id) on delete cascade,
  -- Null for a signed-out reporter. The report still counts.
  reporter_id   uuid references profiles(id) on delete set null,
  reporter_email text,
  reason        report_reason not null,
  detail        text,
  status        report_status not null default 'open',

  -- Who dealt with it, and what they decided. Denormalised the same way the
  -- notification log is, so the record still reads correctly after an account
  -- is removed.
  decided_by    uuid references profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  ip            text,
  created_at    timestamptz not null default now()
);

create index if not exists content_reports_open_idx  on content_reports (status, created_at desc);
create index if not exists content_reports_video_idx on content_reports (video_id);

/* One person, one open report per video. Somebody hammering the button should
   not bury the queue, and the second report adds nothing the first did not. */
create unique index if not exists content_reports_one_open_per_reporter
  on content_reports (video_id, reporter_id)
  where status = 'open' and reporter_id is not null;

/* ====================================================================
   ROW LEVEL SECURITY

   Reports are for the moderation team. A reporter may see their own;
   nobody may see anyone else's, and least of all the creator being
   reported — knowing who reported them is how retaliation starts.
   ==================================================================== */
alter table content_reports enable row level security;

drop policy if exists content_reports_own_read on content_reports;
create policy content_reports_own_read on content_reports
  for select using (reporter_id = auth.uid() or auth_role() = 'admin');

drop policy if exists content_reports_create on content_reports;
create policy content_reports_create on content_reports
  for insert with check (reporter_id = auth.uid() or reporter_id is null);
