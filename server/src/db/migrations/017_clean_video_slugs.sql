-- ============================================================================
-- 017 · Watch URLs should read as the video's name
--
-- Slugs were `title` plus five random characters so two uploads could share a
-- name. The client asked for something closer to /watch/video-title. Random
-- suffixes made every shared link look like a database key, which is what
-- WhatsApp then showed as "an ugly URL with numbers".
--
-- New uploads already take the title and only add -2, -3 on a clash
-- (videos.routes uniqueSlug). This pass rewrites what is already in the table
-- the same way. The UUID still opens the video, so an old /watch/<uuid> link
-- does not die.
-- ============================================================================

create or replace function mtonyo_slug_base(title text) returns text as $$
  select left(
    coalesce(
      nullif(
        trim(both '-' from lower(regexp_replace(coalesce(title, ''), '[^a-zA-Z0-9]+', '-', 'g'))),
        ''
      ),
      'video'
    ),
    60
  );
$$ language sql immutable;

-- Park every slug on a unique temporary value so the unique index cannot
-- collide while two rows swap names.
update videos
   set slug = 'tmp-' || replace(id::text, '-', '')
 where slug is not null;

with numbered as (
  select
    id,
    mtonyo_slug_base(title) as base,
    row_number() over (
      partition by mtonyo_slug_base(title)
      order by created_at nulls last, id
    ) as n
  from videos
)
update videos v
   set slug = case
                when n.n = 1 then n.base
                else left(n.base, 54) || '-' || n.n::text
              end
  from numbered n
 where v.id = n.id;
