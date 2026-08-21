-- ============================================================================
-- 020 · Creator access is granted, not taken
--
-- A viewer pressed one button and was a creator. The platform decides who may
-- sell and publish on it, so that has to be an application somebody reviews.
--
-- The account itself does not change on submission: a pending applicant is
-- still a viewer, with a viewer's permissions, until an administrator approves
-- them. Nothing here grants anything — approval is what moves the role, and it
-- happens in one transaction with the creator profile being created.
-- ============================================================================

do $$ begin
  create type creator_application_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists creator_applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,

  -- Taken as given at the time of applying rather than read from the profile
  -- later. The application is a record of what was claimed when it was made,
  -- and a profile edited afterwards must not rewrite it.
  full_name     text not null,
  stage_name    text not null,
  email         text not null,
  phone         text not null,
  category      text not null,
  description   text not null,

  -- Free-form because a creator may have one link or four, on platforms this
  -- table should not need to know the names of.
  socials       jsonb not null default '[]'::jsonb,

  -- The agreement is a fact with a time, not a checkbox. Stored with the
  -- wording so the record says what was agreed to, not merely that something
  -- was, the same way the upload rights confirmation does.
  terms_accepted_at timestamptz not null,
  terms_statement   text,

  status        creator_application_status not null default 'pending',
  decided_by    uuid references profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists creator_applications_queue_idx
  on creator_applications (status, created_at desc);
create index if not exists creator_applications_user_idx
  on creator_applications (user_id, created_at desc);

/* One open application per person. A second submission while the first is
   waiting adds nothing and doubles the queue. A rejected applicant may apply
   again — that is the point of telling them why. */
create unique index if not exists creator_applications_one_pending
  on creator_applications (user_id)
  where status = 'pending';

/* ====================================================================
   ROW LEVEL SECURITY

   An application holds a person's phone number and their plans. The
   applicant may read their own; everything else is staff.
   ==================================================================== */
alter table creator_applications enable row level security;

drop policy if exists creator_applications_own_read on creator_applications;
create policy creator_applications_own_read on creator_applications
  for select using (user_id = auth.uid() or auth_role() in ('admin', 'sub_admin'));

drop policy if exists creator_applications_create on creator_applications;
create policy creator_applications_create on creator_applications
  for insert with check (user_id = auth.uid());

/* ====================================================================
   EXISTING CREATORS ARE NOT DISTURBED

   Everyone who is already a creator stays one. They are given an
   approved application recording how they got here, so the admin list
   is the whole history rather than only what happens from now on, and
   so a revoked creator has something to have been revoked from.
   ==================================================================== */
insert into creator_applications
  (user_id, full_name, stage_name, email, phone, category, description,
   terms_accepted_at, terms_statement, status, decided_at, created_at)
select p.id,
       coalesce(p.full_name, p.email),
       coalesce(cp.display_name, p.full_name, p.email),
       p.email,
       coalesce(p.phone, ''),
       'Not stated',
       'Creator account created before applications existed.',
       p.created_at,
       'Granted before the application process existed.',
       'approved',
       p.created_at,
       p.created_at
  from profiles p
  left join creator_profiles cp on cp.user_id = p.id
 where p.role = 'creator'
   and not exists (select 1 from creator_applications a where a.user_id = p.id);
