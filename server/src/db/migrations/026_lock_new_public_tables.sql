-- ============================================================================
-- 026 · New public tables must not reopen PostgREST
--
-- 025 locked existing tables and postgres's default privileges. Tables created
-- by supabase_admin (SQL editor / some dashboard actions) still default-GRANT
-- ALL to anon. This event trigger enables RLS and revokes those roles on every
-- new public table, including a runtime CREATE TABLE that forgets the lock.
-- ============================================================================

create or replace function public.lock_new_public_table()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  obj record;
begin
  for obj in
    select object_identity
      from pg_event_trigger_ddl_commands()
     where command_tag = 'CREATE TABLE'
       and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
    execute format(
      'revoke all on table %s from anon, authenticated, public',
      obj.object_identity
    );
    raise notice 'locked new public table %', obj.object_identity;
  end loop;
end;
$$;

drop event trigger if exists lock_new_public_tables;
create event trigger lock_new_public_tables
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.lock_new_public_table();

revoke all on function public.lock_new_public_table() from public, anon, authenticated;
