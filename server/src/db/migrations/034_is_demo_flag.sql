-- ============================================================================
-- 034 · is_demo — mark seeded/demo content, without deleting it
--
-- The client's launch review found the public "Creators Are Getting Paid"
-- section spotlighting a seeded demo account (`demo.juma@mtonyo.demo`) as its
-- #1 earner, because that query has never excluded demo rows. Deleting the
-- demo catalogue is not the fix: Asha/Juma/Neema are the site's own content
-- used for ongoing testing, and the client still wants a populated section on
-- launch day if real creator earnings are thin. So the demo rows are flagged,
-- not removed, and every public aggregate that reads `earnings`/`purchases`
-- for "social proof" purposes can choose to exclude them.
--
-- `platform_settings.show_demo_content_in_stats` is the one Super Admin
-- switch: ON today (so the section is not empty before real creators have
-- earnings), OFF at launch once real activity exists.
-- ============================================================================

alter table profiles
  add column if not exists is_demo boolean not null default false;

alter table creator_profiles
  add column if not exists is_demo boolean not null default false;

comment on column profiles.is_demo is
  'Seeded demo/fixture account (demo.*@mtonyo.demo), not a real person. '
  'Excluded from public "social proof" aggregates when '
  'platform_settings.show_demo_content_in_stats is false.';
comment on column creator_profiles.is_demo is
  'Mirrors profiles.is_demo for the creator row, so a query can filter on '
  'either table depending on which one it already joins.';

update profiles set is_demo = true where email like '%@mtonyo.demo';
update creator_profiles cp set is_demo = true
  from profiles p where p.id = cp.user_id and p.email like '%@mtonyo.demo';

create index if not exists profiles_is_demo_idx on profiles (is_demo) where is_demo;

alter table platform_settings
  add column if not exists show_demo_content_in_stats boolean not null default true;

comment on column platform_settings.show_demo_content_in_stats is
  'Whether public aggregates (e.g. "Creators Are Getting Paid") may include '
  'is_demo rows. Defaults ON so the section is not empty before real creators '
  'have earnings history; a Super Admin turns it off at launch.';
