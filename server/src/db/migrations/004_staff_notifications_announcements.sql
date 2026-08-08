-- 004 — password resets we send ourselves, staff activity, announcements
--
-- Three things arrive together because they are one story: the platform now
-- owns its own outbound email (so a reset link actually lands in an inbox),
-- every staff action leaves a trail the admin can read, and the admin can talk
-- back to any slice of the audience.

/* ====================================================================
   PASSWORD RESETS
   --------------------------------------------------------------------
   We issue and verify these ourselves and mail them with our own SMTP,
   because the provider's built-in mailer is rate limited to a couple of
   messages an hour and is unusable for real people.

   Only the SHA-256 of the token is stored. Someone who reads this table
   still cannot construct a working link.
   ==================================================================== */
create table if not exists password_resets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  email        text not null,
  token_hash   text not null unique,
  purpose      text not null default 'reset',   -- 'reset' | 'invite'
  expires_at   timestamptz not null,
  used_at      timestamptz,
  requested_ip text,
  created_at   timestamptz not null default now()
);

create index if not exists password_resets_user_idx on password_resets (user_id, created_at desc);
create index if not exists password_resets_live_idx on password_resets (expires_at) where used_at is null;

/* ====================================================================
   ANNOUNCEMENTS
   --------------------------------------------------------------------
   One row per thing that was said, plus a fan-out into notifications so
   each recipient gets their own read state.
   ==================================================================== */
do $$ begin
  create type announcement_audience as enum (
    'user',           -- one named person
    'creator',        -- one named creator
    'all_users',      -- everyone with the viewer role
    'all_creators',   -- everyone with the creator role
    'sub_admins',     -- the moderation team
    'everyone'        -- the whole platform
  );
exception when duplicate_object then null; end $$;

create table if not exists announcements (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid references profiles(id) on delete set null,
  author_name     text,
  author_email    text,
  author_role     text,
  audience        announcement_audience not null,
  target_user_id  uuid references profiles(id) on delete cascade,
  title           text not null,
  body            text not null,
  recipient_count integer not null default 0,
  created_at      timestamptz not null default now(),

  -- A message addressed to one person must name that person, and a broadcast
  -- must not. Enforced here so a bad payload cannot half-address a message.
  constraint announcement_target_matches_audience check (
    (audience in ('user', 'creator') and target_user_id is not null) or
    (audience not in ('user', 'creator') and target_user_id is null)
  )
);

create index if not exists announcements_recent_idx on announcements (created_at desc);
create index if not exists announcements_author_idx on announcements (author_id, created_at desc);

/* ====================================================================
   NOTIFICATIONS
   --------------------------------------------------------------------
   The admin's window onto everything the team does. Every approval,
   rejection, block, removal and withdrawal decision lands here naming
   the person who did it — full name AND email — so an action can always
   be traced back to a human.
   ==================================================================== */
do $$ begin
  create type notification_kind as enum ('staff_action', 'announcement', 'account', 'system');
exception when duplicate_object then null; end $$;

create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  kind            notification_kind not null default 'system',
  title           text not null,
  body            text,

  -- who did it (denormalised on purpose: the log must still read correctly
  -- after the account is renamed or deleted)
  actor_id        uuid references profiles(id) on delete set null,
  actor_name      text,
  actor_email     text,
  actor_role      text,
  action          text,          -- 'approve' | 'reject' | 'block' | 'delete' | …

  entity_type     text,
  entity_id       text,
  announcement_id uuid references announcements(id) on delete cascade,

  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_inbox_idx  on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id) where read_at is null;
create index if not exists notifications_actor_idx  on notifications (actor_id, created_at desc);

/* ====================================================================
   THE PUBLICATION GUARD, EXTENDED TO STAFF
   --------------------------------------------------------------------
   The client's rule stands: a creator cannot move their own video to
   published, and the database — not the interface — is what stops them.
   Sub-admins are moderators, so they may approve and remove content.
   Nothing else about the rule changes.
   ==================================================================== */
create or replace function is_staff_actor() returns boolean as $$
  select current_actor_role() in ('admin', 'sub_admin');
$$ language sql stable;

create or replace function guard_video_publication() returns trigger as $$
declare
  actor text := current_actor_role();
  sold  integer;
begin
  if tg_op = 'UPDATE' then
    -- Approval and publication are staff-only, full stop.
    if new.review_status = 'approved' and old.review_status is distinct from 'approved'
       and not is_staff_actor() then
      raise exception
        'Only an admin or sub-admin can approve a video for publication (actor: %)', actor
        using errcode = 'insufficient_privilege';
    end if;

    if new.is_published = true and old.is_published = false and not is_staff_actor() then
      raise exception
        'Only an admin or sub-admin can publish a video (actor: %)', actor
        using errcode = 'insufficient_privilege';
    end if;

    -- A video can only be published once it has been approved.
    if new.is_published = true and new.review_status <> 'approved' then
      raise exception 'A video cannot be published before it is approved'
        using errcode = 'check_violation';
    end if;

    -- Removal is a soft delete by staff. The entitlement rows always stay:
    -- someone who paid keeps what they paid for.
    if new.deleted_at is not null and old.deleted_at is null then
      if not is_staff_actor() then
        raise exception 'Only an admin or sub-admin can remove a video (actor: %)', actor
          using errcode = 'insufficient_privilege';
      end if;
      select count(*) into sold from purchases
        where video_id = new.id and status = 'active';
      if sold > 0 then
        null; -- allowed; the purchases survive because this is a soft delete
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.review_status = 'approved' and not is_staff_actor() then
      raise exception 'A video cannot be created in an approved state'
        using errcode = 'insufficient_privilege';
    end if;
    if new.is_published then
      raise exception 'A video cannot be created already published'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$ language plpgsql;

create or replace function block_video_hard_delete() returns trigger as $$
declare sold integer;
begin
  select count(*) into sold from purchases where video_id = old.id and status = 'active';
  if sold > 0 then
    raise exception
      'This video has % permanent purchase(s) and cannot be deleted. Unpublish it instead.', sold
      using errcode = 'restrict_violation';
  end if;
  if not is_staff_actor() then
    raise exception 'Only an admin or sub-admin can delete a video'
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end $$ language plpgsql;

/* ====================================================================
   ACCOUNTS ARE ADMIN-ONLY
   --------------------------------------------------------------------
   A sub-admin must not be able to create staff, change anyone's role, or
   block an account. Putting it in a trigger means it holds even if a
   route is ever wired up carelessly.
   ==================================================================== */
create or replace function guard_account_changes() returns trigger as $$
declare actor text := current_actor_role();
begin
  -- Nobody may hand out a staff role except an admin.
  if tg_op = 'INSERT' then
    if new.role in ('admin', 'sub_admin') and actor <> 'admin' then
      raise exception 'Only an admin can create an admin or sub-admin account (actor: %)', actor
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role and actor <> 'admin' then
    raise exception 'Only an admin can change an account role (actor: %)', actor
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status and actor <> 'admin' then
    raise exception 'Only an admin can change an account status (actor: %)', actor
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$ language plpgsql;

drop trigger if exists profiles_account_guard on profiles;
create trigger profiles_account_guard
  before insert or update on profiles
  for each row execute function guard_account_changes();

/* ====================================================================
   ROW LEVEL SECURITY
   --------------------------------------------------------------------
   The API talks to Postgres as the owner and is unaffected. These
   policies matter for anything reaching the database directly with the
   public key — there, you may read your own notifications and nothing
   else, and password_resets is readable by nobody at all.
   ==================================================================== */
alter table password_resets enable row level security;
alter table notifications   enable row level security;
alter table announcements   enable row level security;

drop policy if exists notifications_own_read on notifications;
create policy notifications_own_read on notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_own_update on notifications;
create policy notifications_own_update on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists announcements_addressed_read on announcements;
create policy announcements_addressed_read on announcements
  for select using (
    exists (select 1 from notifications n
             where n.announcement_id = announcements.id and n.user_id = auth.uid())
  );
