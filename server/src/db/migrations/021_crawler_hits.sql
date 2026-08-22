-- ============================================================================
-- 021 · What actually asks us for a link preview
--
-- Every conclusion about WhatsApp so far has come from reproducing its
-- requests with curl. That establishes what we would answer; it does not
-- establish what WhatsApp actually asks, when, or how often. Those are
-- different questions, and the interesting ones are the second kind:
--
--   Does WhatsApp crawl on paste, or on send?
--   Once, or repeatedly?
--   Does it fetch the image every time, or remember it?
--   Do the Android, iOS and Web crawlers behave the same?
--   Is a URL it has seen before crawled again at all?
--
-- None of that can be answered without recording the real thing. This table
-- is that record. It holds no personal data -- a crawler is not a person --
-- and it is written fire-and-forget so a failure here can never affect what
-- the crawler is served.
-- ============================================================================

create table if not exists crawler_hits (
  id          bigserial primary key,
  at          timestamptz not null default now(),

  -- 'html' for the Open Graph document, 'image' for the poster.
  asset       text not null check (asset in ('html', 'image')),
  slug        text,
  query       text,

  -- Kept whole. The A/I/N suffix is the whole point, and truncating it would
  -- throw away the one thing that tells the three clients apart.
  user_agent  text,
  -- Parsed out of it for querying: 'whatsapp-android' | 'whatsapp-ios' |
  -- 'whatsapp-web' | 'facebook' | 'other-bot' | 'human'
  crawler     text,

  status      int,
  ms          int,
  cache       text,
  region      text
);

create index if not exists crawler_hits_recent_idx on crawler_hits (at desc);
create index if not exists crawler_hits_slug_idx   on crawler_hits (slug, at desc);
create index if not exists crawler_hits_crawler_idx on crawler_hits (crawler, at desc);

/* Staff read it; nothing else may. Writes come from the API's own connection,
   which owns the table and bypasses RLS by design. */
alter table crawler_hits enable row level security;

drop policy if exists crawler_hits_staff_read on crawler_hits;
create policy crawler_hits_staff_read on crawler_hits
  for select using (auth_role() in ('admin', 'sub_admin'));
