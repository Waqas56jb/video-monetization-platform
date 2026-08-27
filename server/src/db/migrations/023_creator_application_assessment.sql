-- ============================================================================
-- 023 · A creator application has to be assessable
--
-- Name, category and a paragraph were not enough to decide who publishes on
-- MTONYO+. These columns are what the review actually reads: format, audience,
-- sample work, where they are, and why they want in.
--
-- Revoking creator access is not the same as declining the original
-- application. The decision stays on the record; access_ended_* records that
-- the studio was taken away later.
-- ============================================================================

alter table creator_applications
  add column if not exists content_type     text,
  add column if not exists followers        text,
  add column if not exists engagement       text,
  add column if not exists sample_work      jsonb not null default '[]'::jsonb,
  add column if not exists bio              text,
  add column if not exists location         text,
  add column if not exists why_join         text,
  add column if not exists access_ended_at  timestamptz,
  add column if not exists access_ended_by  uuid references profiles(id) on delete set null,
  add column if not exists access_end_note  text;
