-- ============================================================================
-- 038 · Ad click tracking, and the two pacing settings Sep-09 feedback asked for
--
-- Three independent additions, from report2.txt §4/§5:
--
-- 1. `ad_clicks` — there is no click-through anywhere on an ad today (the
--    overlay is watch-only). This is the table a future clickable CTA
--    records into; `ad_campaigns.click_url` is what makes a campaign
--    clickable at all. Both are additive and inert until the overlay CTA
--    that uses them ships (a later pass) — a campaign with no click_url
--    renders exactly as it does today.
--
-- 2. `platform_settings.preroll_target_seconds` — the pre-roll's own target
--    watched duration. Did not exist as a concept at all: the only related
--    setting was `preroll_skip_after_secs` (when Skip may appear), not how
--    much of the ad a viewer is expected to see.
--
-- 3. `platform_settings.midroll_position_pct` — the single-mid-roll branch
--    of `midrollSchedule()` (services/ads.js) has always placed its one
--    break at the literal midpoint, `duration / 2`, with nothing to
--    configure. This makes that fraction a setting instead of a constant.
-- ============================================================================

create table if not exists ad_clicks (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  video_id    uuid not null references videos(id) on delete cascade,
  user_id     uuid references profiles(id) on delete set null,
  play_id     uuid,
  created_at  timestamptz not null default now()
);

comment on table ad_clicks is
  'One row per verified click on an ad''s click-through CTA. "Verified" is '
  'enforced in the recording route, not here: a click is only ever recorded '
  'against a play_id that already has a genuine ad_impressions row for the '
  'same campaign, the same discipline recordImpression() already applies '
  'to billing — never merely because the overlay was tapped mid-load.';

create index if not exists ad_clicks_campaign_idx on ad_clicks (campaign_id);
create index if not exists ad_clicks_video_idx    on ad_clicks (video_id);
create index if not exists ad_clicks_play_idx     on ad_clicks (play_id);

/* ----------------------------------------------------------------- lock it
   Same reasoning as 032/033/037: RLS stated here explicitly rather than
   relying only on 026's event-trigger safety net. Every write goes through
   the server's service role, exactly like ad_impressions today — no
   client-side RLS write path is granted. */
alter table ad_clicks enable row level security;
revoke all on table ad_clicks from anon, authenticated, public;

alter table ad_campaigns
  add column if not exists click_url text;

comment on column ad_campaigns.click_url is
  'Optional click-through destination. Null (the default for every campaign '
  'today) means the ad stays watch-only, exactly as it has always behaved — '
  'this column alone changes nothing until the overlay CTA that reads it '
  'ships. Validated as a full URL at the admin PATCH route, not here.';

alter table platform_settings
  add column if not exists preroll_target_seconds integer not null default 10
    check (preroll_target_seconds between 5 and 60),
  add column if not exists midroll_position_pct    smallint not null default 70
    check (midroll_position_pct between 20 and 90);

comment on column platform_settings.preroll_target_seconds is
  'How much of the pre-roll a viewer is expected to watch before it counts '
  'as delivered, in seconds. A creative longer than this auto-completes at '
  'the target (billable, same as any other genuine completion); a shorter '
  'creative still just ends on its own. Independent of preroll_skip_after_secs, '
  'which only controls when the Skip button may appear.';
comment on column platform_settings.midroll_position_pct is
  'Where the single mid-roll lands on a video shorter than '
  'midroll_long_after_secs, as a percentage of the video''s own duration. '
  'Replaces the previous hard-coded midpoint (50%); midrollSchedule() reads '
  'this instead of dividing by 2.';
