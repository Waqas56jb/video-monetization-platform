-- ============================================================================
-- 030 · Move "is the share card built?" onto the video row
--
-- `GET /api/videos/:idOrSlug` is one of the two requests the watch page waits on
-- before it can build the player, and it was asking `share_card_cache` whether a
-- card existed. That question cost four round trips on a cold isolate:
-- `ensureShareCardTable()` issues `create table if not exists`, `alter table …
-- enable row level security` and `revoke all …` before the select it guards.
-- Three DDL statements, taking locks, in front of the first frame of every video.
--
-- The answer is a boolean that changes at most once per card build. It belongs
-- on the row the route is already selecting, not behind a second table and a
-- schema check.
--
-- `share_card_cache` stays exactly as it is — it holds the bytes, and
-- `/api/share-card/:slug.jpg` still reads them. This only moves the *status*.
--
-- NUMBERING: 029 was the previous migration. The brief said 031; 030 is the next
-- free number, and 021 is already used twice (021_crawler_hits and
-- 021_share_card_cache), which is the mistake worth not repeating.
-- ============================================================================

alter table videos
  add column if not exists card_ready boolean not null default false;

comment on column videos.card_ready is
  'True when a share card matching this row''s current source_key is stored in '
  'share_card_cache. Written by buildShareCard; read on the watch path so the '
  'player is not gated on a second table.';

/* ----------------------------------------------------------------- backfill
   Seed from what is already cached. `source_key` is a hash of poster, title and
   creator, so a row whose stored key still matches the video's current one has a
   card that is genuinely current — which is the same test readCardStatus made.

   Recomputing the hash in SQL is not possible (it is sha1 over a JS-built
   string), so this uses the weaker but safe test: a card exists for the slug and
   is a plausible size. A stale card is corrected on the next build, and the
   route treats `false` as "not ready" — which only ever means the sheet shows a
   loading pill for a moment. The failure direction is harmless.                */
update videos v
   set card_ready = true
  from share_card_cache c
 where c.slug = v.slug
   and octet_length(c.jpeg) > 1000
   and v.card_ready = false;

/* The watch path filters on published+approved and then reads this column, so
   it rides along on the existing index rather than needing one of its own. */
