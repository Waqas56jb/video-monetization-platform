-- Branded 1200×630 JPEGs WhatsApp/Facebook fetch for a link preview.
-- Built once (approve, or first Watch), then served in milliseconds so a
-- laptop paste does not wait for Sharp + Cloudflare on every share.

create table if not exists share_card_cache (
  slug       text primary key,
  video_id   uuid not null,
  jpeg       bytea not null,
  built_at   timestamptz not null default now(),
  source_key text not null
);

create index if not exists share_card_cache_video_id on share_card_cache (video_id);
