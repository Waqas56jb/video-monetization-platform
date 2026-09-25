-- Six creator bios read "Creator account created before applications existed."
-- — the internal backfill text from 020, copied into creator_profiles.bio when
-- those backfilled applications were approved (the approval fills an empty
-- bio from the application description). 042 fixed the application rows only;
-- bios are what a creator's public page shows. Found in the final audit (I2).
--
-- The approval route no longer copies either system string; this clears the
-- copies already made. Only the exact system strings are touched — nothing a
-- creator wrote themselves.
update creator_profiles
   set bio = null
 where bio in (
   'Creator account created before applications existed.',
   'No application on file — this creator account was granted access before MTONYO+ had a review process.'
 );
