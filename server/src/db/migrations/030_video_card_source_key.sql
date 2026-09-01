-- ============================================================================
-- 030 · Move "which share card is built?" onto the video row
--
-- `GET /api/videos/:idOrSlug` is one of the two requests the watch page waits on
-- before it can build the player, and it was asking `share_card_cache` whether a
-- card existed. That question cost four round trips on a cold isolate:
-- `ensureShareCardTable()` issues `create table if not exists`, `alter table …
-- enable row level security` and `revoke all …` before the select it guards.
-- Three DDL statements, taking locks, in front of the first frame of every video.
--
-- The answer belongs on the row the route is already selecting, not behind a
-- second table and a schema check.
--
-- It stores the SOURCE KEY, not a boolean. `readCardStatus` compared the stored
-- key against the video's current one, so a card built before a title or poster
-- changed reported itself as stale and was rebuilt. A boolean cannot express
-- that: nothing ever sets it back to false, so a card whose source drifted would
-- claim to be ready for ever and never self-heal. Same round-trip cost, and the
-- test that was actually being made survives.
--
-- `share_card_cache` stays exactly as it is — it holds the bytes, and
-- `/api/share-card/:slug.jpg` still reads them. This only moves the *status*.
--
-- NUMBERING: 029 was the previous migration. The brief said 031; 030 is the next
-- free number, and 021 is already used twice (021_crawler_hits and
-- 021_share_card_cache), which is the mistake worth not repeating.
-- ============================================================================

alter table videos
  add column if not exists card_source_key text;

comment on column videos.card_source_key is
  'The source_key of the share card currently stored for this video in '
  'share_card_cache, or null. Compared against the row''s freshly computed key '
  'so a card built before the title or poster changed is treated as stale. '
  'Written by buildShareCard; read on the watch path so the player is not gated '
  'on a second table.';

/* ----------------------------------------------------------------- backfill
   Copy the real key rather than guessing. share_card_cache already stores the
   source_key each cached image was built from, so this is exact: no hash has to
   be recomputed, and a card whose key no longer matches its video is simply left
   looking stale, which is the correct answer.

   A null column reads as "not ready", and the only consequence of being wrong in
   that direction is a loading pill in the share sheet for a moment.            */
update videos v
   set card_source_key = c.source_key
  from share_card_cache c
 where c.slug = v.slug
   and octet_length(c.jpeg) > 1000
   and v.card_source_key is distinct from c.source_key;

/* The watch path filters on published+approved and then reads this column, so
   it rides along on the existing index rather than needing one of its own. */
