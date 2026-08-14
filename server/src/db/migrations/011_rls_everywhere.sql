-- ============================================================================
-- 011 · Row Level Security on everything the API exposes
--
-- Supabase's Security Advisor reported a table in the public schema with RLS
-- disabled, and it was right. Verified from outside with nothing but the
-- publishable key that ships in the browser bundle:
--
--   videos          -> 6 rows   (correct: there is a public read policy)
--   purchases       -> 0 rows   (correct: RLS)
--   payments        -> 0 rows   (correct: RLS)
--   earnings        -> 0 rows   (correct: RLS)
--   profiles        -> 0 rows   (correct: RLS)
--   watch_progress  -> 7 rows   <-- readable by anyone
--   _migrations     -> 10 rows  <-- readable by anyone
--
-- RLS off does not only mean readable. It means writable: anyone with the
-- project URL could have inserted, altered or deleted every row in those two
-- tables.
--
-- How they were missed: 002 and 004 enabled RLS on every table they created,
-- table by table. 008 added `watch_progress` and did not, and `_migrations` is
-- created by the migration runner itself so no migration ever covered it. A
-- list maintained by hand drifts the moment someone adds a table without
-- reading the older files.
--
-- So this does not name two tables. It sweeps the whole schema, and the same
-- sweep can be re-run after any future migration to prove nothing slipped.
--
-- NOTE ON THE API. It connects as the owning role, and a table's owner bypasses
-- RLS unless the table is set to FORCE. That is deliberate and is how every
-- policy since 002 has worked: authorisation for the application lives in the
-- route guards and the publication triggers, while RLS is the wall against
-- anyone talking to PostgREST directly with the public key. Enabling it here
-- changes nothing about how MTONYO+ behaves.
-- ============================================================================

/* ====================================================================
   WATCH PROGRESS
   --------------------------------------------------------------------
   Where one viewer got to in one video. It grants nothing — reaching
   5:00 of a film says nothing about whether you may watch 5:01, which
   `purchases` decides — but it is still that person's history, and it
   must not be forgeable. Someone able to write here could have wiped
   or falsified every viewer's resume position on the platform.
   ==================================================================== */
alter table watch_progress enable row level security;

drop policy if exists watch_progress_own_read on watch_progress;
create policy watch_progress_own_read on watch_progress
  for select using (user_id = auth.uid() or auth_role() = 'admin');

drop policy if exists watch_progress_own_insert on watch_progress;
create policy watch_progress_own_insert on watch_progress
  for insert with check (user_id = auth.uid());

drop policy if exists watch_progress_own_update on watch_progress;
create policy watch_progress_own_update on watch_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists watch_progress_own_delete on watch_progress;
create policy watch_progress_own_delete on watch_progress
  for delete using (user_id = auth.uid());

/* ====================================================================
   THE MIGRATION LEDGER
   --------------------------------------------------------------------
   Internal bookkeeping: which migrations have run, and their checksums.
   Nobody outside this server has any business reading it, and deleting
   a row from it would make the runner replay a migration.

   RLS with no policies at all is the correct configuration here — it
   denies everyone who comes through PostgREST, while the owning role
   this API connects as is unaffected.
   ==================================================================== */
alter table _migrations enable row level security;

/* ====================================================================
   THE SWEEP
   --------------------------------------------------------------------
   Every remaining table in `public`, whether or not it existed when
   this was written. Tables already carrying RLS are left exactly as
   they are; this only closes the ones that have none.

   A table that ends up with RLS and no policies is closed to PostgREST
   entirely. That is the safe direction to fail: a missing policy shows
   up as "I cannot see my data" and gets fixed, where a missing RLS
   shows up as nothing at all until somebody's data is gone.
   ==================================================================== */
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'          -- ordinary tables only
       and c.relrowsecurity = false -- and only where it is actually off
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS enabled on public.%', t.relname;
  end loop;
end $$;
