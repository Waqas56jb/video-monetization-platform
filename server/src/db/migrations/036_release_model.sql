-- ============================================================================
-- 036 · release_model + is_original
--
-- `access_type` already encodes most of a video's release strategy
-- (ppv_forever / paid_premiere / free_with_ads) but conflates two different
-- questions: how the paywall behaves right now, and whether this title ever
-- converts. `release_model` names the release strategy explicitly and gives
-- room for `exclusive` — a paid/free/unavailable state entirely controlled
-- by an admin, with no existing analogue in access_type — without
-- overloading access_type any further.
--
-- `is_original` is a separate, orthogonal, admin-only editorial flag. It
-- affects nothing about entitlement, pricing or the paywall — labelling
-- only, the same category of flag as `featured` (010_featured_videos.sql).
--
-- Both are read by application code alongside access_type, never instead of
-- it — access_type/price_tzs/is_published still decide what a viewer can
-- actually watch. release_model decides what the *cron* is allowed to do to
-- that state, and what the admin's video-edit screen offers.
-- ============================================================================

do $$ begin
  create type release_model as enum ('permanent_paid', 'premiere_to_free', 'exclusive');
exception when duplicate_object then null; end $$;

alter table videos
  add column if not exists release_model release_model,
  add column if not exists is_original   boolean not null default false;

-- Backfill for EXISTING rows, mapped from today's access_type:
--   paid_premiere   -> premiere_to_free   (the only model that ever converts)
--   ppv_forever     -> permanent_paid     (pay once, keep forever — no clock)
--   free_with_ads   -> permanent_paid     (never was paid/premiering; there is
--                                          no historical signal for `exclusive`,
--                                          since it does not exist as a concept
--                                          until this migration, so no existing
--                                          row is ever assigned it)
update videos
   set release_model = case access_type
         when 'paid_premiere' then 'premiere_to_free'::release_model
         else 'permanent_paid'::release_model
       end
 where release_model is null;

alter table videos alter column release_model set not null;
alter table videos alter column release_model set default 'permanent_paid';

comment on column videos.release_model is
  'The release strategy an admin controls: permanent_paid (pay once, keep '
  'forever), premiere_to_free (paid window, then auto-converts to Free+Ads — '
  'see server/src/jobs/premiere.js), or exclusive (admin-managed paid/free/'
  'unavailable, no automatic conversion). Creators choose between the first '
  'two at upload via access_type; only an admin can set exclusive.';
comment on column videos.is_original is
  'Admin-only "MTONYO+ Original" editorial flag. No effect on entitlement, '
  'pricing, or the paywall — labelling only, same category of flag as '
  '`featured` (010_featured_videos.sql).';

create index if not exists videos_release_model_idx on videos(release_model);
