-- ============================================================================
-- 024 · A public creator page needs more than a name
--
-- The storefront was name + bio + a grid. Category and social links lived
-- only on the application, so the public page could not show them. These
-- columns are the creator's own copy of that — editable in profile settings,
-- shown on /creator/:id.
-- ============================================================================

alter table creator_profiles
  add column if not exists category text,
  add column if not exists socials  jsonb not null default '[]'::jsonb;

update creator_profiles cp
   set category = coalesce(cp.category, nullif(a.category, 'Not stated')),
       socials  = case
                    when cp.socials is null or cp.socials = '[]'::jsonb
                    then coalesce(a.socials, '[]'::jsonb)
                    else cp.socials
                  end,
       bio      = coalesce(cp.bio, a.bio, a.description),
       location = coalesce(cp.location, a.location)
  from (
    select distinct on (user_id)
           user_id, category, socials, bio, description, location
      from creator_applications
     where status = 'approved'
     order by user_id, created_at desc
  ) a
 where cp.user_id = a.user_id;
