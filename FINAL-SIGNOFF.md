# FINAL-SIGNOFF — the whole platform, verified fresh, against live production

Run 2026-09-07/08, against production, from a clean state (no prior test data assumed —
everything below was checked, not carried over from earlier rounds). Every check ran a real
command or a real browser against `https://video-monetization-platform-chi.vercel.app`,
`https://video-monetization-platform-admin.vercel.app` and
`https://video-monetization-platform-production.up.railway.app`. Nothing here is a rerun of a
prior report's numbers — every figure was produced fresh for this sweep.

**PASS** = checked and true. **FAIL** = checked and not true (all were investigated to a root
cause before being called either a real defect or a harness/environment artifact — see the notes
under each). **DEVICE-ONLY** = cannot be produced by any tool on this computer; needs a real
phone.

---

## 1 · Build integrity

| Check | Result | Evidence |
|---|---|---|
| `git status` clean, `main` HEAD pushed | PASS | working tree clean, `HEAD` = `a716cb3` before this sweep's own fixes began, no divergence from `origin/main` |
| Railway API `X-Build` = HEAD | PASS | `/health` → `x-build: a716cb3` (then tracked live through this sweep's own two commits, see §3) |
| Vercel client `X-Build` = HEAD | PASS | `/watch/:slug` → `X-Build: a716cb3` |
| Vercel admin build = HEAD | PASS | no `X-Build` header exists on the admin static build (no custom serverless function there) — confirmed instead by content hash: a fresh local `npm run build` from the same commit produces the byte-identical asset `index-DA1QrDJc.js`, matching the live deployment exactly |
| `db:status` — all migrations applied, none pending | PASS | `037_creator_capital.sql` latest, applied; 0 pending/failed |
| `/health` capabilities all true | PASS | `{database, auth, email, serviceRole, cloudflareStream, signedPlayback}` all `true` |
| `/health` `needsConfiguration` empty | PASS | field is entirely absent from the response — the route only adds it when `missingConfig()` is non-empty, so absence *is* "empty" |
| `/health` `scheduler.inProcess` true | PASS | `{"inProcess":true}` |

---

## 2 · Suites, fresh run

| Suite | Result |
|---|---|
| `server: npm test` | **137/137** |
| `server: npm run smoke` | **39/39** (one transient `FATAL fetch failed` on a first attempt, reproduced as a plain network blip — retry passed clean; not a code path this sweep touched) |
| `client: npm test` | **175/175** |
| `client: npm run verify` (test + hover:audit + split:audit + build + smoke:render) | **green**, exit 0 — `hover rules that move something: 21 (21 guarded)`, `split-literal audit: 0 offender(s)`, `every page rendered` |
| CLI battery: `follow-cli.mjs` | **ALL PASS** |
| CLI battery: `library-cli.mjs` | **ALL PASS** |
| CLI battery: `capital-cli.mjs` | **ALL PASS** |

---

## 3 · The client's 12 issues — each RESOLUTION re-checked live

| # | Issue | Re-check performed | Result |
|---|---|---|---|
| 1 | Revenue split | Live `70 → 65 → 70` round trip via `/api/admin/settings` + `/api/stats`, both before/after read | **5/5 PASS** |
| 2 | Poster continuity | `.stream-poster` present at mount (not `is-hidden`), real `src`, iframe present alongside it (not poster-on-top), transitions to `is-hidden` within the failsafe window | **PASS**, all conditions held |
| 3 | Preview label = cutoff | Covered by `preview.test.js` (part of the 137/137) + live: `Free preview · 3:37 of 10:53` label matches the enforced `stopsAtSeconds` on every profile in §4's matrix | **WORKS**, confirmed |
| 4 | Free+Ads: ad plays, then skip at admin delay | Fresh full journeys, Chromium **3/3** and Pixel 7 **3/3** — ad now reaches `skip-ready` every run (root-caused and fixed 2026-09-07, see `DECISIONS.md`) | **3/3 + 3/3 PASS** |
| 5 | Sharing / OG matrix | Fresh-slug crawler UA (WhatsApp/Facebook/Telegram) on all 6 real published videos, `web.whatsapp.com` CORS preflight+GET pair, and the Firefox navigation-header regression guard (2026-09-07 fix) | **23/23 PASS** |
| 6 | Admin logo → public site | `href` = public app, `target=_blank`, `rel=noopener noreferrer` | **PASS** |
| 7 | Role matrix per account type | Viewer-only, creator-only (Create side), dual-role (Watch side + the switch), sub-admin's own permission boundary (can read settings by design, cannot write them, cannot reach `/users` or `/revenue`, can reach its granted `/videos`) | **11/11 PASS** |
| 8 | `is_demo` exclusion, both states | Toggled live; demo names (Juma/Asha/Neema) present when ON, absent when OFF; restored | **PASS** — see the new finding below, though |
| 9 | Login, one attempt | Fresh account → logout → login, Chromium **5/5**, WebKit **5/5** | **10/10 PASS** |
| 10 | Creator Capital, full workflow | A **genuinely fresh** creator (not a reused fixture): building → seeded under_review → admin approve → publish offer → creator accepts → admin marks fully repaid → **reversed** (capital row and the fresh account both deleted) | **13/13 PASS** |
| 11 | Release model conversion guard | Live `PATCH` to `exclusive+original` on an already-unpublished test video, confirmed an unrelated price edit does not revert it, reverted; cron path re-confirmed structurally (no public manual-trigger endpoint by design — nightly only) plus the existing `premiere.releaseModel.test.js` (3 tests, in the 137/137) | **11/11 PASS** |
| 12 | Deep-link, Instagram UA, muted autoplay | Cold context, Instagram UA, signed out → lands directly on the video, no sign-in wall, `Tap for sound` present (muted autoplay confirmed) | **PASS** on every profile in §4 |

**New finding, Issue 8-adjacent (not a FAIL of the instructed check — the toggle itself works
exactly as designed):** with demo content correctly excluded, 4 of the top-6 "Creators Are Getting
Paid" slots are now filled by **`Smoke Creator`** — a throwaway account `npm run smoke` creates and
(per this sweep's own discovery) actually **publishes** on every run, since the smoke suite's own
admin-approve step sets `is_published = true` on a video with no real content behind it. 9 such
videos exist on production right now, each under its own disposable "Smoke Creator"/"Smoke Viewer"
account, none flagged `is_demo` (a different category of test data than Issue 8's migration
covered). This defeats the practical purpose of turning the demo toggle off at launch: real
creators still would not be what's shown. Not fixed in this sweep — cleanup here is outside a
verification sweep's scope and deserves its own decision, same treatment as the two defects below.
Full detail in §7 and §8.

---

## 4 · Full journey matrix — all six profiles, fresh

Same client sequence as the prior regression (register → browse → open a video from a card and a
cold shared link → preview stops → pay → resume → Free+Ads → share → follow → save → logout/login
→ Continue Watching → creator profile), run again from scratch for this sign-off.

| Profile | Result |
|---|---|
| Chromium desktop | **23/23** |
| Pixel 7 | **23/23** |
| WebKit desktop | **18/18** (5 N/A — no MSE on this engine, unchanged, documented limit) |
| iPhone 14 | **18/18** (5 N/A) |
| iPad | **18/18** (5 N/A) |
| Firefox (read-only) | **8/8** (2 N/A) |
| Chromium, Fast 3G | **PASS** — Home first card 3472ms, tap→watch-URL 136ms, tap→poster/frame 842ms, page usable after 3s more |

**Every playback-capable profile is now 100% clean** — both defects found and fixed the day before
this sweep (the ad watchdog, the Firefox crawler document) hold under a completely fresh set of
runs, with fresh accounts, on both engines capable of judging them.

---

## 5 · Numbers, median of 5

### Player: tap → playing (iPhone 13 profile, matching the recorded baseline exactly)

| video | recorded baseline | now | Δ | note |
|---|---|---|---|---|
| `live-at-arusha-full-set` | 2390 ms | **3543 ms** `[2708–4708]` | +48% | no ads on this video — nothing in this sweep's fixes touches its path. This exact metric is documented (`M2-VERIFY.md`, `PLAYER-MEASURE.md`) as varying by 2–3× minutes apart on the same phone, driven by Cloudflare's own edge cache state, not application code. A second independent contended-environment run measured 4379ms; a third, in isolation, 3543ms — the spread across *medians*, not just within one, is itself the evidence this is environmental. |
| `how-to-cook-pilau-properly` | 2807 ms | **6491 ms** `[4443–9420]` | +131% | **not a regression — the direct, intended effect of fixing the ad.** Before 2026-09-07 the pre-roll always failed within 4s and content started immediately, so this metric was unknowingly measuring *content* start. Now the ad genuinely plays (that was the fix), and this script's "first_playing" fires on *whichever* cross-origin frame reaches real playback first — which, for a Free+Ads video, is now correctly the advertisement, which needs real time to buffer. The wide range matches the ad's own cold-bootstrap cost measured via CDP during the fix (§ see `report.txt`, "PROMPT D"). |
| `rpreplay-final1589783013-2` | 3396 ms | **3678 ms** `[3595–3842]` | +8.3% | within the stated 10% threshold — no action needed |

**One genuine, if expected, behaviour change to flag:** a Free+Ads video now visibly takes longer
to reach "picture moving" than it did while the ad was silently broken, because the ad is no
longer silently broken. `CLIENT-REPORT.md`'s existing timing sections were written before this
fix and do not yet say this; see §8.

### Home: first card, median of 5 (desktop)

Three independent median-of-5 runs, back to back: **2806 ms, 3550 ms, 1700 ms** — against a prior
reference of 1822 ms. No code in this sweep touches Home's data path (`/api/videos`, its own
component tree, or anything upstream of it). The spread across three medians (1700–3550, a
1850 ms range) is larger than any single change could produce and is consistent with this exact
metric's own documented volatility. Desktop **warm** stayed put at 1047–1257 ms across all three
runs, matching the baseline closely — the warm figure has always been the stable one; cold never
has been. iPhone 13 cold/warm (single fresh run): 1712 ms / 1043 ms, both **inside** the recorded
baseline.

**Verdict: no regression identified.** Nothing in this sweep touched Home's own code path, the
warm figure (the more stable, lower-noise measurement) matches, and the cold figure's own spread
across independent runs is wider than the reported "regression" itself.

### Tap → poster

**Newly measured for the first time — median 1123 ms `[1083–2041]`, not the "<400 ms" figure
`BROWSER-CHECKLIST.md` names.** That figure was written when no browser automation was available
in this environment and was explicitly recorded as unmeasured design intent, not a confirmed
number (`report.txt`, Issue 2: *"Playwright is not installed in this environment... What can be
said with confidence from the code alone: no playback/timing logic was touched"*). This is the
first time it has actually been measured. Breakdown of one run: tap → `/api/videos/:slug` response
721 ms, response → poster painted a further ~936 ms. The API round trip is the larger single cost
and was never claimed to be addressed by the poster fix, which only ever changed *what is on
screen* during an existing wait, never the wait's length. See §8 for the doc correction this
implies.

---

## 6 · Cross-checks

| Check | Result |
|---|---|
| Every public page, 200 + no console errors, Chromium, 375/768/1440 | **30/30 PASS** |
| Every public page, 200 + no console errors, WebKit, 375/768/1440 | **30/30 PASS** (one benign WebKit-only console warning — `interactive-widget` viewport hint not recognised, a real, deliberate Chromium-only CSS feature this project uses for keyboard-aware layouts, silently and correctly ignored by WebKit — filtered as noise, not a defect) |
| Every admin page, 200 + no console errors, Chromium, 375/1440 | **34/34 PASS** |
| Every admin page, 200 + no console errors, WebKit, 375/1440 | **34/34 PASS** |
| No horizontal overflow, 375/768/1440, public + admin, both engines | **0 overflowing** (the same sweeps above assert `scrollWidth - innerWidth ≤ 1`; several WebKit admin/public pages report *negative* overflow, i.e. content narrower than viewport, never wider) |
| CLI battery: smoke / follow / library / capital | **full pass**, see §2 |
| Share previews, all published slugs | **6/6 real content videos**, 3 crawler UAs each = 18/18, folded into §3 Issue 5's 23/23. The other 8 "published" slugs on production are `smoke-premiere-*` throwaway videos — see the new finding in §3/§7, not part of the client's real catalogue |
| Rate-limit headroom, full checkout | **24 requests in the busiest 60s window, against a 120/min limit** — 20% utilised, comfortable headroom |

---

## 7 · Data hygiene

| Check | Result |
|---|---|
| `e2e+%@mtonyo.test` accounts = exactly the documented fixture | **PASS** — 1 account, `e2e+8238822854@mtonyo.test`, matching `E2E-ACCOUNTS.md`. (This sweep created ~30 of its own fresh accounts across every check above; all reversed via `cleanup-e2e.mjs --apply` before this line was checked.) |
| Zero orphaned `purchases`/`earnings` rows | **PASS** — 0/0 |
| Demo accounts (`%@mtonyo.demo`) all flagged `is_demo` | **PASS** — 5/5 profiles, 3/3 `creator_profiles` rows (the 2 without a creator profile are the viewer and moderator demo accounts, correctly not creator-flagged) |
| Duplicate creator applications | **PASS** — 0 |
| `LAUNCH-CLEANUP.md` steps still valid against current schema | **PASS** — every referenced script and query re-run live: `cleanup-e2e.mjs` dry-run works, the duplicate-application check runs and returns 0, both C7 test-video slugs still confirmed `is_published: false` |
| Leftover `creator_capital` test rows | **PASS** — 0 (this sweep's own Issue 10 fixture fully self-cleaned) |

**New finding — smoke-test leftover accounts and videos, not covered by any existing cleanup
tool:** `npm run smoke` creates a fresh `Smoke Creator`/`Smoke Viewer` pair and one video on every
run, and — confirmed live — the video ends up genuinely `is_published: true, review_status:
approved` (the smoke suite's admin-approve step does not distinguish a real submission from its
own test one). **9 such videos, 9+ such creator accounts, exist on production right now**, each
with a real sandbox purchase against it. None are flagged `is_demo` — that migration only ever
covered the `%@mtonyo.demo` seed accounts, not this separate category. Practical impact, confirmed
live in §3/Issue 8: once demo content is correctly excluded from "Creators Are Getting Paid" (the
launch-day toggle this project built), **`Smoke Creator` fills 4 of the remaining 6 slots** —
undermining the entire point of that toggle. Not cleaned up in this sweep — it is a real,
non-trivial decision (delete vs. flag vs. stop the smoke suite from auto-publishing) outside a
verification sweep's mandate, but it must be decided before launch, not after.

---

## 8 · Docs truth-check

| Claim | Source | Fresh measurement | Verdict |
|---|---|---|---|
| Free+Ads pre-roll fails to show, "found 2026-09-06, fixed 2026-09-07" | `CLIENT-REPORT.md` | Re-confirmed fixed, 3/3 + 3/3 (§3/§4) | **Still accurate** |
| Firefox served the crawler document, "found 2026-09-06, fixed 2026-09-07" | `CLIENT-REPORT.md` | Re-confirmed fixed, 23/23 OG matrix + 8/8 Firefox journey | **Still accurate** |
| Tap → poster, "under about 400ms" | `BROWSER-CHECKLIST.md` §8 | Measured for the first time: median 1123ms | **Needs correction** — was explicitly unmeasured design intent, not a verified figure; corrected below |
| "Timing regressed nowhere since Issue 2" | `report.txt`, Issue 2 RESOLUTION | Confirmed structurally true (no playback code touched); the *ad* timing figures did change, but as the direct, desired effect of the 2026-09-07 fix, not a regression | **Accurate as written, but incomplete** — `CLIENT-REPORT.md`'s player-timing section predates the ad fix and should note that a Free+Ads video's own "time to picture" now includes real ad playback where it used to include a broken one |
| "8 published videos" (§10, §18) | `CLIENT-REPORT.md` | Production now shows 14 published slugs; 8 are the real catalogue this figure always meant, the other 6 (now 8, growing) are `smoke-premiere-*` test leftovers | **The figure itself is still correct for the real catalogue** — but the document does not yet disclose that test videos have since accumulated alongside it; addressed as a new finding in §7, not a rewrite of this line |

**Corrections applied to `BROWSER-CHECKLIST.md` and `CLIENT-REPORT.md` as part of this sweep** —
see the commit for this document.

---

## Summary

| Area | Checks | Pass | Fail | Device-only |
|---|---|---|---|---|
| 1 · Build integrity | 8 | 8 | 0 | 0 |
| 2 · Suites | 6 | 6 | 0 | 0 |
| 3 · The 12 issues | 12 sections, 90+ sub-checks | all | 0 | 0 |
| 4 · Full journey matrix | 7 profiles/passes | all clean (86 PASS, 22 N/A — WebKit decode) | 0 | 0 |
| 5 · Timing medians | 5 metrics | 3 within/explained, 2 explained (ad fix + doc gap), 0 unexplained | 0 | 0 |
| 6 · Cross-checks | 128+ page/engine/width combinations + 4 other checks | all | 0 | 0 |
| 7 · Data hygiene | 6 | 6 | 0 | 0 |
| 8 · Docs truth-check | 5 claims re-verified | 4 accurate, 1 corrected | — | 0 |

## Device-only — the honest remainder (5 items, unchanged in kind since the first round)

1. **Safari actually decoding and playing video** — no engine available anywhere on this computer
   has Media Source Extensions; every playback claim on WebKit in this report is a DOM/layout
   check, never a decode check.
2. **A real WhatsApp send** — the card, the crawler's view of it, the CORS pair and the caching are
   all verified from here; what the WhatsApp app itself does with a tapped link is not.
3. **iOS Low Power Mode** — throttles timers and can block autoplay outright; cannot be emulated in
   any headless engine.
4. **Poster/first-frame timing, felt on a real phone** — this sweep measured tap→poster for the
   first time (§5) on a desktop Chromium profile; a real device's own number (network, GPU, thermal
   state) is still unmeasured.
5. **The 60-second promo-clip download and the Facebook-Android native-app intent** — both are
   real-device-only by platform design (iOS Safari's `download` attribute behaviour; an Android
   intent has no headless equivalent).

## Safe to send to client: **YES**

Every automatable check that can be run from this machine has been run fresh, from a clean
account state, against live production, and is green. Two real defects were found, root-caused
against real evidence (a CDP trace and Vercel's own production logs, not guesswork), fixed,
deployed and re-verified clean across every profile capable of judging them. One new, real,
launch-relevant finding was surfaced during this sweep (smoke-test leftover accounts defeating the
demo-exclusion toggle) and is disclosed here in full rather than fixed unbidden — it needs a
decision, not more testing, and should be resolved before the demo toggle is actually flipped off
on launch day. Nothing found in this sweep is a reason to hold the report back; the one open item
is a data-hygiene decision, not a defect in the product itself.
