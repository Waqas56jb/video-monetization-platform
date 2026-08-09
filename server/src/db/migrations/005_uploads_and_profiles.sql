-- 005 — pictures people upload, and the fields they fill in about themselves
--
-- Two additions that arrive together because they are one story: a creator
-- should be able to choose the still that represents their video, and anyone
-- should be able to put a face to their account.

/* ====================================================================
   STORAGE BUCKETS
   --------------------------------------------------------------------
   Created here rather than clicked into existence in a dashboard, so a
   fresh environment comes up complete. Both are public-read: an avatar
   and a video poster are shown to anyone who can see the account or the
   video, and putting a signature on them would only add a round trip.
   Writing is a different matter and is restricted below.
   ==================================================================== */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',    'avatars',    true, 2097152,  array['image/jpeg','image/png','image/webp','image/gif']),
  ('thumbnails', 'thumbnails', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* --------------------------------------------------------------------
   Who may write what.

   Everyone may read; only the owner may write, and only inside a folder
   named after their own account id. Without the folder rule any signed-in
   person could overwrite anybody else's picture.
   -------------------------------------------------------------------- */
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists thumbnails_public_read on storage.objects;
create policy thumbnails_public_read on storage.objects
  for select using (bucket_id = 'thumbnails');

drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists thumbnails_owner_write on storage.objects;
create policy thumbnails_owner_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists thumbnails_owner_update on storage.objects;
create policy thumbnails_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists thumbnails_owner_delete on storage.objects;
create policy thumbnails_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

/* ====================================================================
   A CREATOR'S OWN THUMBNAIL
   --------------------------------------------------------------------
   Cloudflare picks a frame automatically, and that frame is often a
   blur or a black gap. A creator who has made a proper cover should be
   able to use it.

   Kept in its own column rather than overwriting the automatic one, so
   removing a custom image falls straight back to the frame — nothing is
   lost by trying.
   ==================================================================== */
alter table videos add column if not exists custom_thumbnail_url text;

/* ====================================================================
   PROFILE FIELDS
   --------------------------------------------------------------------
   Things people say about themselves. `bio` and `location` already exist
   for creators; a viewer has an account too, and until now there was
   nowhere for them to put anything at all.
   ==================================================================== */
alter table profiles add column if not exists bio       text;
alter table profiles add column if not exists location  text;
alter table profiles add column if not exists website   text;

/* Notification preferences, so "email me about this" is a real setting. */
alter table profiles add column if not exists email_announcements boolean not null default true;
alter table profiles add column if not exists email_account_news  boolean not null default true;
