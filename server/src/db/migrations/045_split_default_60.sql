-- 045 · The platform split is 60/40 (creator/platform); the schema still said 70.
--
-- Only the column DEFAULT changes. The saved setting is already 60, and earnings
-- already recorded keep the split they were credited at (Revenue & Splits says
-- so to the admin): a ledger row is what a creator was told they earned.

alter table platform_settings alter column creator_split_percent set default 60;
