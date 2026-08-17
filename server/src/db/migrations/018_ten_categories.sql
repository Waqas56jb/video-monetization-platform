-- ============================================================================
-- 018 · The client's ten categories, not eleven
--
-- 015 kept "Food" because two cooking videos did not sit cleanly in Films or
-- Series. The client then sent the ten-item list they actually want on the
-- homepage pills and Explore filters, and Food is not on it. Cooking how-tos
-- belong under Courses (that is also how the demo seed labels new ones).
--
-- Anything still stored as Food / cooking / recipe is renamed, not deleted,
-- so those videos stay filterable. Documentary/Documentaries was already
-- folded in 015; this pass catches any row that arrived after, or with
-- spacing/casing that 015 left alone.
-- ============================================================================

update videos
   set category = case
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('food', 'cooking', 'recipe', 'recipes')      then 'Courses'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('documentary', 'documentries', 'docu')       then 'Documentaries'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('film', 'movie', 'movies')                   then 'Films'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('serie', 'show', 'shows')                    then 'Series'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('concert')                                   then 'Concerts'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('sport')                                     then 'Sports'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('podcast')                                   then 'Podcasts'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('course', 'tutorial', 'tutorials')           then 'Courses'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) in
              ('bts', 'behindthescenes')                    then 'Behind the Scenes'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'films'            then 'Films'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'series'           then 'Series'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'music'            then 'Music'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'concerts'         then 'Concerts'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'comedy'           then 'Comedy'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'documentaries'    then 'Documentaries'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'sports'           then 'Sports'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'podcasts'         then 'Podcasts'
         when lower(regexp_replace(category, '[^a-zA-Z]', '', 'g')) = 'courses'          then 'Courses'
         else category
       end
 where category is not null
   and category <> '';
