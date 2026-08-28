-- ============================================================================
-- 027 · Watch-path indexes
--
-- GET /playback/:id/playback looked up videos with `id::text = $1 OR slug = …`
-- which could not use videos_pkey and fell back to scanning live rows via
-- videos_public_idx. Slug already has a unique index (videos_slug_key); this
-- partial covers the live-row filter the watch query always applies.
--
-- purchases(user_id, video_id) WHERE status = 'active' already exists as
-- purchases_unique_active (001). Recreated here so a database that skipped
-- that unique still gets the lookup index. watch_progress PK is (user_id,
-- video_id) and is enough for the resume join.
-- ============================================================================

create index if not exists videos_live_slug_idx
  on videos (slug)
  where deleted_at is null;

create unique index if not exists purchases_unique_active
  on purchases (user_id, video_id)
  where status = 'active';
