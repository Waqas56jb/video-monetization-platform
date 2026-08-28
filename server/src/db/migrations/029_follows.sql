-- ============================================================================
-- 029 · Follow a creator
--
-- creator_profiles.followers was a number with no graph behind it. The public
-- page can now follow/unfollow, so the rows live here and the integer stays
-- as a denormalised count the admin list already shows.
-- ============================================================================

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  creator_id  uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, creator_id),
  check (follower_id <> creator_id)
);

create index if not exists follows_creator_id_idx on follows (creator_id);

comment on table follows is
  'Viewer follows creator. Count is mirrored onto creator_profiles.followers.';

alter table follows enable row level security;
revoke all on table follows from anon, authenticated, public;

update creator_profiles cp
   set followers = (
     select count(*)::int from follows f where f.creator_id = cp.user_id
   );
