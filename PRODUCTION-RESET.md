# Production reset before launch

**What this is.** The client's Milestone 2 close-out asked for "a safe production
cleanup/reset plan so Smoke/test/demo users, fake payments, fake views and demo earnings do
not appear at launch". This is that plan. It is written as a script that reports first and
writes nothing until told to — `server/scripts/production-reset.mjs` — and this page says
what the script will do, what it refuses to do, and what the dry run found on 2026-09-17.

**Nothing has been run.** Only dry runs. The full dry-run output is in
`scripts/e2e/evidence/production-reset-dry-run-2026-09-17.txt`.

---

## What is on the live database today (2026-09-17)

| Category | Accounts | Notes |
|---|---|---|
| Smoke accounts `creator.*@mtonyo.test` / `viewer.*@mtonyo.test` | 32 (16 creators) | Playwright smoke/matrix runs. 16 unpublished smoke videos, 10 sandbox purchases (9,500 TZS). |
| Probe `probe+*@mtonyo.test` | 1 | One-off diagnostic creator. |
| E2E `e2e+*@mtonyo.test` | 1 | **Kept.** The documented fixture for the player/entitlement suites (`E2E-ACCOUNTS.md`). Its 3 sandbox purchases stay until handover. |
| Demo `demo.*@mtonyo.demo` | 5 (2 creators + viewer + moderator + …) | The showcase content. **All 6 published films on the site belong to `demo.asha` and `demo.juma`.** |
| Real testers | — | 20 active sandbox purchases of demo films are held by 13 real accounts (the client's own testers: `abc@`, `fsnholdings@`, `goldfirmbymk@`, `hamza@`, …). |
| Dangling `creator_profiles` row | 1 | `waqas56jb@gmail.com` is a sub-admin with a leftover creator profile row (no videos, no earnings). |
| Announcement titled "test" | 1 | Sent 2026-08-23; 27 inbox rows, 22 of them in real accounts' notification lists. |
| `show_demo_content_in_stats` | `true` | Demo creators, views and earnings are currently counted in the public numbers. |

Money-wise: 92 of the 140 earnings rows belong to test or demo accounts; 647 ad impressions
are almost all on demo films.

---

## The rules the script keeps

1. **Money is reversed, never deleted.** Every test purchase goes back through the admin
   refund path (`POST /api/admin/payments/:id/refund`) — payment and purchase flip to
   `refunded` and a negative earnings row takes the creator's credit back. A raw `DELETE`
   would leave a creator able to withdraw against money that no longer exists. These were
   sandbox payments; nothing was ever charged and nothing is moved.
2. **Nothing that belongs to a real person is touched.** Deleting a creator hard-deletes their
   videos (foreign-key cascade), which cascades into every purchase, payment, view and
   watch-progress row on those videos — including ones real viewers made. So an account whose
   videos have active purchases by anyone outside the target set is **BLOCKED** and listed,
   never deleted.
3. **Videos are removed through the admin soft-delete** (`DELETE /api/admin/videos/:id`)
   before the account goes, so the audit log records what was removed and by whom.
4. **The documented E2E fixture is kept** unless `--include-fixture` is passed.
5. **Dry run by default.** `--apply` is the only thing that writes.

---

## What the dry run says it would do

### Default scopes — `node server/scripts/production-reset.mjs`

Removes the test data and leaves the demo showcase in place but out of the public numbers.

```
accounts in scope: 33   blocked: 0   would delete: 33
refunds via admin path: 10 (9,500 TZS)   videos soft-deleted: 16   need a human: 0
+ remove the dangling creator_profiles row on waqas56jb@gmail.com
+ delete the "test" announcement (its 27 inbox rows go with it)
+ show_demo_content_in_stats → false
```

After it: the Users tab loses 33 test rows; Payments loses 10 sandbox purchases (reversed,
still visible as refunded for audit); 16 unpublished smoke videos are soft-deleted; nobody has
a "test" notification any more; the homepage counters, top creators and `/api/stats` count
only real creators, real views and real earnings.

### With demo accounts — `node server/scripts/production-reset.mjs --with-demo`

```
accounts in scope: 38   blocked: 2   would delete: 36
refunds via admin path: 14 (15,300 TZS)   videos soft-deleted: 18
BLOCKED  demo.asha@mtonyo.demo  — 8 active purchases by 7 real accounts
BLOCKED  demo.juma@mtonyo.demo  — 14 active purchases by 13 real accounts
```

**The two demo creators cannot be deleted today**, and the script will not do it: real testers
bought their films through the real (sandbox) payment sheet, and deleting the creators would
erase those people's purchases. They are also the only published content on the site. So the
demo creators stay until the client decides one of:

- **(a) Keep the showcase, hide it from the numbers** — the default run above already does
  this (`show_demo_content_in_stats=false`). Recommended until real creators have published.
- **(b) Retire the showcase** — refund the 20 purchases of demo films in Admin → Payments
  (the same refund path; the buyers see "refunded"), unpublish the 6 films, then re-run
  `--with-demo`, which will no longer be blocked.

---

## How to run it

```bash
# 0. Take a database backup first (Supabase → Database → Backups). Deleting an account has no undo.

# 1. Look.
cd server
node scripts/production-reset.mjs                 # default scopes
node scripts/production-reset.mjs --with-demo     # see what the demo scope would do (and what blocks it)

# 2. Do it.
ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/production-reset.mjs --apply
#   SUPABASE_SERVICE_ROLE_KEY comes from server/.env (needed to delete the auth users).

# Options
#   --only x@mtonyo.test        one account
#   --keep a@b.test             keep one (repeatable); the E2E fixture is always kept unless --include-fixture
#   --scope smoke,probe         restrict to named scopes: smoke probe e2e test-other demo orphans test-announcement demo-stats
```

The script prints every refund, every video and every account before touching it, and a
summary line at the end with what the public will now see (`N real active creators · N
@mtonyo.test accounts · N demo accounts · N published videos`).

## After running — how to check

- Admin → Users: no `@mtonyo.test` rows except `e2e+8238822854@mtonyo.test`; counters reconcile
  (Total = Viewers + Creators + Suspended).
- Admin → Payments: the 10 test purchases show as **refunded**, with the reason
  "Test data reversed before launch (production reset)".
- `/api/stats`: `creators`, `creatorsEarning`, `views`, `paidOut` no longer include demo rows.
- Any real account's notification list: the "test" announcement is gone.
- The test suites that use the fixture (`scripts/e2e/matrix.mjs --read-only`,
  `scripts/e2e/whatsapp-link-flow.mjs`) still pass.

## What this does NOT do

- It does not touch Cloudflare Stream assets. Soft-deleted videos keep their upload so the
  audit trail can still be played back; removing the media is a separate, deliberate step.
- It does not delete real accounts, ever — not even ones that look like tests
  (`abc@gmail.com`, `creator2@gmail.com`). If the client wants those gone, that is a decision
  to make by name, and the Users tab's block/delete is the place to do it.
- It does not move money. Sandbox refunds are records, not transfers.
