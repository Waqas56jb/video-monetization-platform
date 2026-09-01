-- ============================================================================
-- 031 · `creator_profiles.followers` stops being maintained by hand
--
-- 029 created the `follows` graph and left the integer on `creator_profiles`
-- as a denormalised count, written by application code on every follow and
-- unfollow (`server/src/lib/follows.js`). That is exactly the arrangement 006
-- was written to end, and for the same reason: a counter that anything may
-- write is a counter that eventually disagrees with the rows behind it. The
-- client has already caught this project once, on `videos.views` and
-- `videos.paid_unlocks`, quoting 3.2K views against 67 rows.
--
-- The bypass here is real and needs no misbehaviour to trigger it.
-- `follows.follower_id` is `on delete cascade`: delete a viewer — which the
-- admin panel can do, and which the e2e cleanup script does — and their rows
-- vanish while every creator they followed keeps the inflated integer. Nothing
-- recomputes it. Today's zero drift is a three-row table, not a guarantee.
--
-- After this the count is derived from `follows` by the database, on every
-- insert, update and delete, including the cascaded ones. `follows.js` no
-- longer writes it.
--
-- RECOUNT, NOT INCREMENT. 006 increments `videos.views` because a view log only
-- ever grows and aggregating an unbounded table per insert would be wasteful.
-- `follows` is different: it shrinks, it is small — one row per viewer per
-- creator — and it is indexed on `creator_id`. A recount is exact, survives a
-- cascade, and cannot drift; an increment/decrement pair would reintroduce the
-- very class of bug this migration exists to remove.
-- ============================================================================

create or replace function sync_creator_followers() returns trigger as $$
declare
  -- An update can move a row between two creators, so both have to be restated.
  targets uuid[] := array_remove(array[old.creator_id, new.creator_id], null);
  target uuid;
begin
  foreach target in array targets loop
    update creator_profiles
       set followers = (select count(*)::int from follows where creator_id = target),
           updated_at = now()
     where user_id = target;
  end loop;
  return null;
end;
$$ language plpgsql;

comment on function sync_creator_followers is
  'Restates creator_profiles.followers from the follows table. Attached after '
  'insert/update/delete on follows, so a cascaded delete of a viewer corrects '
  'every creator they followed.';

drop trigger if exists follows_sync_counter on follows;
create trigger follows_sync_counter
  after insert or update or delete on follows
  for each row execute function sync_creator_followers();

-- ------------------------------------------------------- restate what is there
-- Every creator, not only the ones with rows: a creator whose followers all
-- deleted their accounts is precisely the case this migration is about, and
-- they are the ones a join-only update would skip.
update creator_profiles cp
   set followers = (
         select count(*)::int from follows f where f.creator_id = cp.user_id
       )
 where cp.followers is distinct from (
         select count(*)::int from follows f where f.creator_id = cp.user_id
       );
