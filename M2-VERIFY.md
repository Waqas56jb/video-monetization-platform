# Verification log

Evidence for each item. Command output, test output or measurement — no entry without one.
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

## C1 — scroll jank, WebKit

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

*Further items are appended as they are verified.*
