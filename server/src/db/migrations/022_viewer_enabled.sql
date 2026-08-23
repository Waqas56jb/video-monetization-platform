-- 022_viewer_enabled.sql
-- Watch (viewer) side flag, separate from Create (creator_profiles).
-- One auth.users row per email; sides are independent.

alter table profiles
  add column if not exists viewer_enabled boolean not null default false;

comment on column profiles.viewer_enabled is
  'True when this login has opened the Watch (viewer) side. Create side is creator_profiles.';

-- Backfill: everyone who is not creator-only, plus anyone with viewer activity.
update profiles p
   set viewer_enabled = true
 where p.viewer_enabled = false
   and (
     p.role in ('viewer', 'admin', 'sub_admin')
     or not exists (select 1 from creator_profiles c where c.user_id = p.id)
     or exists (select 1 from purchases pu where pu.user_id = p.id)
   );
