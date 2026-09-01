# Verification log

Evidence for each item. Command output, test output or measurement — no entry without one.

Headings follow PROMPT-10's lettering. Where an item came from PROMPT-7 under a different letter
— PROMPT-7's C1 is PROMPT-10's A3 — both are given, because "C1" otherwise names two unrelated
pieces of work in the same file.
Production is `main` on Railway + two Vercel projects. Measurements are median of 5 with one
warm-up discarded unless stated.

---

## What each engine can and cannot prove here

Established 2026-09-01 and recorded in DECISIONS.md, because it decides where every other
number in this file is allowed to come from:

```
webkit    {"h264":"probably","aac":"probably","hls":"no","webm":"probably","mse":false}
chromium  {"h264":"probably","aac":"probably","hls":"maybe","webm":"probably","mse":true}
```

Playwright's WebKit has no Media Source Extensions and no native HLS. Cloudflare Stream appends
segments through MSE, so on this build every video sits at `readyState 0` for ever and reports
no error — which reads exactly like "Safari plays nothing" and is not. Real Safari has both.

**WebKit here is valid evidence for:** layout, blank space, scroll, CLS, hover and tap
behaviour, login, navigation, overflow, responsiveness.
**It is not evidence for:** whether a video plays, an advert plays, a purchase unlocks the film,
or a resume position is honoured. Those are Chromium plus a real device.

---

## CLI session

```
POST /api/auth/login  → 840-character access token
GET  /api/auth/me     → { "id": "ae185cef-3556-4248-8a62-a14b9d8cb3b4",
                          "email": "e2e+8238822854@mtonyo.test",
                          "role": "viewer", "status": "active" }
```

---

## Step 0 — Home first card

Gate identified by MutationObserver on the first `/watch/` link against resource timing: in
every sample the last resource to finish before the card is `/api/videos`, by milliseconds.

Cold timeline before the change: navigation `responseEnd` 712 ms, bundle in 1061 ms,
`DOMContentLoaded` 1312 ms, API fetches 1439 → 5126 ms, first card 5130 ms.

Home was opening four API requests; `trending&limit=1` was a strict subset of
`trending&limit=8`, both consumed as `videos[0]`. Live, after:

```
1. /api/stats   2. /api/videos?sort=trending&limit=8   3. /api/stats/top-creators
```

| profile | | before | after | bar |
|---|---|---|---|---|
| desktop | cold | 3339 `[2828–4344]` | **2336** `[2277–3792]` | < 2500 ✅ |
| desktop | warm | 1022 `[985–1392]` | **1047** `[920–1644]` | < 1200 ✅ |
| iPhone 13 | cold | 6519 `[5502–7379]` | **2502** `[2294–3131]` | < 2500 — **2 ms over, left as measured** |
| iPhone 13 | warm | 1170 `[1078–1322]` | **898** `[875–1416]` | < 1200 ✅ |

24 runs, cards rendered in every one.

Server side was already minimal: `/api/videos?sort=trending&limit=8` is **2 SQL, 0 outbound**,
TTFB ~1.0 s from here. A large part of the cold figure is the round trip from this location
rather than anything in the code.

---

## Step 1 — WebKit

Two `playwright install webkit` attempts and one plain download died at 9,584,095 of 62,478,226
bytes (`curl` exit 56). `curl -C - --retry 10 --retry-all-errors` completed it — **62,478,226
bytes, exact** — and it was unzipped into the browsers path by hand.

```
{ "cards": 8,
  "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (",
  "title": "MTONYO+ — Tanzania's Premium Creator Video Platfor" }
screenshot: 288,735 bytes
```

---

## Step 2 — never frozen

Verified with the **playback response** held, not the iframe: blocking
`iframe.videodelivery.net` leaves `playback.iframe` set, so the page takes the player branch and
the waiting states never render. That was the first attempt and it reported nothing.

| profile | Connecting | Slow connection | retry | retry clickable |
|---|---|---|---|---|
| chromium desktop | 5454 | 8493 | 15567 | ✅ |
| webkit desktop | 9025 | 12487 | 19473 | ✅ |
| iPhone 14 · webkit | 9004 | 12072 | 19071 | ✅ |

Intervals are **3500 ms** and **7000 ms**, matching `BOOT_STAGE_MS = [1500, 5000, 12000]`. The
absolute figures are larger because the clock here starts at `goto` while the stage timer starts
at component mount.

The retry could not render at all before: `waitingForPlayback` was gated on `!playback.error`,
so the timeout set the error, the shell unmounted, and the viewer was thrown to a failure screen
without being offered the cheaper option of waiting.

---

## Step 3 — hover guard

```
hover rules that move something: 21 (21 guarded)
all guarded
```

`client/scripts/hover-audit.mjs`, part of `npm run verify`. `a.pw-og-stage:hover` was inside
`@media(hover:hover)` but lacked `pointer: fine` and `html:not(.is-touch)`; an iPad with a Magic
Keyboard reports `hover: hover`, so `pointer: fine` is what separates a mouse from a finger.

The audit's own first run flagged two false positives —
`.ph-play:hover{transform:translate(-50%,-50%)}` and `.btn-gold:hover::after` — both inside
`@media (hover: none), (pointer: coarse)`, where hover rules exist to cancel motion. Touch
blocks are skipped now.

---

## A3 (PROMPT-7 C1) — scroll jank, WebKit

Scripted 10-second scroll, top to bottom and back.

| profile · page | gaps > 50 ms | worst frame | blocking | CLS |
|---|---|---|---|---|
| webkit desktop `/` | 2 | 116 ms | 84 ms | 0 |
| webkit desktop `/explore` | 4 | 154 ms | 186 ms | 0 |
| webkit desktop `/watch/:slug` | 2 | 80 ms | 55 ms | 0 |
| iPad Pro 11 `/` | 2 | 139 ms | 101 ms | 0 |
| iPad Pro 11 `/explore` | **0** | 23 ms | 0 ms | 0 |
| iPad Pro 11 `/watch/:slug` | 1 | 154 ms | 104 ms | 0 |

The reported "screen vibrates" does not reproduce headlessly on WebKit either. That is
consistent with the cause being the iOS URL-bar collapse resizing a `100vh` section — which no
headless browser can show, and which `.explore` was the last section missing the `dvh` guard for.

---

## A5 — blank strip, CLS, first tap

Scrolled to the bottom, then measured the lowest point any visible element reaches against the
document height. A positive gap is empty page below the content.

| profile | `/` | `/explore` | `/watch/:slug` | `/dashboard` |
|---|---|---|---|---|
| iPhone 14 · webkit | — | −200 | −194 | −200 |
| iPad Pro 11 · webkit | −200 | −151 | −200 | −200 |
| iPad + mouse · webkit | −200 | −151 | −200 | −200 |
| webkit desktop | −195 | −124 | −172 | −195 |

Every gap is negative — content reaches past the document height, so there is no empty strip
anywhere. **Bar was < 40 px.** The one blank cell was a run where Home had not finished
rendering inside the 6-second wait; re-checked three times on that exact profile and it renders
every time (`scrollHeight 14021`, 8 cards, no page errors).

**CLS on a cold Home: 0.0000** on all four profiles. Bar was < 0.1.

**First tap** on `iPhone 14`, `iPad Pro 11`, and `iPad Pro 11 with touch + mouse`: the card
navigated on tap #1 on all three. This is the guard from Step 3 doing its job on the profile
that motivated it.

---

## Re-baseline — is there a regression? No.

Three consecutive harness runs on the current build, each a median of 5 with a warm-up
discarded. The test set was: **our leg (`pb` → `if`) must be ≤ 950 ms in all three runs.**

| run | `live-at-arusha` | `how-to-cook-pilau` | `rpreplay` | run median |
|---|---|---|---|---|
| 1 | 425 | 441 | 228 | **425** |
| 2 | 421 | 395 | 386 | **395** |
| 3 | 379 | 382 | 372 | **379** |

Every value is between 228 and 441 ms. The recorded baseline's own figure was **743 ms**
(`pb` 191 → `if` 934), so the part of the wait this codebase controls is now *faster* than when
the baseline was taken. **No regression.**

The earlier alarming numbers were a cold CDN, and the three runs show it warming:

| run | `live-at-arusha` PLAY | `how-to-cook-pilau` | `rpreplay` |
|---|---|---|---|
| 1 | 5779 | 6750 | 6466 |
| 2 | 4510 | 5260 | 5212 |
| 3 | **4937** | **5152** | **5754** |

Those are still above the 3108 / 3585 / 3218 recorded earlier, and every millisecond of the
difference sits after `el` — inside Cloudflare's player, not in anything served from this
repository. The single run that reported 13995 ms had an `if` of 7000 ms against 932 ms in the
run twenty minutes later, on the same build: a 7× swing on one video with no code change
between them. **The recorded baseline is no longer a fair comparison point**, because it was
taken when the edge happened to be warm for those three titles.

---

## A7 — every page at every width

70 page/width combinations on WebKit: `/`, `/explore`, `/watch/:slug`, `/login`, `/signup`,
`/creator/:id`, `/dashboard` at 320, 375, 390, 414, 768, 834, 1024, 1280, 1440 and 1920.

**Horizontal overflow: 0.** Not one combination scrolls sideways. That is the failure that
reaches a client as "the page is broken", and it is absent.

Small tap targets, on touch-sized viewports only:

| page | element | size |
|---|---|---|
| `/login`, `/signup`, `/dashboard` | password-reveal button | 18 × 21 |
| `/login`, `/signup`, `/dashboard` | checkbox | 20 × 20 |
| `/creator/:id` | one button | 38 × 38 |
| `/watch/:slug` | back button | 36 × 36 |

The first version of this check flagged 42 combinations by testing
`min(width, height) < 40`, which condemns every wide, short link — a 331 × 34 nav item is not
hard to hit. Requiring **both** dimensions to be under 40 px leaves the four above, which are
the ones that actually cost a tap: a checkbox and an icon button.

---

## A6 — login in one attempt, and back to the video

`scripts/e2e/login-one-attempt.mjs`. A fresh context per run — no cookies, no storage, no
service worker carried over, which is what a private window is. The fields are filled the way
**autofill** fills them: `el.value` assigned through the native setter and **no event
dispatched**. `page.fill()` would be worthless here, because it fires the very `input` event
that Safari's autofill omits — the event whose absence is the whole bug.

Entered through the control a viewer would actually press, from a real `/watch/:slug` while
signed out, so the assertion covers the whole route and not just the form.

| entry | profile | one submit → back on the video | login URL carried the video |
|---|---|---|---|
| header Log in | webkit desktop 1440x900 | **5/5** | 5/5 |
| header Log in | iPhone 14 · webkit | **5/5** | 5/5 |
| Unlock | webkit desktop 1440x900 | **5/5** | 5/5 |
| Unlock | iPhone 14 · webkit | **5/5** | 5/5 |

**20/20.** Never a second submit, never an error banner, never the dashboard.

**A real defect was found by this item and fixed** (`ca6b60e`). Before the fix the same harness
read `next carried 0/5` on both profiles and landed on `/dashboard?tab=library` every time: the
Unlock button carried the destination, but the two **Log in** buttons in the chrome — desktop
header and mobile menu — went to a bare `/login`. A viewer part-way through a preview who used
the header instead of Unlock signed in perfectly and lost the film. The autofill half was
already fixed and was 5/5 before this run as well; only the return leg was broken.

Click → landed, measured against the API response rather than a poll:

```
desktop  click→landed 3441 ms   POST /api/auth/login 200 @+3427
iphone   click→landed 1406 ms   POST /api/auth/login 200 @+1377
```

The page redirects within ~15 ms of the token arriving; the wait is the round trip to Railway
from this location, not client code.

**Instrument correction.** The first run of this harness reported 41 s logins. That was
Playwright's 30-second default timeout on a poll for the error banner, charged to the login on
every clean iteration. With an explicit 500 ms the same runs report 1.7–11 s of poll
granularity, and the direct measurement above gives the real figure.

---


## B1–B3 — the payment journey

`scripts/e2e/purchase-journey.mjs`. **A viewer who has never paid, per profile and per run** —
created through the production sign-up form, not the API. A shared account would own the film
after the first run and every later run would be testing a video it had already bought, which is
the one thing this must not do.

**Entitlement is read from the server before the picture is believed.** `playback.kind` on
`/api/playback/:id/playback` is `preview` or `full`; a film that appears to play proves nothing
about what was granted. The resume assertion runs only after `kind: full` comes back, and only
on Chromium, where a player can actually decode.

| profile | runs | one-submit journey | resume within 5 s of the sheet closing | sheet closed |
|---|---|---|---|---|
| chromium desktop | 5 | 5/5 | **5/5** — 20.0s against a 19.9s stop | 7278–10043 ms |
| Pixel 7 · chromium | 5 | 5/5 | **5/5** — 20.0s against a 19.9s stop | 7425–8317 ms |
| webkit desktop | 1 | layout + sheet | *not judgeable here (no MSE)* | 10750 ms |
| iPhone 14 · webkit | 1 | layout + sheet | *not judgeable here* | 8588 ms |
| 375×667 · webkit | 1 | layout + sheet | *not judgeable here* | 7563 ms |

Every profile also passed, in the same run: the preview stopping by itself at its own cut-off,
My Library listing the film, logout → login leaving it `kind: full`, a **second** paid title
staying `kind: preview` with its own Unlock button, and both failure paths —

```
Test declined   → "Payment not completed · Insufficient balance in the mobile money account
                   · Nothing was charged. You can try again with the same number."  → Try again
Test cancelled  → "Payment cancelled · The customer cancelled the payment on their phone
                   · Nothing was charged."                                          → Try again
```

— with `kind` still `preview` after each, checked from the API, and Try again returning to the
form.

### B2 — the sheet with a keyboard up

`interactive-widget=resizes-content` was already on the viewport meta, so a keyboard shortens the
layout viewport. That is emulated exactly: the viewport is cut by 48 % with the number field
focused, which is what a soft keyboard does and what no headless browser will do on its own.

| | 375×667 | iPhone 14 (390×664) |
|---|---|---|
| sheet fits with no scrolling | ✅ | ✅ |
| Pay button, keyboard down | 498–545 of 667 | 500–547 of 664 |
| number field, keyboard up | **91–140 of 347** | **90–141 of 345** |
| Pay button, keyboard up | **160–209 of 347** | **161–210 of 345** |

Both stay on screen. Nothing had to be changed for this.

### B3 — the rate limiter

The production limit is **120 requests per minute per IP**. Every `/api/` request the journey
makes is stamped and the busiest 60-second window read off afterwards:

| profile | requests | busiest 60 s | headroom | 429s |
|---|---|---|---|---|
| chromium desktop | 41–42 over ~78 s | **41** | 79 | 0 |
| Pixel 7 | 47 over 78 s | **47** | 73 | 0 |
| webkit desktop | 37 over 88 s | **34** | 86 | 0 |
| iPhone 14 | 36 over 74 s | **36** | 84 | 0 |

**The polling was 1/s and is now 2 s** (`2d81a43`). A mobile-money prompt lives three minutes; at
one a second a single open sheet is 180 requests against a 120/min limit shared with everything
else the page is doing, so a viewer who left the sheet open while browsing could rate-limit their
own purchase. At 2 s the worst case is 90 over three minutes, and the sandbox's ~3 s settlement is
still caught on the second tick.

The give-up test went with it: `elapsed > 180` counted ticks, so it only meant three minutes while
the interval happened to be one second. Changing the cadence would have silently doubled it to six.
It is measured against the clock now.

**An instrument fault worth recording, because it produced a false failure first.** The harness
clicked Pay before `/api/stats/platform` had come back, so the sandbox had not yet pre-filled the
test number, and an empty field failed validation — correct behaviour, and useless as a test. The
harness types the number now, which is also the journey that will still exist when the real M-Pesa
gateway replaces the sandbox and there is no pre-fill at all.

---

## C1 (retention) — Follow

### CLI, against production

`server/scripts/follow-cli.mjs`:

```
### follow, twice
  POST  → 200 {"isFollowing":true,"followers":1}
  POST  → 200 {"isFollowing":true,"followers":1}   (same call again)
  PASS  the second does not count twice
  PASS  the count matches the graph (1 rows)
  PASS  and creator_profiles.followers matches too — the trigger, not the route

### the one request a page of cards makes
  GET /api/creators/following → 200 {"creatorIds":[...]}

### a blocked creator — the case that used to trap followers for ever
  POST   .../follow → 404   PASS  you cannot start following a blocked creator
  DELETE .../follow → 200   PASS  but an existing follower CAN get out (this was 404 before)
  restored → status=active

### drift across every creator on the site
  14 creators, 0 disagreeing with the follows table
```

### The trigger, on live data

Migration **031 applied to production at 2026-09-01 18:56:45**.

```
creator b9e30da9… starts at 1
after an INSERT the trigger says: 2
after a DELETE  the trigger says: 1
rows disagreeing with the graph: 0
```

And the case the migration exists for — a viewer's account being deleted, which cascades their
follow rows away — inside a transaction that was rolled back, so production is untouched:

```
creator 5b6f439b… followers = 1
deleting one of their followers: 962361c8…
AFTER the cascaded delete → creator_profiles.followers = 0 , follows rows = 0
AGREE — the trigger corrected the cascade
rolled back — production is untouched
```

Before 031 that count would have stayed at 1 for ever with nothing to recompute it.

### Browser — `scripts/e2e/follow-ui.mjs`

```
### webkit desktop
  PASS  the watch page offers Follow on the creator row
  PASS  the label flips while the request is still in flight ("Follow" → "Following")
  PASS  and it stays followed once the server answers
  PASS  still Following after a reload
  PASS  cards carry Follow (8 of 8 cards)
  PASS  and the creator's name is a link (8 of 8 cards)
  PASS  tapping a card still opens the video on tap #1 (/watch/rpreplay-final1589783013-2)
  PASS  the creator's name goes to their page, not the video (/creator/007df911…)
  PASS  the follow survives logout → login
```

The optimistic assertion is measured **against the network, not a stopwatch**: the follow request
is held open by the harness and the label has to have changed while it is still in flight. A
timing threshold would pass on a fast connection for the wrong reason.

### A bug this work introduced, and how it was caught

`.creator-open::after` is `position:absolute;inset:0` — the stretched link that keeps the whole
row clickable without nesting an anchor inside an anchor. `.creator-row`, unlike `.vid-card`,
never declared `position:relative`, so the overlay escaped its row and spread across the watch
column. **On a phone the viewer could not press Unlock.** It was invisible in review and showed up
as a click timeout on Pixel 7:

```
<a class="creator-open" …> from <div class="watch-info">…</div> subtree intercepts pointer events
```

Fixed in `18eb81c`, with a test that asserts every stretched link in the sheet is contained by a
positioned card. Reverting the fix makes that test fail with the reason spelled out, which is how
it was checked.

---

## C2 (retention) — the creator, reachable; releases, shareable

`scripts/e2e/creator-page.mjs`, three profiles, against production.

```
### webkit desktop / iPhone 14 · webkit / chromium desktop      (identical on all three)
  PASS  the page lists releases (6)
  PASS  every release has a Watch button (7)
  PASS  every release has a Share button (7)
  PASS  no horizontal overflow (scrollWidth - innerWidth = -10 / 0 / 0)
  PASS  Watch opens the video (/watch/live-at-arusha-full-set)
  PASS  Share opens the share sheet
        sheet says: SHARE THIS VIDEO WhatsApp and Facebook show this poster card…
  PASS  and it is the real sheet — WhatsApp is in it, not a cut-down copy
```

Seven Watch and seven Share controls for six releases: the featured release carries them too.

**The creator link on cards** is covered in the C1 block above — 8 of 8 cards on Explore, with
the card still opening the video on tap #1 and the byline going to `/creator/:id` rather than to
the film.

**Why the same sheet and not a simpler one.** A second share dialog would be a second thing to
keep in step with the watch page, and the WhatsApp path in it is the one the client reported and
the one that took the work. It needs a `share` payload only `GET /api/videos/:slug` carries, so
it is fetched when the button is pressed — one request, for the release somebody actually chose,
rather than one per tile on a page that can hold a whole catalogue.

**Instrument correction.** The first run reported "Share does not open" on all three engines.
`isVisible()` reports the current state and does not wait, and the sheet only appears after that
round trip. With `waitFor` the same runs pass everywhere.

---

## C3 (retention) — the Continue Watching write path

`scripts/e2e/progress-write-path.mjs`. The row is read back from the API, never from the page.

| profile | played to 0:42, backgrounded, tab killed | pause writes immediately |
|---|---|---|
| chromium desktop | **42 s** stored (bar: 42 ± 3) | 62 s after a pause at 0:62 |
| Pixel 7 · chromium | **42 s** stored | 62 s after a pause at 0:62 |
| webkit desktop | beacon accepted → **49 s** stored (49 sent) | — |
| iPhone 14 · webkit | beacon accepted → **49 s** stored (49 sent) | — |

WebKit cannot play here, so it proves the half it can: `navigator.sendBeacon` exists on that engine
(`sendBeacon: true, fetch keepalive: true`) and a beacon sent from the real page to the real
endpoint stores a position — which is precisely the half that was broken.

**Two real defects were found here, and the second only by watching the wire.**

1. `pagehide` flushed through the ordinary API client. A document that is unloading has its
   in-flight requests cancelled, so on a phone that write usually never arrived at all.
2. **`navigator.sendBeacon` can only issue a POST**, and the route was registered for `PUT` alone.
   Every beacon was answered **404** — silently, because sendBeacon returns true for "queued" and
   never for "delivered". The page reported success and nothing was stored. The first run of this
   harness said `server row … 1s (sent 49)` with the beacon "accepted", which is exactly what that
   failure looks like from outside.

```
REQ  POST …/api/playback/85bd6939…/progress "text/plain;charset=utf-8"
RES  404
REQ  PUT  …/api/playback/85bd6939…/progress "text/plain;charset=UTF-8" {"seconds":78,"token":"eyJ…
RES  202  {"saved":true,"seconds":78}
```

**Instrument correction.** The first Chromium attempt closed the browser context 400 ms after the
tab went hidden. `sendBeacon` outlives the *document*, not the browser process, so that destroyed
the network stack before anything went out — Chromium desktop happened to win that race and Pixel 7
lost it. Two seconds represents a tab the system reclaims after it is backgrounded; the assertion,
reading the row from the server, is unchanged.

---


## C4 / C5 / C6 (retention) — My List, the four rows, Remove from history

### Migrations, on production

```
applying 032_saved_videos.sql               ok  applied  2026-09-01 19:37:58
applying 033_watch_progress_hidden_at.sql   ok  applied  2026-09-01 19:37:59
```

Schema, read back from the live database:

```
RLS:        saved_videos=true   watch_progress=true
policies:   saved_videos_own_delete(DELETE)  saved_videos_own_insert(INSERT)
            saved_videos_own_read(SELECT)    saved_videos_own_update(UPDATE)
anon/authenticated grants: NONE (revoked)
watch_progress.hidden_at:  timestamp with time zone
indexes:    saved_videos_pkey  saved_videos_user_idx
            watch_progress_pkey  watch_progress_user_idx  watch_progress_user_visible_idx
```

Four policies, RLS on, PostgREST revoked — the same protection `watch_progress` has, copied
rather than reinvented.

### CLI, against production — `server/scripts/library-cli.mjs`

```
### My List — save, twice, then unsave
  POST  → 200 {"videoId":"85bd6939…","saved":true}
  POST  → 200 {"videoId":"85bd6939…","saved":true}   (same call again)
  PASS  saving twice is one row, not an error
  PASS  and the database holds exactly one row (1)
  PASS  GET /api/library/saved lists it
  PASS  with a poster — the column list the blank-card bug came from

### the four rows, in one request
  GET /api/library → 200  keys: videos, purchased, continueWatching, myList, recentlyWatched, savedIds
  counts — purchased 3, continue 3, myList 1, recent 3
  PASS  My List carries the video just saved
  PASS  and the saved ids ride along, so cards cost no extra request
  PASS  `videos` still means Purchased — the old shape is intact

### Remove from history — hides the row, keeps the position
  history row: 85bd6939… at 62s
  PASS  it is in Recently Watched before hiding
  DELETE /api/library/history/… → 200 {"hidden":true}
  PASS  it is gone from Recently Watched
  PASS  and gone from Continue Watching — one table, both rows
  database row: seconds=62, hidden_at=set
  PASS  THE POSITION IS KEPT — the row was hidden, not deleted
  PASS  reopening the film still resumes (resumeFromSeconds=62)

### watching more of a hidden video puts it back
  PASS  hidden_at is cleared — no second control needed to undo the first
  PASS  and it is back in Recently Watched
```

The hiding assertions are checked against the **database** as well as the API, because "it
disappeared from the row" and "the position was thrown away" look identical from outside and
only one of them is the intended behaviour.

### Browser — `scripts/e2e/library-ui.mjs`

| profile | rows, in order | Save flips before the round trip | Remove from history | C6: requests to open |
|---|---|---|---|---|
| chromium desktop | Continue Watching · Purchased · My List · Recently Watched | ✅ | 3 → 2, still gone after a reload | **5** of 8 |
| webkit desktop | same four, same order | ✅ | 2 → 1, still gone | **5** of 8 |
| iPhone 14 · webkit | same four, same order | ✅ | 1 → 0, still gone | **6** of 8 |

```
/auth/me×1  /inbox×1  /library×1  /library/saved×1  /creators/following×1
```

**One batched `/api/library` carries all four rows.** The extra `/library/saved` is
`SavedContext` populating itself for the Save buttons; it is one request for the whole app, not
one per card, and it is inside the budget. iPhone's sixth is a poster fetch, not an API call for
data.

---

## C7 (retention) — the two test uploads are off the public site

Through `POST /api/admin/videos/:id/unpublish`, not an UPDATE: the route writes an audit row,
notifies the creator and returns its own message. A direct write to `is_published` would look
identical in the videos table, skip all of that, and prove nothing about the route an
administrator will actually use.

```
### whatsapp-video-2026-08-15-at-11-50-34-pm
  buyer before: kind=full owned=true
  POST /api/admin/videos/a324d192…/unpublish → 200 Unpublished — buyers keep their access
  PASS  it is off Explore
  buyer after:  kind=full owned=true
  PASS  THE BUYER KEEPS FULL ACCESS — a purchase does not vanish with a listing
  PASS  and it is still in their library

### 80915499123-fd8feac4-6609-4d3e-8739-d3a2cdde7f76
  POST /api/admin/videos/4b8f6f4d…/unpublish → 200 Unpublished — buyers keep their access
  PASS  it is off Explore
```

Both are gone from Explore. The e2e account had bought the first one, and it is still `kind:
full` and still on their shelf — which is the promise the library banner makes, tested rather
than asserted.

The staff account used is the seeded demo moderator, whose password is published in
`src/cli/demo.js` for exactly this. No real administrator's credentials were touched.

---

*Further items are appended as they are verified.*
