-- The one-time backfill in 020_creator_applications.sql wrote internal,
-- migration-authored language into a column an admin reads as if it were the
-- APPLICANT'S OWN WORDS: "What they will publish" (creator_applications.
-- description), shown verbatim in Super Admin -> Creator Applications ->
-- filter: approved (admin/src/components/tabs/CreatorApplicationsTab.jsx).
--
-- Client, 2026-09-21: "Please also remove the creator-facing text 'Creator
-- account created before applications existed.' That is internal/migration
-- language and should never appear to users." Nine creators, all backfilled
-- by 020 for predating the application system, all carry the exact string.
--
-- Fixed at the data, not the UI: the text is replaced everywhere it could
-- ever be read, present view or a future one, rather than pattern-matched
-- and hidden in one screen. `category` ('Not stated') is left alone --
-- unlike the description, it never reads as the creator's own claim.
update creator_applications
   set description = 'No application on file — this creator account was granted access before MTONYO+ had a review process.'
 where description = 'Creator account created before applications existed.';
