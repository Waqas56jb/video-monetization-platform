-- ============================================================================
-- 033 · "Remove from history" without throwing the position away
--
-- Continue Watching and Recently Watched are both `watch_progress` read two
-- ways: the rows you have not finished, and the rows you touched most recently.
-- So they share storage, and "Remove from history" would remove a video from
-- both — and would also destroy the resume position, so reopening the film
-- would start it again from zero.
--
-- That is the wrong behaviour for the commonest reason people use this: they
-- want a title off a shared screen, not to lose their place in it. So the row
-- is HIDDEN rather than deleted. `hidden_at` takes it out of both rows; the
-- seconds stay, and reopening the video resumes exactly where it was.
--
-- Watching more of a hidden video clears the flag. Somebody who removed a film
-- and then went back to it plainly wants it in their list again, and requiring
-- them to find a second control to undo the first would be the kind of thing
-- the client has already had to point out.
--
-- Alternative considered: delete the row. Simpler, one fewer column, and no
-- clearing rule — but it conflates "stop showing me this" with "forget where I
-- was", and there is no way back from it. Recorded in DECISIONS.md.
-- ============================================================================

alter table watch_progress
  add column if not exists hidden_at timestamptz;

comment on column watch_progress.hidden_at is
  'When the viewer removed this video from their history. Excluded from '
  'Continue Watching and Recently Watched while set; the seconds are kept, so '
  'reopening the film still resumes. Cleared when they watch more of it.';

/* Both library rows filter on it, and both are "this viewer, newest first", so
   the existing (user_id, updated_at desc) index is extended rather than joined
   by a second one. Partial, because a hidden row is never in either result. */
create index if not exists watch_progress_user_visible_idx
  on watch_progress(user_id, updated_at desc)
  where hidden_at is null;
