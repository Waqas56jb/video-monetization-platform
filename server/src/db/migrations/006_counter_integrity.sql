-- ============================================================================
-- 006 · Make the counters on `videos` tell the truth
--
-- `videos.views` and `videos.paid_unlocks` are denormalised counters. Counting
-- `video_views` on every page load would be wasteful, so keeping a running total
-- is the right call — but a counter that anything may write is a counter that
-- eventually disagrees with the rows it is supposed to summarise.
--
-- That is exactly what happened, and the client caught it: the admin reported
-- 6 paid unlocks while `purchases` held 3, and 3.2K views while `video_views`
-- held 67. Two screens quoting two different numbers for the same fact is worse
-- than either number being wrong, because it tells you neither can be trusted.
--
-- So the counters stop being something code maintains by hand. Triggers own them
-- now, sourced from the rows themselves, and this migration recomputes both once
-- so today's figures start out honest.
-- ============================================================================

-- --------------------------------------------------------------- paid unlocks
-- Only an ACTIVE purchase counts. A refund has to take its unlock back with it,
-- otherwise revenue and unlocks drift apart the first time someone is refunded.
create or replace function sync_video_paid_unlocks() returns trigger as $$
declare
  target uuid := coalesce(new.video_id, old.video_id);
begin
  update videos
     set paid_unlocks = (
           select count(*) from purchases
            where video_id = target and status = 'active'
         )
   where id = target;
  return null;
end;
$$ language plpgsql;

drop trigger if exists purchases_sync_unlocks on purchases;
create trigger purchases_sync_unlocks
  after insert or update or delete on purchases
  for each row execute function sync_video_paid_unlocks();

-- ---------------------------------------------------------------------- views
-- Views only ever go up, so this one increments rather than recounting: a table
-- that grows without bound should not be aggregated on every single insert.
create or replace function bump_video_views() returns trigger as $$
begin
  update videos set views = views + 1 where id = new.video_id;
  return null;
end;
$$ language plpgsql;

drop trigger if exists video_views_bump on video_views;
create trigger video_views_bump
  after insert on video_views
  for each row execute function bump_video_views();

-- ------------------------------------------------------- restate what is there
update videos v
   set paid_unlocks = (
         select count(*) from purchases p
          where p.video_id = v.id and p.status = 'active'
       );

-- Views are only restated where a real view history exists. A video whose rows
-- predate this table keeps its counter — silently zeroing a creator's view count
-- because we changed how we store it would be a lie in the other direction.
update videos v
   set views = c.n
  from (select video_id, count(*)::int as n from video_views group by video_id) c
 where c.video_id = v.id
   and c.n > v.views;
