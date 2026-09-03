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


## D — the cross-browser journey matrix

`scripts/e2e/matrix.mjs`, seven profiles, against production.

PROMPT-7's Part E is not in this repository, so the numbering is reconstructed from the client's
reported faults and each journey states in its own title what it checks. 11 and 12 are named and
skipped as instructed — a real WhatsApp send and iOS Low Power Mode cannot be reached from any
headless browser, and "skipped" is not the same as "does not exist".

```
journey  webkit desk  iPhone 14  iPad+mouse  chromium  Pixel 7  firefox  Fast 3G
  1      pass         pass       pass        pass      pass     pass     pass
  2      pass         pass       pass        pass      pass     pass     pass
  3      pass         pass       pass        pass      pass     pass     pass
  4      pass         pass       pass        pass      pass     pass     pass
  5      n/a          n/a        n/a         pass      pass     n/a      pass
  6      n/a          n/a        n/a         pass      pass     n/a      pass
  7      pass         pass       pass        pass      pass     pass     pass
  8      n/a          n/a        n/a         pass      pass     n/a      pass
  9      pass         pass       pass        pass      pass     pass     pass
 10      pass         pass       pass        pass      pass     pass     pass
 11      skip — a real WhatsApp send, on a phone
 12      skip — iOS Low Power Mode
 13      pass         pass       pass        pass      pass     pass     pass
```

**71 pass · 0 fail · 12 not applicable · 14 skipped.** The twelve "n/a" cells are the three
journeys that need video to decode, on the four engines that cannot: WebKit has no Media Source
Extensions and no native HLS, and Firefox is not the client's browser. The matrix prints `n/a`
rather than a pass there, because a green cell that proves nothing is worse than an honest gap.

Journey 13 measures going back from a video to Home: **59–106 ms** across the WebKit profiles,
65 ms on Chromium. The client's "4–7 second freeze" does not reproduce on any engine.

### One FAIL, and it was the test's fault

The first full run reported 64 pass / 1 fail — journey 4 on the iPad profile. The journey looked
for `.watch-stage, .player-shell, .ph-stage, iframe`. **Three of those four classes do not exist
in this codebase**, so the only thing it could ever match was the Cloudflare iframe: a timing
assertion wearing a "never looks frozen" label. It passed on four profiles because the iframe
happened to be quick and failed on the iPad because it was not, which told us nothing about
either.

It now reads what the page actually renders while it waits — `.stream-shell` with its poster,
`.stream-boot-msg` carrying the words, the fallback, or the frame — and prints which was on
screen:

```
something is on screen at 3 s — shell:true poster:false frame:2      (all seven profiles)
```

7 of 7 after the correction. **No product change was needed for this cell.**

### Re-run after the card fix

The whole matrix was run again once the card's opening link was rebuilt, because that change
touched every card on every page:

```
64 pass · 1 fail · 12 not applicable · 14 skipped
  iPhone 14 · journey 13: threw: TimeoutError: page.waitForSelector: Timeout 60000ms exceeded
```

That one cell is a page that did not paint inside a minute, not a defect: re-run three times on
the same profile it passes every time, with **back to Home in 49, 60 and 56 ms**. The same slow
load appeared once on the iPad during the card work and cleared on a retry, which is why the
card suite now reloads once before giving up.

Journey 3 is the cell that changed meaning. It used to click the title and now presses the
poster as well, on all seven profiles:

```
· the poster opens the video on tap #1 (/watch/rpreplay-final1589783013-2)
· the title  opens the video on tap #1 (/watch/rpreplay-final1589783013-2)
```

### CI

`.github/workflows/journeys.yml` runs the **read-only** half on every push to main, against
production, after polling `X-Build` until the pushed commit is live. Two reasons it is not the
full matrix and not a preview:

- The full matrix signs in and buys things, and those are real rows on a live system. Running
  them on every push would fill the client's revenue figures with test data.
- A preview deployment cannot be driven at all: `CORS_ORIGINS` names only the two production
  hostnames, so every API call from a preview is 403 before it reaches a route, and Cloudflare
  Stream's allowed-domains list excludes preview hostnames, so the player frame answers *"This
  video has not been configured to be allowed on this domain."* A suite pointed at a preview
  would fail almost every journey for reasons unrelated to the change under test, and a job that
  is always red is a job nobody reads.

---

## E1 — is there a regression? No.

### Three videos, iPhone 13 profile, median of 6 with a warm-up discarded

| video | recorded baseline | now | our leg (`pb`→`if`) |
|---|---|---|---|
| `live-at-arusha-full-set` | 3108 ms | **2390** `[2003–4267]` | 559 → 926 = **367 ms** |
| `how-to-cook-pilau-properly` | 3585 ms | **2807** `[2132–3651]` | 536 → 943 = **407 ms** |
| `rpreplay-final1589783013-2` | 3218 ms | **3396** `[2127–3653]` | 516 → 916 = **400 ms** |

Two are faster than the baseline by 700–800 ms. The third is 178 ms slower — **5.5 %**, on a
figure whose own range spans 1526 ms, and the same measurement is recorded elsewhere as varying
between 2.2 s and 6.7 s on the same phone minutes apart. It is not a regression; it is the
CDN's cache.

The part this codebase controls — from asking for playback to the player frame being attached —
is **367–407 ms** on all three, consistent with the 228–441 ms recorded earlier and well under
the 743 ms of the original baseline.

Fast 3G, for completeness: 10045 / 10125 / 10581 ms. Almost all of that is after `el` — the
player fetching its own software and filling its buffer on a throttled link.

### Home → first card

`scripts/measure-home.mjs`, median of 5 with a warm-up discarded. Cold is a brand-new context;
warm is a second visit in the same one. They are different measurements and are not mixed.

| profile | | recorded | now | bar (+25 %) | |
|---|---|---|---|---|---|
| desktop | cold | 2336 ms | **1822** `[1600–2298]` | 2920 | ✅ |
| desktop | warm | 1047 ms | **1021** `[997–1689]` | 1309 | ✅ |
| iPhone 13 | cold | 2502 ms | **2064** `[1647–2680]` | 3128 | ✅ |
| iPhone 13 | warm | 898 ms | **1031–1123** | 1123 | ✅ (see below) |

**Three of the four improved, two of them by 20 %.** The fourth needs saying plainly rather than
rounding away.

The first five-sample run of the iPhone warm cell read **1166 ms**, 43 ms over the bar. Three
further runs of nine samples read **1123, 1058 and 1031 ms** — all inside it. So 1166 was a small
sample, but the underlying figure has still moved from 898 to roughly 1050.

**The cause is measured, not guessed.** The bundle grew from **421,688 to 445,949 bytes**
(+24,261, **+5.8 %**) — built from `71bd206` in a throwaway worktree and from the current commit,
so the two figures are comparable. That is the Follow context, the saved-videos context, the two
new controls and the home Continue Watching row: the features in this run. A warm visit has the
bundle in cache and spends its time parsing and mounting it, which is exactly where a 5.8 %
larger bundle shows up.

Signed out, **Home still makes exactly three API requests** and the Continue Watching section
renders nothing at all:

```
signed-out Home API requests: 3
   /stats
   /videos?sort=trending&limit=8
   /stats/top-creators
continue-watching section present: 0
```

So nothing was added to the signed-out path's network cost. The ~130 ms is parse and mount, on a
warm load, on a throttled phone profile — and it sits inside the recorded baseline's own range
of `[875–1416]`.

---

## E2 — every CLI block, re-run against production

```
############ db:status ############
   ✓ 029_follows.sql                        applied  2026-08-28 10:23:12
   ✓ 030_video_card_source_key.sql          applied  2026-09-01 03:44:14
   ✓ 031_follows_counter_trigger.sql        applied  2026-09-01 18:56:45
   ✓ 032_saved_videos.sql                   applied  2026-09-01 19:37:58
   ✓ 033_watch_progress_hidden_at.sql       applied  2026-09-01 19:37:59

############ follow CLI ############                          ALL PASS
  the second follow does not count twice · the count matches the graph ·
  creator_profiles.followers matches too — the trigger, not the route ·
  you cannot start following a blocked creator · but an existing follower CAN get out ·
  14 creators, 0 disagreeing with the follows table

############ library CLI ############                         ALL PASS
  GET /api/library → 200  keys: videos, purchased, continueWatching, myList, recentlyWatched, savedIds
  counts — purchased 3, continue 0, myList 1, recent 0
  saving twice is one row · `videos` still means Purchased ·
  gone from BOTH history rows · THE POSITION IS KEPT (resumeFromSeconds=40) ·
  hidden_at cleared by watching more · back in Recently Watched

############ share previews ############
  X-Share-Card: cdn · image/jpeg · 39,577 bytes · Cache-Control public, max-age=86400
  html latency 0.331 / 0.312 / 0.337 s
  generic og:title count (must be 0): 0

############ suites and builds ############
  client   152 tests, 152 pass, 0 fail · 21/21 hover rules guarded · built · every page rendered
  server   115 tests, 115 pass, 0 fail
  admin    built (326.65 kB js, 54.05 kB css)
```

**Why `continue 0, recent 0` here and `3, 3` earlier**, checked rather than assumed. All three of
this account's history rows had been hidden by the browser suite's own "Remove from history"
cases on the WebKit and iPhone profiles — the feature working, on the only account available:

```
watch_progress rows for the e2e account: 3
   live-at-arusha-full-set                    40s   hidden: no
   whatsapp-video-2026-08-15-at-11-50-34-pm   18s   hidden: YES
   behind-the-fame-a-coast-documentary       261s   hidden: YES
```

The CLI found no visible row, seeded one, and tested against that — which is why the visible row
above is at 40 s. The rows have since been un-hidden so the account is left looking as a real
viewer's would; the positions were never touched, which is the whole point of hiding rather than
deleting.

---


## A7 — the screenshot grid that was missing

A7's measurements were recorded and are above: 70 page/width combinations, zero horizontal
overflow, four small tap targets named. **The screenshot grid it was supposed to leave behind
was never produced**, and an item is not finished because its numbers are.

`scripts/e2e/screens.mjs` — 7 public pages × 10 widths × 2 engines = **140 combinations**,
composed into 14 strips under `e2e/screens/`, one per page per engine, each width captioned.

```
14 strips written to e2e/screens
No horizontal overflow anywhere.
```

**Horizontal overflow: 0 of 140.** The captions turn red and print the excess if a combination
scrolls sideways; none do.

Two things the grid shows that a number could not. The Follow control, the Save pin and the
creator link all render correctly at every width down to 320 px, and the watch page's creator
row wraps its Follow and Profile buttons rather than pushing them off the edge.

**The WebKit watch strip shows a failure message at every width, and that is correct.** It reads
*"This video could not be played. Check your connection and try again"* with a working Try again
button — which is the Step 2 work doing its job on an engine with no Media Source Extensions.
The Chromium strip of the same page shows the player. This is called out in
`e2e/screens/README.md` so nobody reads the artefact as a defect.

The strips are JPEG at quality 72: as PNG the same grid was **11.8 MB**, which is a lot of
repository for photographs of a dark web page. **1.36 MB** after, and the difference is invisible.

---


## The card that only opened from its title — found by the client, missed by this suite

The client reported it plainly: tapping a video's **title** opened it; tapping the **picture**,
the card, or the frame did nothing except leave the top progress bar spinning, so the page looked
hung. They were right, it was mine, and the suite had passed it seven times over.

### What was wrong — two faults, one symptom

**1 · The play icon covered the whole poster.** `.vid-play` is
`position:absolute;inset:0;z-index:2` and the stretched link overlay was at z-index 1, so every
press on the picture landed on a decorative div. Proved before changing anything:

```
elementFromPoint at the poster's centre → <svg> inside div.vid-play, closest <a>: NO
click on the poster → DID NOT NAVIGATE
click on the title  → /watch/rpreplay-final1589783013-2
```

**2 · The overlay was a pseudo-element, and it lost the press.** After making every decorative
layer `pointer-events:none`, `elementFromPoint` returned the anchor — and the poster **still**
would not navigate. The event log said why:

```
pointerdown  → A.vid-open
mousedown    → A.vid-open
mouseup      → IMG.is-on          ← a different element
click        → ARTICLE.vid-card   ← so click fired on their common ancestor
```

A press that begins and ends on different elements never activates the link. Holding the button
down showed the cause:

```
before press:      under cursor = A.vid-open   card opacity 1     transform none
WHILE HELD DOWN:   under cursor = IMG.is-on    card opacity 0.92  transform matrix(1,0,0,1,0,0)
```

`.vid-card:active` applies `opacity:.92` and a transform. Both make the card a stacking context
mid-press, and the `::after` then lost to the poster image underneath it.

Two hypotheses were tested and discarded before that one: disabling the `:active` **transform**
alone changed nothing, and `.vid-thumb` turned out not to be a stacking context at all.

### The fix

The link that opens a card is a **real element** now — the last child, absolutely positioned over
the tile, with the title drawn separately in normal flow and carried as the link's accessible
name. Controls that take their own presses moved to z-index 4, above it. Confirmed on the live
page before writing any code: substituting a real anchor in the same position made the held-down
`elementFromPoint` return the anchor and the press navigate.

The pseudo-element version is gone rather than tuned. I could not explain its behaviour from
first principles even after finding it, and code whose correctness rests on that is not code to
keep.

**The second half of the same symptom:** `pointerdown` on Save or Follow bubbled to the card and
started the progress bar, which then ran its full eight-second cap with no navigation to stop it.
`warm` now ignores presses that landed on one of the card's own controls.

### Why the suite missed it, which matters more

Journey 3 and the follow suite both clicked `.vid-open` — **the title**. They passed on seven
profiles while the poster, which is the target anyone actually aims at, was dead. A test that
presses the one part of a control nobody uses is not a test of that control.

They press the poster now, and `scripts/e2e/card-press.mjs` presses every part of a card on five
profiles — **45 checks, all green**:

| | chromium | webkit | iPhone 14 | iPad + mouse | Pixel 7 |
|---|---|---|---|---|---|
| the poster's centre resolves to the card link | ✅ | ✅ | ✅ | ✅ | ✅ |
| one press on the poster | ✅ | ✅ | ✅ | ✅ | ✅ |
| one press on the title | ✅ | ✅ | ✅ | ✅ | ✅ |
| one press on the price row | ✅ | ✅ | ✅ | ✅ | ✅ |
| one press on the creator's name → their page | ✅ | ✅ | ✅ | ✅ | ✅ |
| signed out, Save → sign in carrying the page | ✅ | ✅ | ✅ | ✅ | ✅ |
| signed in, Save toggles on one press | ✅ | ✅ | ✅ | ✅ | ✅ |
| …without opening the video | ✅ | ✅ | ✅ | ✅ | ✅ |
| no progress bar left running after Save | ✅ | ✅ | ✅ | ✅ | ✅ |

**It presses coordinates, not elements.** `locator.click()` refuses when a different element would
receive the event — which is exactly what a correct overlay causes — so element-based clicking
reported the fixed site as broken on all seven profiles. A finger has no such scruples.

Three of the harness's own faults are recorded in its header, because each one reported the site
as broken when it was not: the price row sitting past the bottom edge of the window, a signed-out
Save press correctly navigating to sign in, and Playwright's actionability refusal above.

### Unit guards

Two, and each was checked by reverting the fix and watching it fail with the reason named:

- every decorative layer over the poster must be `pointer-events:none`, and the pressable controls
  must not be;
- the opener must cover the card, the card must be its containing block, and every control must
  have a **numerically higher** z-index than the opener.

---


## PROMPT-11 — the WhatsApp card on a Mac

### Step 1 — what the evidence actually said

**Telemetry, `crawler_hits`.** 17 hits in 72 h; all time, by client and asset:

```
whatsapp-android   html 14   image  1     last 2026-09-01
whatsapp-web       html 24   image  1     last 2026-08-27   ← UA: WhatsApp/2.24.15.78 N
whatsapp-unknown   html  7   image  4     last 2026-09-02   ← UA: WhatsApp/2.2632.100 W
facebook           html  4   image  8
whatsapp-ios       html  2
```

The macOS client **does** reach us and **does** get 200s: `WhatsApp/2.24.15.78 N`, 24 HTML hits,
every recorded status 200. So the Mac was never being refused the document.

Two things the table cannot settle, and both are said rather than glossed: `status` is written
`null` on most rows, and an image served from the CDN never runs our function, so a low image
count is not evidence of a failed image fetch.

**Reproduction against production, before any change.** Everything on the GET path was correct:

| check | result |
|---|---|
| WhatsApp Web shape (`Origin: web.whatsapp.com`, `Sec-Fetch-Mode: cors`) | 200 · `X-Doc: crawler` · ACAO `*` · 7 og:image tags · 2,195 B |
| `WhatsApp/2.2632.100 W`, `…/2.2412.54 W`, `…/2.24.17.78 N`, `…A`, `…I` | all 200 · `X-Doc: crawler` · ACAO |
| the poster image, fetched cross-origin | 200 · ACAO `*` · `image/jpeg` · 1200×630 · 38,080 B |
| redirects, document and image | **0 and 0** |
| `/s/:slug` alias | 200 · crawler |
| the document itself | well-formed, og tags first, no JavaScript |
| cache direction A and B on fresh URLs | crawler and shell stay separate, `HIT` on the second of each |

**The one thing that was wrong.** A browser-side preview asks permission before it fetches, and
that answer was incomplete:

```
OPTIONS /watch/live-at-arusha-full-set
  HTTP/1.1 200 OK
  Access-Control-Allow-Origin: *          ← and nothing else
```

No `Access-Control-Allow-Methods`. The CORS specification requires the preflight to name the
method; without it the browser rejects the preflight and **never sends the GET** — so the `ACAO`
that was correctly present on the GET was never reached. Identical gap on the poster image.

That is the shape of the report exactly: WhatsApp on Android and on Windows are native clients
that perform no CORS at all and were always fine; a Mac fetches the preview through a web stack
that does.

**Said plainly, because it matters:** this is consistent with the report and it is the only
defect found, but it was not reproduced *as a bare card on a Mac* — that needs the client's own
client. Every non-browser fetch shape tested here already worked before the change.

### Step 2 — what changed

| file | what |
|---|---|
| `client/api/_lib/ogDocument.js` | `setPublicCors()` and `handlePreflight()` — one implementation for both handlers |
| `client/api/watch.js:274,278` | preflight answered before any work; CORS on **every** path, including the fallback document, which had none |
| `client/api/og.js:79,80` | same, closing the 404 and 502 paths, which also had none |
| `client/api/_tests/watch.variants.test.js` | two tests: the preflight is complete, and both documents are readable cross-origin |

A preflight answers **204 with no body and no share-meta lookup** — it renders nothing, so doing
the document's work for it would spend a round trip to the API for no reason.

**Deliberately not changed.** A user-agent carrying both `WhatsApp/` and browser tokens still
receives the SPA shell. That guard exists so somebody who *taps* a link inside WhatsApp's in-app
browser gets the working application rather than a dead-end OG stub — a fault this project has
had before. The shell carries the same per-video og tags, checked on six cold uncached URLs, so a
scraper landing there still gets a card. Making every WhatsApp-ish UA take the crawler branch
would have traded this bug for a worse one.

### Step 3 — after, against production

```
OPTIONS /watch/live-at-arusha-full-set          OPTIONS /og/card/…jpg?v=c5ce44811b
  HTTP/1.1 204 No Content                         HTTP/1.1 204 No Content
  Access-Control-Allow-Origin: *                  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, HEAD, OPTIONS  Access-Control-Allow-Methods: GET, HEAD, OPTIONS
  Access-Control-Allow-Headers: content-type      Access-Control-Allow-Headers: content-type
  Access-Control-Expose-Headers: *                Access-Control-Expose-Headers: *
  Access-Control-Max-Age: 86400                   Access-Control-Max-Age: 86400
```

`scripts/verify-share-cors.sh` — every published video, eight checks each:

```
  6 videos · 60 passed · 0 failed
    crawler document · per-video og:title · absolute https og:image · image/jpeg
    · image 38,080–47,954 B (< 300 KB) · no redirect on document or image
    · both readable cross-origin · preflight answers Allow-Methods: GET
```

Cache direction re-run after the change — unchanged, neither document poisons the other:

```
A  human → shell MISS · whatsapp → crawler MISS · whatsapp → crawler HIT
B  whatsapp → crawler MISS · human → shell MISS · human → shell HIT
```

Facebook: `graph.facebook.com/?id=…&scrape=true` now answers *"Must have a valid access token"* —
Meta requires one for that endpoint, which is their change and not ours. Substituted the check
that needs no token, their crawler's own user-agent: both videos get `X-Doc: crawler`,
`X-Crawler: facebook`, the right per-video title and card.

Suites: client **156 pass / 0 fail**. Removing `Access-Control-Allow-Methods` again makes the new
test fail with *"without Allow-Methods the browser rejects the preflight and never sends the
GET"*, which is how it was checked.

---


## PROMPT-12 — the WhatsApp button on a MacBook

### Step 1 — diagnosis, before any change

**(b) is the cause, and it was reproduced.** The desktop branch never asked for the WhatsApp
application. Observed on production, on both engines:

```
element     : button (no href)
window.open : [{"u":"https://web.whatsapp.com/send?text=…","t":"_blank","f":"noopener,noreferrer"}]
new tab     : https://web.whatsapp.com/send?text=…
```

A browser tab opens on **WhatsApp Web**. To anyone not already signed in there that is a QR code
page — nothing that looks like WhatsApp opened, because nothing ever asked for the app. That is
the client's sentence exactly.

**(a) is real but is not the proven cause, and the difference is stated rather than blurred.**
The control *was* a `<button>` whose handler called `window.open(href, '_blank',
'noopener,noreferrer')` — `ShareSheet.jsx:173-197`, rendered at `:468`. That is the shape a popup
blocker exists to stop, and Safari blocks pop-ups by default.

But the order of operations acquits the async half of the theory:

```
onWhatsApp()
  1  setWaBusy(true)                     state only
  2  healShareCard(slug)                 fire-and-forget, no await
  3  warm()  → warmShare(...)            fire-and-forget, no await
  4  whatsappHref(shareUrl)              synchronous
  5  window.open(...)                    SAME TASK as the gesture
```

There is **no `await` anywhere in that handler**, so the open was already inside the gesture's own
task. And headless WebKit did open the tab — `window.open` returned `null`, which is what the
specification requires when `noopener` is passed, not evidence of a block. So a popup block is
plausible on a real Mac with default Safari settings and was **not reproduced here**. It is fixed
anyway, because an anchor cannot be blocked and costs nothing.

### Step 2 — what changed

| file:lines | what |
|---|---|
| `client/src/lib/whatsappShare.js:39-90` | a laptop gets `whatsapp://send?text=…`; only the iPad keeps the web URL. Adds `whatsappWebHref()` and `whatsappNeedsVisibleFallback()` |
| `client/src/components/watch/ShareSheet.jsx:173-215` | the handler no longer navigates; it warms and arms the fallback, after |
| `client/src/components/watch/ShareSheet.jsx:506-535` | a real `<a href target rel>` computed at render, plus the fallback link |
| `client/src/styles/global.css:2485-2501` | anchor styling; `.share-wa-web`; the dead `:disabled` rule removed |

```
desktop   whatsapp://send?text=…      _self    + a visible fallback after 1.5 s
phone     whatsapp://send?text=…      _self    unchanged — automatic redirect as before
iPad      https://web.whatsapp.com/…  _blank   unchanged
```

A `whatsapp://` link fails **silently** when no app is installed, so a laptop that still has focus
after 1.5 s is offered *"WhatsApp app not found — Open WhatsApp Web"*. The phone keeps its
automatic redirect; a laptop is offered the choice, because sending a desktop viewer to a QR page
unasked is the experience this change exists to remove. Copy link stays beside both.

`waBusy` went with it — it was set true and false inside one handler and never rendered.

### Step 3 — verification

**Unit** (`shareRules.test.js`), href and target per profile, plus a guard on the control's shape:

```
✔ a phone and a laptop both open the APP; only the iPad takes the web URL
✔ the WhatsApp control navigates by href, not by window.open
    · href computed at render   · no window.open in the block
    · no await in the handler   · it is an anchor
  157 pass · 0 fail
```

Putting the old `<button onClick={() => window.open(...)}>` back fails it with *"the href is
computed at render"*, which is how it was checked.

**Browser** (`scripts/e2e/whatsapp-desktop.mjs`), four profiles against production:

| | element | href | target | popup | fallback |
|---|---|---|---|---|---|
| webkit desktop (the MacBook) | `<a>` | `whatsapp://send?text=…` | `_self` | none | appears < 4 s → `web.whatsapp.com` |
| chromium desktop (Windows) | `<a>` | `whatsapp://send?text=…` | `_self` | none | appears < 4 s |
| iPhone 14 · webkit | `<a>` | `whatsapp://send?text=…` | `_self` | none | redirects itself to `web.whatsapp.com/mobile/` — unchanged |
| iPad Pro 11 · webkit | `<a>` | `https://web.whatsapp.com/send?text=…` | `_blank` | its tab | none, correctly |

**ALL PASS.** On every profile the press reaches the link itself, the click opens no window of its
own, and the watch page is not navigated away (except the phone, which leaves on purpose).

**No regression on the phone path:** matrix journeys 9 and 10, all seven profiles — **14 pass, 0
fail**.

### Two harness faults, both of which reported the product as broken

Recorded because between them they cost more time than the bug.

**`locator.click()` times out on WebKit for this control.** The anchor is visible, enabled, in the
viewport and hit-testable — `elementFromPoint` at its centre returns a child of the anchor — but
Playwright's stability wait never settles on it there. `force: true` dispatches in 114 ms and the
handler runs, the fallback appears, nothing is navigated. So the suite asserts hit-testability
**explicitly** and then forces the dispatch, rather than losing the check that matters.

**Journey 10 was intermittent on the iPhone**, one run in two, and it was the same shape: it
pressed Escape, waited 800 ms and clicked the creator link underneath while the sheet was still
closing. It now closes the sheet with its own close button and waits for it to detach. Three
consecutive runs pass.

**Two more, found by running the suite repeatedly rather than once.** Opening the share sheet
slept six seconds and then clicked, so a slow watch page failed the whole run on a locator
timeout — it waits for the control and reloads once now. And the phone assertion raced a 1.5 s
timer: `whatsappFallback` redirects to WhatsApp Web *unless the page lost visibility*, because
losing visibility means something took the scheme, and whether a headless engine reports that for
an unhandled `whatsapp://` is not deterministic. Both outcomes are the logic working, so the
check accepts either and requires only what is genuinely invariant — no popup, no broken page.
The deterministic half, that a phone arms the redirect at all, is asserted in `shareRules.test.js`
where it races nothing. **Three consecutive full runs, all four profiles: ALL PASS.**

---

*Further items are appended as they are verified.*
