-- 003 — the sub-admin role
--
-- A sub-admin is staff: they moderate content, decide withdrawals, run ads and
-- send announcements. They never see or touch accounts — that stays with the
-- admin alone.
--
-- This is on its own because Postgres will not let a newly added enum value be
-- USED in the same transaction that adds it. Everything that references
-- 'sub_admin' therefore lives in 004.

alter type user_role add value if not exists 'sub_admin';
