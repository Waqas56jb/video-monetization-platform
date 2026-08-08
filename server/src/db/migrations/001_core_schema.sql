-- =========================================================================
-- MTONYO+ core schema
--
-- Supabase is the permanent system of record: creator ownership, the
-- Cloudflare video id, price, access type, premiere dates, purchases, views,
-- earnings and ad eligibility all live here. Cloudflare Stream only holds the
-- media files.
-- =========================================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ enums
do $$ begin
  create type user_role as enum ('viewer', 'creator', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_status as enum ('active', 'blocked', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  -- ppv_forever   : stays paid until an admin/creator changes it
  -- paid_premiere : paid for a per-video window, then auto free-with-ads
  -- free_with_ads : free to watch, monetised by pre-roll ads
  create type access_type as enum ('ppv_forever', 'paid_premiere', 'free_with_ads');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('draft', 'pending_review', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type video_state as enum ('processing', 'ready', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'success', 'failed', 'cancelled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('mpesa', 'airtel');
exception when duplicate_object then null; end $$;

do $$ begin
  create type purchase_status as enum ('active', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type earning_source as enum ('sale', 'ad');
exception when duplicate_object then null; end $$;

do $$ begin
  create type withdrawal_status as enum ('pending', 'paid', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deletion_status as enum ('pending', 'unpublished', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------- profiles
-- One row per auth.users row. Role decides what the app exposes; a single
-- account can watch and create, which is why this is one flag not two tables.
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  phone         text,
  role          user_role not null default 'viewer',
  status        account_status not null default 'active',
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists profiles_role_idx on profiles(role);
create index if not exists profiles_status_idx on profiles(status);

-- Extra fields that only matter once someone starts selling.
create table if not exists creator_profiles (
  user_id               uuid primary key references profiles(id) on delete cascade,
  display_name          text not null,
  bio                   text,
  location              text,
  verified              boolean not null default false,
  -- null = use the platform default; set to override this creator's split
  revenue_split_percent smallint check (revenue_split_percent between 0 and 100),
  followers             integer not null default 0,
  payout_phone          text,
  payout_method         payment_method,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------- videos
create table if not exists videos (
  id                     uuid primary key default gen_random_uuid(),
  creator_id             uuid not null references profiles(id) on delete cascade,
  slug                   text unique,

  title                  text not null,
  description            text,
  category               text,

  -- Cloudflare Stream holds the media; these are the handles back to it.
  cloudflare_uid         text unique,
  preview_uid            text,          -- free-preview clip (public)
  social_clip_uid        text,          -- 60s promo clip for sharing
  thumbnail_url          text,
  duration_seconds       integer,
  state                  video_state not null default 'processing',

  -- monetisation
  access_type            access_type not null default 'ppv_forever',
  price_tzs              integer not null default 0 check (price_tzs >= 0),
  free_preview_seconds   integer not null default 300 check (free_preview_seconds >= 0),

  -- Paid Premiere is per video, never a platform-wide number. The creator
  -- proposes a duration and an admin may change it before approving.
  premiere_days          integer check (premiere_days > 0),
  premiere_started_at    timestamptz,
  premiere_ends_at       timestamptz,

  -- moderation: nothing is public until an admin approves it
  review_status          review_status not null default 'draft',
  rejection_reason       text,
  reviewed_by            uuid references profiles(id),
  reviewed_at            timestamptz,
  submitted_at           timestamptz,

  is_published           boolean not null default false,
  published_at           timestamptz,

  ads_enabled            boolean not null default false,
  views                  integer not null default 0,
  paid_unlocks           integer not null default 0,

  -- admin-only soft delete; buyers keep their access record either way
  deleted_at             timestamptz,
  deleted_by             uuid references profiles(id),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists videos_creator_idx on videos(creator_id);
create index if not exists videos_review_idx on videos(review_status);
create index if not exists videos_public_idx on videos(is_published, deleted_at);
create index if not exists videos_premiere_idx on videos(access_type, premiere_ends_at)
  where access_type = 'paid_premiere';

-- A creator may only ask; an admin decides. Protects people who already paid.
create table if not exists video_deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid not null references videos(id) on delete cascade,
  requested_by  uuid not null references profiles(id),
  reason        text,
  status        deletion_status not null default 'pending',
  decided_by    uuid references profiles(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);
create index if not exists deletion_requests_status_idx on video_deletion_requests(status);

-- --------------------------------------------------------------- payments
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  video_id       uuid not null references videos(id) on delete cascade,
  provider       text not null default 'sandbox',
  provider_ref   text,
  amount_tzs     integer not null check (amount_tzs >= 0),
  method         payment_method not null,
  phone          text not null,
  status         payment_status not null default 'pending',
  failure_reason text,
  raw_callback   jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index if not exists payments_user_idx on payments(user_id);
create index if not exists payments_video_idx on payments(video_id);
create index if not exists payments_status_idx on payments(status);
create unique index if not exists payments_provider_ref_key on payments(provider, provider_ref)
  where provider_ref is not null;

-- -------------------------------------------------------------- purchases
-- The entitlement. One active row per (user, video) — bought once, kept for
-- good, and unaffected by logging out or changing device.
create table if not exists purchases (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  video_id           uuid not null references videos(id) on delete cascade,
  payment_id         uuid references payments(id),
  amount_tzs         integer not null,
  split_percent      smallint not null,
  creator_amount_tzs integer not null,
  platform_amount_tzs integer not null,
  status             purchase_status not null default 'active',
  purchased_at       timestamptz not null default now()
);
create unique index if not exists purchases_unique_active
  on purchases(user_id, video_id) where status = 'active';
create index if not exists purchases_user_idx on purchases(user_id);
create index if not exists purchases_video_idx on purchases(video_id);

-- --------------------------------------------------------------- earnings
create table if not exists earnings (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null references profiles(id) on delete cascade,
  video_id       uuid references videos(id) on delete set null,
  purchase_id    uuid references purchases(id) on delete set null,
  source         earning_source not null,
  gross_tzs      integer not null,
  creator_tzs    integer not null,
  platform_tzs   integer not null,
  split_percent  smallint not null,
  created_at     timestamptz not null default now()
);
create index if not exists earnings_creator_idx on earnings(creator_id);
create index if not exists earnings_video_idx on earnings(video_id);

create table if not exists withdrawals (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references profiles(id) on delete cascade,
  amount_tzs    integer not null check (amount_tzs > 0),
  method        payment_method not null,
  phone         text not null,
  status        withdrawal_status not null default 'pending',
  note          text,
  requested_at  timestamptz not null default now(),
  decided_by    uuid references profiles(id),
  decided_at    timestamptz
);
create index if not exists withdrawals_creator_idx on withdrawals(creator_id);
create index if not exists withdrawals_status_idx on withdrawals(status);

-- ------------------------------------------------------------------- ads
create table if not exists ad_campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  advertiser  text,
  active      boolean not null default true,
  cpm_tzs     integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists ad_impressions (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references videos(id) on delete cascade,
  campaign_id uuid references ad_campaigns(id) on delete set null,
  user_id     uuid references profiles(id) on delete set null,
  revenue_tzs integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists ad_impressions_video_idx on ad_impressions(video_id);

-- ---------------------------------------------------------------- views
create table if not exists video_views (
  id              uuid primary key default gen_random_uuid(),
  video_id        uuid not null references videos(id) on delete cascade,
  user_id         uuid references profiles(id) on delete set null,
  seconds_watched integer not null default 0,
  reached_paywall boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists video_views_video_idx on video_views(video_id);

-- -------------------------------------------------------------- settings
-- Single row. The revenue split lives here so it is configurable rather than
-- hard-coded, with per-creator overrides on creator_profiles.
create table if not exists platform_settings (
  id                        smallint primary key default 1 check (id = 1),
  creator_split_percent     smallint not null default 70 check (creator_split_percent between 0 and 100),
  min_video_price_tzs       integer not null default 200,
  min_withdrawal_tzs        integer not null default 50000,
  default_preview_seconds   integer not null default 300,
  default_premiere_days     integer not null default 30,
  registrations_open        boolean not null default true,
  require_creator_approval  boolean not null default true,
  auto_premiere_to_free     boolean not null default true,
  maintenance_mode          boolean not null default false,
  preroll_enabled           boolean not null default true,
  preroll_skip_after_secs   integer not null default 5,
  ads_on_expired_premieres  boolean not null default true,
  share_ad_revenue          boolean not null default true,
  updated_at                timestamptz not null default now()
);
insert into platform_settings (id) values (1) on conflict (id) do nothing;

-- -------------------------------------------------------------- audit log
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   text,
  detail      jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_actor_idx on audit_log(actor_id);
create index if not exists audit_log_created_idx on audit_log(created_at desc);

-- ------------------------------------------------------- updated_at touch
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['profiles','creator_profiles','videos','payments','platform_settings']
  loop
    execute format(
      'drop trigger if exists %I_touch on %I; create trigger %I_touch before update on %I
       for each row execute function touch_updated_at()', t, t, t, t);
  end loop;
end $$;
