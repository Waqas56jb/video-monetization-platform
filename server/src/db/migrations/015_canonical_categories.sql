-- ============================================================================
-- 015 · One spelling per category
--
-- The client reported seeing both "Documentaries" and "Documentary" in the
-- filters, and was right: the table held both. The dropdowns were never at
-- fault — Upload, My Videos and Explore are all built from a single list in the
-- front end — but the API validated `category` as any string up to 60
-- characters, so nothing stopped other spellings being written. Explore then
-- appends any value it does not recognise, deliberately, so that content
-- categorised before the fixed list existed stays reachable instead of quietly
-- disappearing. Two spellings in the table became two chips on the screen.
--
-- The door those values came through is now shut in the API (see
-- lib/categories.js, which normalises on write and rejects what it cannot
-- place). This migration cleans up what came through before it was.
--
-- Renaming rather than deleting: every one of these rows is a real video, and
-- clearing the column instead would have dropped it out of the filters
-- entirely. "Food" is kept as a category of its own rather than folded into
-- something it is not — two of the videos on the platform are Tanzanian cooking
-- and none of Films/Series/Courses honestly describes them, so the canonical
-- list gains an entry instead of the content losing its label.
-- ============================================================================

update videos
   set category = case
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('film', 'movie', 'movies')                   then 'Films'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('serie', 'show', 'shows')                    then 'Series'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('concert')                                   then 'Concerts'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('documentary', 'documentries', 'docu')       then 'Documentaries'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('sport')                                     then 'Sports'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('podcast')                                   then 'Podcasts'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('course', 'tutorial', 'tutorials')           then 'Courses'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('bts', 'behindthescenes')                    then 'Behind the Scenes'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('cooking', 'recipe', 'recipes')              then 'Food'
         -- Already canonical apart from casing/spacing: snap it to the list
         -- spelling so "music" and "Music" cannot both appear as chips.
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'films'            then 'Films'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'series'           then 'Series'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'music'            then 'Music'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'concerts'         then 'Concerts'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'comedy'           then 'Comedy'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'documentaries'    then 'Documentaries'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'sports'           then 'Sports'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'podcasts'         then 'Podcasts'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'courses'          then 'Courses'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'food'             then 'Food'
         else category
       end
 where category is not null
   and category <> '';

-- Blank strings are not a category; they are the absence of one, and leaving
-- them meant an empty chip could be produced from the database.
update videos set category = null where category is not null and trim(category) = '';

-- Filtering by category is the second thing Explore does on every visit.
create index if not exists videos_category_idx
  on videos (category)
  where category is not null and is_published = true and deleted_at is null;
