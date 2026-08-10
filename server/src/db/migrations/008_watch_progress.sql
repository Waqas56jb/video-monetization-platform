-- ============================================================================
-- 008 · Where each viewer got to in each video
--
-- The client asked for something specific: after paying, the video must carry on
-- from the second the preview stopped, not start again. The first attempt held
-- that position in the page's memory, which fails the moment anything reloads —
-- and reporting it as done was wrong, because the client tested exactly that.
--
-- A position worth resuming from is not page state. It belongs to the viewer and
-- the video, so it survives a refresh, a sign-out, and moving to another device.
-- That also makes it the honest foundation for "continue watching" later, rather
-- than a special case bolted onto the purchase flow.
--
-- Note what this is NOT: it is not an entitlement. Knowing someone reached 5:00
-- of a film says nothing about whether they may watch 5:01. That decision stays
-- where it belongs, in `purchases`, checked per user and per video.
-- ============================================================================

create table if not exists watch_progress (
  user_id    uuid    not null references profiles(id) on delete cascade,
  video_id   uuid    not null references videos(id)   on delete cascade,
  -- The last position reported, not the furthest reached: someone who starts a
  -- film again from the beginning wants it to resume from the beginning.
  seconds    integer not null default 0 check (seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists watch_progress_user_idx on watch_progress(user_id, updated_at desc);
