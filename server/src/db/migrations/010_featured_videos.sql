-- ============================================================================
-- 010 · Editorial control over the front page
--
-- The client's list of what an administrator must be able to run included
-- "Featured/Trending", and only half of it existed. Trending is computed —
-- views and purchases over the last fortnight, with a purchase weighted five
-- times a view — and nobody can steer it, which is the point of it.
--
-- Featured is the other half: the deliberate choice. A new creator's first
-- release, or the film the platform wants on the front page this week, has no
-- fortnight of history behind it and would never surface on merit alone. A flag
-- is the smallest honest way to say "put this first" without corrupting the
-- measurement that Trending is.
--
-- Kept separate from `is_published` on purpose. Featuring is not publishing:
-- unfeaturing something must never take it off the platform, and a video that
-- is unpublished must not reappear on the homepage because a flag was left set.
-- The public query still requires published + approved + not deleted.
-- ============================================================================

alter table videos add column if not exists featured boolean not null default false;

-- The homepage asks for "featured, published, not deleted, newest first" on
-- every visit. A partial index costs nothing on the rows that are not featured,
-- which is nearly all of them.
create index if not exists videos_featured_idx
  on videos (featured, published_at desc)
  where featured = true and is_published = true and deleted_at is null;
