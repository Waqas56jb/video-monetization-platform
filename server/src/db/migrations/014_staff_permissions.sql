-- ============================================================================
-- 014 · Sub-admins stop being one role and start being a set of permissions
--
-- Until now "sub_admin" was a single switch. It let somebody into everything
-- except accounts, which is a reasonable default and a poor answer to the
-- client's actual requirement: a person brought in to review uploads should not
-- also be able to decide withdrawals, pause advertising campaigns or change the
-- platform's revenue split.
--
-- The design deliberately mirrors what is already here rather than inventing a
-- second authorisation system:
--
--   · The check is server-side, in middleware, exactly like requireAdmin().
--   · It is ALSO enforced by a trigger, exactly like guard_account_changes(),
--     so a route wired up carelessly still cannot get past it.
--   · An administrator is never filtered. Their role is the permission.
--
-- A sub-admin with no grants can do nothing but read their own inbox. That is
-- the safe direction to fail: a missing permission shows up as "I cannot open
-- this" and gets fixed in a minute, where a permission granted by default shows
-- up as somebody having approved a withdrawal they should never have seen.
-- ============================================================================

do $$ begin
  create type staff_module as enum (
    'users',          -- view and change accounts        (super-admin only in practice)
    'creators',       -- verify, per-creator splits      (super-admin only in practice)
    'videos',         -- publish, unpublish, remove, feature
    'review',         -- the approval queue
    'moderation',     -- reports and removal requests
    'announcements',  -- broadcasting
    'payments',       -- transactions and refunds
    'withdrawals',    -- payout decisions
    'revenue',        -- platform revenue and splits
    'ads',            -- campaigns
    'settings',       -- platform configuration
    'audit'           -- the permanent record
  );
exception when duplicate_object then null; end $$;

create table if not exists staff_permissions (
  user_id    uuid not null references profiles(id) on delete cascade,
  module     staff_module not null,
  granted_by uuid references profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, module)
);

create index if not exists staff_permissions_user_idx on staff_permissions (user_id);

/* ====================================================================
   ONLY AN ADMINISTRATOR GRANTS PERMISSIONS

   The two attacks this closes are the obvious ones, and both are worth
   naming: a sub-admin granting themselves a module they were not given,
   and a sub-admin granting one to somebody else.

   Enforced here rather than only in a route, so it holds regardless of
   how the write arrives — including directly through PostgREST with the
   public key, where no middleware runs at all.
   ==================================================================== */
create or replace function guard_staff_permissions() returns trigger as $$
declare actor text := current_actor_role();
begin
  if actor <> 'admin' then
    raise exception
      'Only an administrator can change staff permissions (actor: %)', actor
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$ language plpgsql;

drop trigger if exists staff_permissions_guard on staff_permissions;
create trigger staff_permissions_guard
  before insert or update or delete on staff_permissions
  for each row execute function guard_staff_permissions();

/* ====================================================================
   ROW LEVEL SECURITY

   A staff member may see what they themselves hold — an interface that
   cannot read its own permissions cannot grey out what it must not
   offer. Nobody may see anyone else's, and nobody writes through here
   at all; grants go through the API, which connects as the owner.
   ==================================================================== */
alter table staff_permissions enable row level security;

drop policy if exists staff_permissions_own_read on staff_permissions;
create policy staff_permissions_own_read on staff_permissions
  for select using (user_id = auth.uid() or auth_role() = 'admin');

/* ====================================================================
   EXISTING SUB-ADMINS KEEP WHAT THEY HAD

   Anyone already doing this job was hired to do it, and waking up to
   find they can no longer open the review queue is a bug we would have
   introduced. They are granted the modules `requireStaff()` already let
   them into — everything except accounts, which was always admin-only.

   New sub-admins start with nothing and are given what they need.
   ==================================================================== */
insert into staff_permissions (user_id, module)
select p.id, m.module
  from profiles p
  cross join (
    select unnest(array[
      'videos','review','moderation','announcements',
      'payments','withdrawals','ads','audit'
    ]::staff_module[]) as module
  ) m
 where p.role = 'sub_admin'
on conflict (user_id, module) do nothing;
