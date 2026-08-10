-- ============================================================================
-- 007 · Advertising, as a real product rather than a placeholder
--
-- A campaign previously held a name, an advertiser and a CPM. That is enough to
-- fill a table and nothing else: there was no advert to play, no window to run
-- it in, no say over where it appeared, and nothing recorded when it did. This
-- migration gives a campaign the things the client asked for — an ad video,
-- dates, placements, targeting — and gives an impression enough detail to be
-- reported on and paid out.
--
-- On money. A CPM is priced per thousand impressions, so a single impression is
-- worth cpm/1000 TZS — usually a fraction of one shilling. Rounding that to a
-- whole number pays a creator 0 for every campaign under TZS 1,500, which is
-- most of them. So impressions are recorded in micro-TZS (millionths), which is
-- exact integer arithmetic, and the whole-shilling `earnings` row is a rollup
-- recomputed from those micro amounts. Nothing is lost to rounding on the way.
-- ============================================================================

do $$ begin
  create type ad_placement as enum ('pre_roll', 'mid_roll', 'post_roll');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------ campaigns
alter table ad_campaigns
  -- The advert itself. Without this there was nothing to show.
  add column if not exists cloudflare_uid    text,
  add column if not exists duration_seconds  integer not null default 0,
  add column if not exists thumbnail_url     text,
  -- When it may run. Null means open-ended in that direction.
  add column if not exists starts_at         timestamptz,
  add column if not exists ends_at           timestamptz,
  -- Where in the video it may appear.
  add column if not exists placements        ad_placement[] not null
                                             default array['pre_roll']::ad_placement[],
  -- Who it may appear against. Empty means "no restriction", which is the
  -- sensible default: a campaign with no targeting should run everywhere
  -- eligible, not nowhere.
  add column if not exists target_video_ids   uuid[] not null default '{}',
  add column if not exists target_categories  text[] not null default '{}',
  add column if not exists target_creator_ids uuid[] not null default '{}',
  add column if not exists skip_after_seconds integer not null default 5,
  add column if not exists notes              text,
  add column if not exists created_by         uuid references profiles(id) on delete set null,
  add column if not exists updated_at         timestamptz not null default now();

create index if not exists ad_campaigns_active_idx on ad_campaigns(active);

-- ---------------------------------------------------------------- impressions
alter table ad_impressions
  add column if not exists placement          ad_placement not null default 'pre_roll',
  -- Denormalised so a payout report never depends on the video still existing.
  add column if not exists creator_id         uuid references profiles(id) on delete set null,
  add column if not exists revenue_micro_tzs  bigint  not null default 0,
  add column if not exists creator_micro_tzs  bigint  not null default 0,
  add column if not exists platform_micro_tzs bigint  not null default 0,
  add column if not exists split_percent      smallint not null default 0,
  add column if not exists seconds_watched    integer not null default 0,
  add column if not exists completed          boolean not null default false,
  -- One playback of one video generates one id. It is what stops a retried
  -- request, or a component that mounts twice, from being paid for twice.
  add column if not exists play_id            uuid;

create unique index if not exists ad_impressions_once_per_play
  on ad_impressions (campaign_id, video_id, placement, play_id)
  where play_id is not null;

create index if not exists ad_impressions_campaign_idx on ad_impressions(campaign_id);
create index if not exists ad_impressions_creator_idx  on ad_impressions(creator_id);

-- ------------------------------------------------------------------- earnings
-- Ad earnings roll up per campaign, per video, per day. Writing one earnings
-- row per impression would bury a creator's sales under thousands of fractions
-- of a shilling; one row a day keeps the ledger readable and still exact.
alter table earnings
  add column if not exists campaign_id uuid references ad_campaigns(id) on delete set null,
  add column if not exists ad_day      date;

create unique index if not exists earnings_ad_rollup
  on earnings (video_id, campaign_id, ad_day)
  where source = 'ad' and ad_day is not null;

-- ------------------------------------------------------------------- settings
alter table platform_settings
  add column if not exists midroll_enabled       boolean not null default true,
  -- A mid-roll only makes sense once a video is long enough to have a middle.
  add column if not exists midroll_after_secs    integer not null default 300,
  add column if not exists postroll_enabled      boolean not null default true,
  add column if not exists share_ad_revenue      boolean not null default true;
