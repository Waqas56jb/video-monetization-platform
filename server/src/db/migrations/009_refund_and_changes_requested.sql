-- ============================================================================
-- 009 · Two states the platform could describe but not record
--
-- The client's review asked for both by name:
--
--   "Support Pending, Successful, Failed, Cancelled and Refunded."
--   "Admin may Approve, Reject or Request Changes."
--
-- Neither existed. `payment_status` stopped at 'expired', so a refunded payment
-- had to masquerade as something it was not — while `purchases` has carried a
-- 'refunded' status since day one, which left the two tables able to disagree
-- about the same transaction. And a reviewer who wanted a small correction had
-- only 'rejected', which reads to the creator as "start again" and throws away
-- work that was nearly right.
--
-- ----------------------------------------------------------------------------
-- Why this migration adds the values and does nothing else:
--
-- Postgres refuses to USE an enum value in the same transaction that ADDS it,
-- and the migration runner wraps every file in one. Migration 003 hit this
-- exactly and had to be split the same way. So this file only widens the two
-- types; anything that reads or writes the new values belongs in a later
-- migration or in application code.
-- ============================================================================

-- A refund reverses money that was taken. The purchase row it belongs to
-- already supports 'refunded', so this finally lets the payment and the
-- entitlement tell the same story.
alter type payment_status add value if not exists 'refunded';

-- Between "this is fine" and "this is not publishable" sits the common case:
-- one thing needs fixing. 'changes_requested' keeps the submission alive, keeps
-- the reviewer's note attached to it, and lets the creator resubmit the same
-- video instead of starting over.
alter type review_status add value if not exists 'changes_requested';
