-- ============================================================================
-- 028 · Source width / height
--
-- Watch used a fixed 16:9 player. Portrait and square films sat as a thin
-- strip inside that box (Cloudflare letterboxed the rest black). The player
-- can only size itself if we know the file's pixels, and Cloudflare only
-- tells us that once the upload is ready.
-- ============================================================================

alter table videos
  add column if not exists width integer,
  add column if not exists height integer;

comment on column videos.width is
  'Pixel width of the source, from Cloudflare Stream when the file is ready.';
comment on column videos.height is
  'Pixel height of the source, from Cloudflare Stream when the file is ready.';
