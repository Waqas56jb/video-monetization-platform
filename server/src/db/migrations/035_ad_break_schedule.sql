-- ============================================================================
-- 035 · Duration-based ad schedule, and the skip delay's own launch settings
--
-- Free + Ads today offers exactly one mid-roll, at the halfway point, on any
-- video longer than `midroll_after_secs`. The fix prompt asks for a real
-- schedule: nothing under 5 minutes, one mid-roll for anything under 20, and
-- a repeating mid-roll every ~10 minutes (capped at 3) for anything longer —
-- with every one of those numbers a Super Admin setting, not a constant.
--
-- Multiple mid-rolls in one playback need a way to tell them apart. Without
-- it, `ad_impressions_once_per_play`'s uniqueness on
-- (campaign_id, video_id, placement, play_id) means the SECOND and THIRD
-- mid-roll of the same campaign in the same sitting would silently no-op as
-- "already recorded" — an advertiser billed once for three deliveries, a
-- creator paid for one. `break_index` is that distinguishing number: 0 for
-- pre-roll and post-roll (there is only ever one of each), 0/1/2 for however
-- many mid-rolls a given play actually offers.
-- ============================================================================

alter table ad_impressions
  add column if not exists break_index smallint not null default 0;

comment on column ad_impressions.break_index is
  'Which mid-roll this was, 0-based, within one playback. Always 0 for '
  'pre-roll/post-roll. Exists so 2-3 same-campaign mid-rolls in one sitting '
  'are billed independently instead of colliding on the once-per-play index.';

drop index if exists ad_impressions_once_per_play;
create unique index if not exists ad_impressions_once_per_play
  on ad_impressions (campaign_id, video_id, placement, play_id, break_index)
  where play_id is not null;

alter table platform_settings
  add column if not exists midroll_long_after_secs integer not null default 1200,
  add column if not exists midroll_gap_secs        integer not null default 600,
  add column if not exists midroll_max_count        smallint not null default 3;

comment on column platform_settings.midroll_after_secs is
  'Videos at or under this length get no mid-roll at all (inclusive boundary, '
  'unchanged from the single-mid-roll rule this replaces). Longer videos, up '
  'to midroll_long_after_secs, get exactly one, at the halfway point.';
comment on column platform_settings.midroll_long_after_secs is
  'At or above this duration, mid-rolls repeat every midroll_gap_secs '
  '(capped at midroll_max_count) instead of a single one at the midpoint.';
comment on column platform_settings.midroll_gap_secs is
  'Spacing between repeating mid-rolls on a long video.';
comment on column platform_settings.midroll_max_count is
  'The most mid-rolls one playback of one video will ever offer, regardless '
  'of how long the file is.';

-- The launch default for the skip delay moves from 5s to 8s, and its bounds
-- tighten from 0-60 to 3-15 (enforced in the admin PATCH route's schema) --
-- 0 meant "cannot be skipped at all", which is no longer an offered state.
update platform_settings set preroll_skip_after_secs = 8
 where id = 1 and preroll_skip_after_secs = 5;
alter table platform_settings alter column preroll_skip_after_secs set default 8;
