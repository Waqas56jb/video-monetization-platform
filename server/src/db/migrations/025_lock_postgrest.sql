-- ============================================================================
-- 025 · Close PostgREST: RLS on every public table, no GRANT to anon
--
-- Supabase Security Advisor: "Table publicly accessible" / RLS disabled.
-- The table that tripped it is `share_card_cache` (021 created it after the
-- 011 sweep, and never enabled RLS). Default privileges on this project also
-- GRANT ALL to `anon` and `authenticated` on every new public table, including
-- TRUNCATE, which RLS does not cover.
--
-- The browser never talks to PostgREST. The React apps call the Express API,
-- which connects as the table owner (DATABASE_URL) and bypasses RLS unless
-- FORCE is set. We do not FORCE RLS: that would break the API. RLS + REVOKE
-- are the wall against anyone who only has the project URL and the publishable
-- anon key.
--
-- This migration:
--   1. Enables RLS on every public table that still lacks it (named: share_card_cache).
--   2. Revokes table/sequence privileges from anon, authenticated, and PUBLIC.
--   3. Stops postgres / supabase_admin from auto-granting those roles on new tables.
--
-- Existing policies stay as defence in depth if grants are ever restored.
-- ============================================================================

/* The table the Advisor named, then every other public table still open. */
alter table if exists share_card_cache enable row level security;

do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity = false
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS enabled on public.%', t.relname;
  end loop;
end $$;

/* Privileges. TRUNCATE is not filtered by RLS; these GRANTs must go. */
revoke all on all tables in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;

/* Future CREATE TABLE must not re-grant the hole 021 opened. */
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, public;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, public;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, public;

do $$
begin
  execute $sql$
    alter default privileges for role supabase_admin in schema public
      revoke all on tables from anon, authenticated, public
  $sql$;
  execute $sql$
    alter default privileges for role supabase_admin in schema public
      revoke all on sequences from anon, authenticated, public
  $sql$;
  execute $sql$
    alter default privileges for role supabase_admin in schema public
      revoke all on functions from anon, authenticated, public
  $sql$;
exception
  when insufficient_privilege then
    raise notice 'could not alter supabase_admin default privileges (ok if current role cannot)';
  when undefined_object then
    raise notice 'supabase_admin role missing; skipped its default privileges';
end $$;
