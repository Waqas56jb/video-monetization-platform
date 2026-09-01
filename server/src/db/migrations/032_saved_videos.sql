-- ============================================================================
-- 032 · My List
--
-- The client asked for four rows in My Library. Purchased existed; Continue
-- Watching and Recently Watched can both be derived from `watch_progress`.
-- "My List" cannot be derived from anything — saving a video you have not
-- watched and have not bought is a fact about intention, and nothing on the
-- platform records it. So it needs a table, and this is the whole of it.
--
-- SHAPED LIKE `watch_progress`, deliberately. Same composite primary key, same
-- cascade on both sides, same per-user RLS, same PostgREST revoke. A viewer's
-- list is their own history in exactly the sense a resume position is: it grants
-- nothing — saving a paid film does not let you watch it, `purchases` decides
-- that, per user and per video, every time — but it is still theirs, and it must
-- not be readable or forgeable by anybody else.
--
-- No counter anywhere. 006 and 031 are both migrations that exist because a
-- denormalised count drifted from the rows behind it; there is no reason to
-- introduce a third. Nothing on the platform displays "saved by N people", and
-- if it ever does it can count the rows.
-- ============================================================================

create table if not exists saved_videos (
  user_id    uuid not null references profiles(id) on delete cascade,
  video_id   uuid not null references videos(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

comment on table saved_videos is
  'A viewer''s own list. Grants nothing: entitlement is decided by purchases. '
  'Same shape and same policies as watch_progress.';

-- "My list, newest first" is the only way this is ever read.
create index if not exists saved_videos_user_idx on saved_videos(user_id, created_at desc);

/* ----------------------------------------------------------------- lock it
   026's event trigger already enables RLS and revokes anon/authenticated on any
   new public table. This repeats both explicitly rather than relying on it: the
   trigger is a safety net for tables created outside migrations, and a table
   whose protection is only visible in another file is a table somebody will
   later assume is unprotected — or, worse, assume is protected when the trigger
   has been dropped.                                                          */
alter table saved_videos enable row level security;
revoke all on table saved_videos from anon, authenticated, public;

drop policy if exists saved_videos_own_read on saved_videos;
create policy saved_videos_own_read on saved_videos
  for select using (user_id = auth.uid() or auth_role() = 'admin');

drop policy if exists saved_videos_own_insert on saved_videos;
create policy saved_videos_own_insert on saved_videos
  for insert with check (user_id = auth.uid());

drop policy if exists saved_videos_own_update on saved_videos;
create policy saved_videos_own_update on saved_videos
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists saved_videos_own_delete on saved_videos;
create policy saved_videos_own_delete on saved_videos
  for delete using (user_id = auth.uid());
