-- 047 · Homepage sponsor ads, managed by the Super Admin (Milestone 3).
--
-- A banner on the homepage: sponsor, title, optional tagline and image, and
-- where a click goes. Shown only while active and inside its dates, in the
-- admin's order. Impressions and clicks are counted for the sponsor report.
-- Separate from ad_campaigns, which are video adverts inside the player.

create table if not exists home_sponsors (
  id          uuid primary key default gen_random_uuid(),
  sponsor     text not null check (char_length(sponsor) between 1 and 80),
  title       text not null check (char_length(title) between 1 and 80),
  tagline     text check (tagline is null or char_length(tagline) <= 160),
  cta         text check (cta is null or char_length(cta) <= 30),
  image_url   text,
  click_url   text not null check (click_url ~ '^https?://'),
  active      boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  position    smallint not null default 0,
  impressions integer not null default 0,
  clicks      integer not null default 0,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint home_sponsors_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists home_sponsors_live_idx on home_sponsors (active, position, created_at desc);

-- Reached only through the API, like every other table (see 025 / 026).
alter table home_sponsors enable row level security;
revoke all on table home_sponsors from anon, authenticated, public;
