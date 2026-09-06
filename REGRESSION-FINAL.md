# REGRESSION-FINAL — the client's own journey, every step, every profile

Run 2026-09-06, against production, with Playwright (Chromium, Firefox and WebKit — all three
installed and confirmed with a live screenshot per engine before this run started). One journey,
run per profile with the same step order the client asked for; a fresh e2e viewer created at the
start of every mutating run and reversed afterward through `cleanup-e2e.mjs`.

**Read this like the rest of this project's evidence: PASS means checked and true, N/A means the
engine cannot judge it (documented why), FAIL means it did not do what the client's list says it
should — two of those FAILs are real, live, and explained below rather than argued away.**

---

## The matrix

| # | Step | Chromium desktop | Pixel 7 | WebKit desktop | iPhone 14 | iPad | Firefox |
|---|---|---|---|---|---|---|---|
| 1 | Register (Signup UI) | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 2 | Browse Home | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 | Browse Explore | PASS | PASS | PASS | PASS | PASS | PASS |
| 4 | Browse Trending | PASS | PASS | PASS | PASS | PASS | PASS |
| 5 | Open video from a card | PASS | PASS | PASS | PASS | PASS | PASS |
| 6 | Open a cold shared link (Instagram in-app UA, signed out) | PASS | PASS | PASS | PASS | PASS | PASS |
| 7 | Preview autoplays muted, ends at labelled cutoff | PASS | PASS | N/A² | N/A² | N/A² | N/A² |
| 8 | Unlock → payment sheet opens | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 9 | Sandbox payment success, sheet closes itself | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 10 | Automatic resume (continue-veil, no second Play) | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 11 | Server confirms full entitlement before playback is trusted | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 12 | Free+Ads: ad shows before the countdown | PASS | PASS | N/A² | N/A² | N/A² | N/A¹ |
| 13 | Skip becomes available at the configured delay | **FAIL³** | **FAIL³** | N/A² | N/A² | N/A² | N/A¹ |
| 14 | Share opens the sheet, WhatsApp href well-formed | PASS | PASS | PASS | PASS | PASS | **FAIL⁴** |
| 15 | Share card matrix on a fresh slug (crawler view) | PASS | PASS | PASS | PASS | PASS | PASS |
| 16 | Follow a creator | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 17 | Add to My List | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 18 | Play another title, position saved | PASS | PASS | N/A² | N/A² | N/A² | N/A¹ |
| 19 | Logout | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 20 | Login (one attempt) | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 21 | Continue Watching shows it, tap resumes | PASS | PASS | N/A² | N/A² | N/A² | N/A¹ |
| 22 | Recently Watched | PASS | PASS | PASS | PASS | PASS | N/A¹ |
| 23 | Creator public profile (Watch/Share) | PASS | PASS | PASS | PASS | PASS | **FAIL⁴** |

**¹** Firefox ran the read-only leg only, per the brief — no new fixture account or sandbox
purchase was created on this engine.
**²** No Media Source Extensions on Playwright's WebKit build — unchanged from every prior round of
this work (`M2-VERIFY.md`, `DECISIONS.md` 2026-09-01). Layout/DOM state for these steps was
confirmed instead; the underlying feature is verified on Chromium and is on `BROWSER-CHECKLIST.md`
for a real iPhone/iPad.
**³** A real, live finding — detailed below. Confirmed on **7 separate runs** (5 Chromium desktop,
2 Pixel 7).
**⁴** A second real, live finding, Firefox-only — detailed below. Confirmed on **2 separate runs**.

**Creator dashboard, admin panel and the Creator Capital workflow** were run once, on Chromium
desktop, rather than repeated on all six profiles — they are React screens with their own
dedicated component tests (`ProfileTab.test.js`, `AnalyticsTab.test.js`, `CreatorCapitalTab.test.js`,
`Sidebar.test.js`, etc.) already covering cross-state rendering, and none of the client's own list
of concerns for them (the switch, the numbers, the workflow) is a playback or engine-rendering
question the way the viewer journey is. Repeating live admin/database-mutating actions five more
times would have created more test data without a new question being answered.

| Step | Result |
|---|---|
| Creator fixture: dual Watch+Create sides provisioned | PASS |
| Viewer↔Creator switch (dual-role account) | PASS — switched from "CREATOR ACCOUNT" |
| Creator Analytics tab loads | PASS |
| Creator Capital tab — Building Eligibility, X of 6 months (demo.asha, real progress) | PASS — "2 of 6 months of verified earnings" |
| Withdrawals (Revenue & Payouts) screen | PASS |
| Admin login | PASS |
| Admin dashboard numbers render | PASS |
| Admin revenue split 70 → 65 → 70, reflected live | PASS |
| Admin release-model select on a video row | PASS — "Permanent Paid, Premiere → Free, Exclusive" |
| Admin Creator Capital: list loads, filter chips present | PASS |
| Admin Approve (with AirPay's approved amount) | PASS |
| Admin Publish Offer | PASS |
| Admin demo-stats toggle flips and saves, then reverted | PASS |
| Admin logo opens the public site, new tab, session intact | PASS |
| Creator (demo.asha) sees and accepts the published offer | PASS — record moved to `active`, TZS 150,000, confirmed in the database, then removed |

---

## Finding 1 — Free+Ads pre-roll silently fails over to content, every time, on this campaign

**What the client's list asks for:** an advert plays before the countdown; skip becomes available
at the admin-configured delay.

**What actually happens, confirmed live, 7 runs:** the server correctly decides a pre-roll should
show (`GET /api/ads/breaks/:id` returns it; `adsEnabled`/`showsAds` both `true`; one active
campaign, "Vodacom Tanzania — Q3 Data Bundles", with no video/category/creator targeting so it
should serve everywhere) and the ad's own player iframe mounts — but within about 2–4 seconds its
Cloudflare Stream segment and init requests all abort (`net::ERR_ABORTED`, confirmed on the network
trace, on the ad's own video specifically). `AdBreak.jsx`'s own "advert never started" watchdog
(lines 70–77) does exactly what it was built to do: it bails to content, uncounted, rather than
trapping the viewer behind a frozen advert. The visible result is the film starting normally with
no ad ever shown — no skip button ever appears, because the ad state never reaches "playing".

**This is consistent with the live campaign's own numbers**: 504 impressions recorded, only 66
completed. That is not an occasional miss; it is most of the time.

**Why it is reported here and not patched.** Two iframes — the ad's own player and the main
content player — show simultaneously-aborted segment requests at the same instant, which points at
something interrupting both together (a re-render, most likely) rather than one broken ad file —
but that is a hypothesis, and the only clean way to tell it apart from "this specific ad creative
is unhealthy on Cloudflare's side" is a second, differently-configured campaign to compare against,
and exactly one exists on production right now. This is core to the platform's monetization, so
guessing at a fix without being able to verify which layer is actually at fault was judged worse
than reporting it precisely. Full reasoning in `DECISIONS.md`, 2026-09-06.

## Finding 2 — Firefox can be served the crawler document instead of the interactive player

**What the client's list asks for:** a shared link lands on the exact video, playing.

**What actually happens, confirmed live, 2 runs, Firefox only** (Chromium: 5 runs clean; WebKit: 3
runs clean): browsing the site normally — Home, a video from a card — then following the app's own
next navigation to that same video (exactly what happens when Share is opened) returns the static
OG/crawler document instead of the interactive page. The response's own `x-crawler: human` header
shows the server correctly identified the visitor as a person; something still routed the request
into the crawler branch. **Confirmed not a stale cache**: `x-vercel-cache: MISS`, on a URL that had
never been requested before. The request-headers actually sent (`sec-fetch-dest: document`,
`sec-fetch-mode: navigate`, `sec-fetch-site: none`) are exactly the shape `isUnfurlFetch()` in
`client/api/_lib/ogDocument.js` is written to treat as a real browser and return `false` for.

**Why it is reported here and not patched.** Something between what left the browser and what the
serverless function evaluated disagreed, and confirming which is only possible from production
function logs, not from outside the response. One thing is worth acting on regardless of the exact
cause: `client/vercel.json`'s static `headers` block sets `Cache-Control: public, s-maxage=300` on
every `/watch/*` response — if this misclassification ever lands on a real, popular video, Vercel's
edge would serve the wrong document to every visitor of that exact URL for up to five minutes
afterward, on any browser. That raises this from "a Firefox quirk" to worth root-causing properly
against real logs before the next release. Full reasoning in `DECISIONS.md`, 2026-09-06.

---

## The smoke-test failure named in the brief

`server/src/cli/smoke.js`'s "creator submits for review" check was failing on every run before this
pass. Root-caused, not guessed at: it was **two** harness gaps stacked on top of each other, not a
product bug.

1. `POST /api/videos/:id/submit` has required `confirmRights: true` since `0e4eeb8` (14 Aug,
   predates this whole engagement) — a real checkbox in `UploadTab.jsx`, added because a copyright
   claim had once arrived with no evidence the creator ever made that representation. The harness
   never sent it.
2. Fixing that surfaced the layer beneath: on production, Cloudflare Stream is really configured,
   so video creation gets a genuine `cloudflare_uid` — meaning the route's very next check
   (`state === 'ready'`) is what actually gates it, and this harness has never uploaded a real
   video file, by design (`no Cloudflare in the test`, its own comment says).

Both are the harness never exercising real file upload — not a defect in the product. Fixed in
`server/src/cli/smoke.js` (commit `c228f91`) by sending `confirmRights: true` and accepting the
`409 still processing` outcome the same way the suite already accepted the `400 upload the video`
one. **`npm run smoke`: 39/39, clean.**

---

## Suites, at the end of this run

```
server:  npm test    → 137/137
server:  npm run smoke → 39/39
client:  npm run verify (test + hover:audit + split:audit + build + smoke:render) → unchanged, still green
db:status → 037_creator_capital.sql is the latest migration, all applied, nothing pending
```

No migrations, no production code changes were needed for this pass beyond the one smoke-harness
fix above — everything else here is test evidence and two newly-found, clearly-scoped defects for
a deliberate decision on priority.

## Test data

Every fresh account this run created (`e2e+reg*@mtonyo.test`, plus a short-lived dual-sided
`e2e+creator@mtonyo.test` fixture used only to prove the Viewer↔Creator switch) has been reversed
through `cleanup-e2e.mjs --apply`, refund-then-delete for every one with a purchase. Verified after:
zero orphaned `purchases` rows, zero orphaned `earnings` rows, and the only `e2e+%@mtonyo.test`
account left on production is the one documented, long-lived fixture
(`e2e+8238822854@mtonyo.test`, `E2E-ACCOUNTS.md`). `demo.asha@mtonyo.demo`'s Creator Capital record
used for the admin-workflow leg was deleted after the run completed and its final `active` status
was confirmed in the database — the account itself is untouched (2 of 6 months, unchanged).
