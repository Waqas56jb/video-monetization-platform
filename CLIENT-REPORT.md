# MTONYO+ — what was wrong, what was changed, how it was checked

> **This file is being written.** The per-item sections (PROBLEM → ROOT CAUSE → FIX MADE →
> HOW TESTED) are added as each part of the work finishes. The section below is complete and
> is here first because it concerns data on the live site.

---

## Test data on production

To prove that buying a video actually works — rather than assume it — a test account was
created on the live site and used to buy three videos through the normal payment screen.

| | |
|---|---|
| Account | `e2e+8238822854@mtonyo.test` |
| Created | 1 September 2026, through the ordinary sign-up form |

| Video | Amount |
|---|---|
| Live at Arusha — Full Set | 5,000 TZS |
| Behind the Fame — A Coast Documentary | 2,500 TZS |
| WhatsApp Video 2026-08-15 | 1,000 TZS |

**No money changed hands.** The site is running its sandbox payment provider, so these are
test transactions end to end — nothing was charged to any card or mobile-money account, and
nothing is owed to anyone.

**They do appear in the revenue figures** in the admin area, because they are recorded the
same way a real sale is: a payment, a purchase, and a creator's share. That is deliberate —
a test that skipped those steps would not have proved anything.

**They will be reversed before handover.** The reversal uses the same refund function an
administrator would use, so the creator's share is taken back with the sale rather than left
behind. This has been written and checked in advance
(`server/scripts/cleanup-e2e.mjs`), and it runs on request.

One further account was created by accident while checking whether the sign-up form would
accept a test email address. It had no activity and has already been removed.

---

*Sections for the reported faults follow.*
