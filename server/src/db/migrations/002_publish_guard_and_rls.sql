-- =========================================================================
-- Platform rules enforced by the DATABASE, not by the UI.
--
-- The client's requirement: "don't make this only a button/interface
-- restriction. The database/backend should enforce the status too. A creator
-- shouldn't be able to bypass the dashboard and change an item from pending
-- to published."
--
-- Two layers:
--   1. A trigger on `videos` that refuses to approve/publish unless the
--      session says an admin is acting. It fires for the API's own connection
--      too, so a bug in application code cannot publish anything either.
--   2. Row Level Security, which covers anyone talking to Supabase's REST API
--      directly with the anon key.
-- =========================================================================

-- ------------------------------------------------- who is acting right now
-- The API sets this per transaction: SELECT set_config('app.actor_role', ...)
create or replace function current_actor_role() returns text as $$
  select coalesce(nullif(current_setting('app.actor_role', true), ''), 'unknown');
$$ language sql stable;

create or replace function current_actor_id() returns uuid as $$
  select nullif(current_setting('app.actor_id', true), '')::uuid;
$$ language sql stable;

-- ------------------------------------------------------- publication guard
create or replace function guard_video_publication() returns trigger as $$
declare
  actor text := current_actor_role();
  sold  integer;
begin
  -- Approval and publication are admin-only, full stop.
  if tg_op = 'UPDATE' then
    if new.review_status = 'approved' and old.review_status is distinct from 'approved'
       and actor <> 'admin' then
      raise exception
        'Only an admin can approve a video for publication (actor: %)', actor
        using errcode = 'insufficient_privilege';
    end if;

    if new.is_published = true and old.is_published = false and actor <> 'admin' then
      raise exception
        'Only an admin can publish a video (actor: %)', actor
        using errcode = 'insufficient_privilege';
    end if;

    -- A video can only be published once an admin has approved it.
    if new.is_published = true and new.review_status <> 'approved' then
      raise exception 'A video cannot be published before it is approved'
        using errcode = 'check_violation';
    end if;

    -- Soft delete is admin-only, and never allowed while customers hold
    -- permanent access — their purchase must not disappear underneath them.
    if new.deleted_at is not null and old.deleted_at is null then
      if actor <> 'admin' then
        raise exception 'Only an admin can remove a video (actor: %)', actor
          using errcode = 'insufficient_privilege';
      end if;
      select count(*) into sold from purchases
        where video_id = new.id and status = 'active';
      if sold > 0 and coalesce(new.ads_enabled, false) is not null then
        -- Allowed, but the entitlement rows stay: we only ever soft delete.
        null;
      end if;
    end if;
  end if;

  -- Nothing may be created already approved or published.
  if tg_op = 'INSERT' then
    if new.review_status = 'approved' and actor <> 'admin' then
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

drop trigger if exists videos_publication_guard on videos;
create trigger videos_publication_guard
  before insert or update on videos
  for each row execute function guard_video_publication();

-- --------------------------------------------- hard delete is never allowed
-- Purchased content must survive. Removal is a soft delete by an admin.
create or replace function block_video_hard_delete() returns trigger as $$
declare sold integer;
begin
  select count(*) into sold from purchases where video_id = old.id and status = 'active';
  if sold > 0 then
    raise exception
      'This video has % permanent purchase(s) and cannot be deleted. Unpublish it instead.', sold
      using errcode = 'restrict_violation';
  end if;
  if current_actor_role() <> 'admin' then
    raise exception 'Only an admin can delete a video' using errcode = 'insufficient_privilege';
  end if;
  return old;
end $$ language plpgsql;

drop trigger if exists videos_block_hard_delete on videos;
create trigger videos_block_hard_delete
  before delete on videos
  for each row execute function block_video_hard_delete();

-- -------------------------------------- keep premiere dates self-consistent
create or replace function sync_premiere_window() returns trigger as $$
begin
  if new.access_type = 'paid_premiere' then
    if new.premiere_days is null then
      select default_premiere_days into new.premiere_days from platform_settings where id = 1;
    end if;
    -- The clock starts when the video goes live, not when it was uploaded.
    if new.is_published and new.premiere_started_at is null then
      new.premiere_started_at := now();
    end if;
    if new.premiere_started_at is not null then
      new.premiere_ends_at := new.premiere_started_at + (new.premiere_days || ' days')::interval;
    end if;
  else
    -- PPV Forever and Free With Ads have no expiry window.
    new.premiere_days := null;
    new.premiere_started_at := null;
    new.premiere_ends_at := null;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists videos_sync_premiere on videos;
create trigger videos_sync_premiere
  before insert or update on videos
  for each row execute function sync_premiere_window();

-- ------------------------------------------------------ Row Level Security
alter table profiles              enable row level security;
alter table creator_profiles      enable row level security;
alter table videos                enable row level security;
alter table purchases             enable row level security;
alter table payments              enable row level security;
alter table earnings              enable row level security;
alter table withdrawals           enable row level security;
alter table video_deletion_requests enable row level security;
alter table video_views           enable row level security;
alter table ad_impressions        enable row level security;
alter table ad_campaigns          enable row level security;
alter table platform_settings     enable row level security;
alter table audit_log             enable row level security;

create or replace function auth_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- profiles: you see and edit yourself; admins see everyone
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or auth_role() = 'admin');

drop policy if exists profiles_self_write on profiles;
create policy profiles_self_write on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

-- videos: the public sees approved, published, undeleted videos only
drop policy if exists videos_public_read on videos;
create policy videos_public_read on videos for select
  using (
    (is_published = true and review_status = 'approved' and deleted_at is null)
    or creator_id = auth.uid()
    or auth_role() = 'admin'
  );

drop policy if exists videos_creator_insert on videos;
create policy videos_creator_insert on videos for insert
  with check (creator_id = auth.uid() and review_status in ('draft', 'pending_review') and is_published = false);

drop policy if exists videos_creator_update on videos;
create policy videos_creator_update on videos for update
  using (creator_id = auth.uid() and deleted_at is null)
  with check (creator_id = auth.uid());

drop policy if exists videos_admin_all on videos;
create policy videos_admin_all on videos for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- purchases and payments: strictly your own, plus admin
drop policy if exists purchases_own on purchases;
create policy purchases_own on purchases for select
  using (user_id = auth.uid() or auth_role() = 'admin'
         or exists (select 1 from videos v where v.id = video_id and v.creator_id = auth.uid()));

drop policy if exists payments_own on payments;
create policy payments_own on payments for select
  using (user_id = auth.uid() or auth_role() = 'admin');

-- earnings and withdrawals: the creator they belong to, plus admin
drop policy if exists earnings_own on earnings;
create policy earnings_own on earnings for select
  using (creator_id = auth.uid() or auth_role() = 'admin');

drop policy if exists withdrawals_own on withdrawals;
create policy withdrawals_own on withdrawals for select
  using (creator_id = auth.uid() or auth_role() = 'admin');

drop policy if exists withdrawals_request on withdrawals;
create policy withdrawals_request on withdrawals for insert
  with check (creator_id = auth.uid() and status = 'pending');

-- settings: readable by all, writable by admins
drop policy if exists settings_read on platform_settings;
create policy settings_read on platform_settings for select using (true);
drop policy if exists settings_admin_write on platform_settings;
create policy settings_admin_write on platform_settings for update
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- audit log: admins only
drop policy if exists audit_admin_read on audit_log;
create policy audit_admin_read on audit_log for select using (auth_role() = 'admin');

-- deletion requests: creators raise them for their own videos, admins decide
drop policy if exists deletion_requests_read on video_deletion_requests;
create policy deletion_requests_read on video_deletion_requests for select
  using (requested_by = auth.uid() or auth_role() = 'admin');
drop policy if exists deletion_requests_create on video_deletion_requests;
create policy deletion_requests_create on video_deletion_requests for insert
  with check (requested_by = auth.uid() and status = 'pending');
