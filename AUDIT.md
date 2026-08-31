# MTONYO+ Audit — 2026-08-31 — commit `4419c9c` (`main`, clean tree)

Live measurements in this report were taken 2026-08-31 ~08:15 UTC against the three
production Vercel deployments. Every network figure quoted is from an actual request,
not an estimate. Code-only conclusions are labelled.

---

## 0. Summary

**Top 5 root causes, ranked by client impact**

1. **A shared `/watch/:slug` link serves a dead-end HTML stub to real people.** The OG
   function returns two different documents for the same URL but declares only
   `Vary: User-Agent`. If a link-preview unfurl warms the Vercel edge first, every human
   who taps that link for the next 300 s gets a 2,198-byte page with no `<div id="root">`
   and no JavaScript. **Reproduced live, twice.** (`client/api/watch.js:220,275`)
2. **The WhatsApp poster's fast path is dead in production.** `serviceRole: false` at
   `/health` → share cards are never uploaded to Supabase Storage, so `/og/card/*.jpg`
   burns a guaranteed-failing 1.43 s request on every cache miss before falling back.
   Measured: 2.50 s TTFB. (`shareCardStorage.js:52`, `client/api/og.js:44`)
3. **The iPad WhatsApp fix was written but never wired in.** `ShareSheet.jsx:31` imports
   `whatsappHref` from `socialShare.js`, which returns `api.whatsapp.com` — the exact URL
   the client reported failing. The correct implementation sits unused in
   `client/src/lib/whatsappShare.js`, and a test *asserts the broken URL*.
4. **The first frame waits on the slowest request, and that request is slowed by the
   share-card system.** `GET /api/videos/:slug` runs ~7 serial DB round trips including
   three DDL statements, and `sharp` loads on every cold start of every API function.
   Measured warm: 1.04 s; the client's 20–30 s ceiling is `Watch.jsx:139`'s 20 s timeout.
5. **`POST /api/share/crawl-hit` returns 500 on every call** — `recordCrawlerHit` is used
   at `share.routes.js:335` and never imported. All HTML-side crawler telemetry is lost,
   so the `crawler_hits` table gives a misleading half-picture of preview failures.

**Claimed DONE, not actually working**

- iPad WhatsApp handoff (#13) — fix exists, is not imported, test locks in the bug.
- Share-card CDN upload — code correct, disabled in production by a missing env var.
- Crawler telemetry (`crawler_hits` HTML rows) — endpoint 500s.
- Continue Watching / My List / Recently Watched (#24) — **not built at all**.
- Creator name → profile from every video card (#24) — Watch page only; cards are plain text.
- "Generous 70/30 revenue split" homepage copy — hard-coded while the split is configurable.
- `keep-warm` endpoint exists but is not scheduled; a test asserts it stays unscheduled.
- Migrations are **never run on deploy** (`buildCommand: null`) — 025/026/029 may not be applied.

---

## 1. Architecture as built

| Piece | What is actually there |
|---|---|
| `/client` | React 18 + Vite 5 + React Router 6. Landing/Explore/Login/Signup/Dashboard/CreatorProfile/Legal are in the main bundle; **only** `Watch` is `React.lazy`. Ships a service worker. Also ships **two Vercel serverless functions of its own**: `api/watch.js` and `api/og.js`. |
| `/admin` | Same stack, no lazy routes, no service worker, no build id, `X-Robots-Tag: noindex`. |
| `/server` | Express 4 ESM on Vercel, `regions: ["dub1"]` (Dublin), `maxDuration: 30`, `memory: 1024`. `api/index.js` exports the app; no `listen()`. |
| DB | Supabase Postgres via the transaction pooler, `pg.Pool` cached on `globalThis`, `max: 3`. 30 migrations, applied **manually**. |
| Video | Cloudflare Stream. Full film + a separately-clipped preview asset + a 60 s public social clip. Playback tokens are RS256, signed **locally** (no Cloudflare API call on the play path). |
| Auth | Supabase Auth. Tokens in **localStorage + in-memory** (`api.js:47`), never cookies — so the `*.vercel.app` Public Suffix List cookie problem does not apply here. JWTs verified locally against JWKS. |
| Share cards | Sharp + opentype.js compose a 1200×630 JPEG at publish time, cached as `bytea` in `share_card_cache`, and *intended* to be mirrored to a public Supabase Storage bucket. |
| Payments | Sandbox provider only. Settlement is one transaction: payment → purchase → earnings ledger. |
| Cron | Two jobs only: premiere expiry (`0 2 * * *`) and share-card rebuild (`15 3 * * *`). |

Routers loaded **eagerly** on every cold start: `stats`, `auth`, `videos`, `playback`,
`shareCard`, `public`, `ads` (`server/src/routes/index.js:2-8`). Everything else is
`lazyRouter`.

---

## 2. Play → first frame trace

The page mounts the player only when `p?.playback?.iframe` exists, and `p` requires
`playbackRouteMatches(playbackRow, v)` — which needs `v.id`. **So the first frame is
gated on BOTH `/api/videos/:slug` and `/api/playback/:slug/playback`**, not just playback.
(`Watch.jsx:155`, `Watch.jsx:775`)

### Before the tap (speculative)
| # | Work | Notes |
|---|---|---|
| 0a | `<script src=embed.cloudflarestream.com/embed/sdk.latest.js async>` | `client/index.html:73`, plus preconnects to 5 origins |
| 0b | Card scrolls into view → `prefetchWatchLight` → `warmPlayback` | `VideoCard.jsx:56-67`; 10-min TTL (`prefetchWatch.js:94`) |
| 0c | `onPointerDown` **and** `onTouchStart` → `prefetchWatch` (3 requests) + `start()` | `VideoCard.jsx:117-118` — both fire on iOS |

### After the tap — three requests in parallel, each its own serverless invocation
| # | Request | Serial work inside it | Measured (warm) |
|---|---|---|---|
| 1 | `GET /api/videos/:slug` | `optionalAuth` → JWKS fetch if cold → profile query · video `SELECT_PUBLIC` · `expireIfDue` · **`resolveAccess` re-queries `purchases` because `purchase` is undefined** (`videos.routes.js:731`) · `sharePayloadFromRow` → `readCardStatus` → **`ensureShareCardTable()` = `create table if not exists` + `alter table … enable RLS` + `revoke all`** (`shareCardCache.js:11-23`) · card-status select. **≈7 serial round trips.** | **1.04 s** |
| 2 | `GET /api/playback/:slug/playback` | `optionalAuth` · one joined query (video+purchase+progress) · `getSettings` · local RS256 sign · fire-and-forget `ensureClips` which issues **a Cloudflare `getVideo` API call** (`playback.routes.js:265,276` → `ensureClips` → `cloudflare.js:494`) | **0.70 s** |
| 3 | `GET /api/ads/breaks/:slug` | `optionalAuth` · `videoForAds` using **`id::text = $1`** — a sequential scan (`ads.routes.js:26`) · eligibility purchase query · up to 3 `pickCampaign` queries | **0.55 s** |
| 3b | `POST /api/share/crawl-hit` (only on a direct `/watch/` open) | **500s every time** (§10 C-extra) | — |

### Then
| # | Step |
|---|---|
| 4 | `iframeSrc` built with `autoplay=true&muted=true&preload=auto` (`StreamPlayer.jsx:24-42`) |
| 5 | `<iframe>` mounted transparent; `setPainted(true)` on `onLoad` or a 1500 ms failsafe (`StreamPlayer.jsx:293`) |
| 6 | `ensureStreamSdk()` resolves (or gives up after 10 s → the iframe still plays) |
| 7 | Cloudflare fetches manifest + first segment; `canplay`/`loadeddata` → parent-side muted `play()`; watchdog retries every 900 ms, 8 attempts |

**Where the 20–30 s comes from.** Nothing in the code produces a fixed 20–30 s wait. The
ceiling is `Watch.jsx:139` — `playback` uses `timeoutMs: 20_000` (everything else uses the
10 s default at `useApi.js:3`). Until that resolves, `waitingForPlayback` shows the poster
with no message; on failure the page shows *"This video could not start"* — verbatim the
earlier build the client described. So the reported 20–30 s is **cold start + slow network
+ the 20 s timeout**, not a hard-coded delay.

**What is actually expensive, and fixable:**
- **`sharp` loads on every cold start of every API function.** `routes/index.js:5` →
  `shareCard.routes.js:3` → `shareCardServe.js:3` → `shareCardFallback.js:4`
  `import sharp from 'sharp'`. This directly contradicts `lazyRouter.js:1-7`, which exists
  to prevent exactly this. Three parallel requests to a cold function spin up three
  isolates, each paying it.
- **`ensureShareCardTable()` runs three DDL statements** in front of the video request on
  every cold isolate.
- **No keep-warm.** `/api/jobs/keep-warm` exists (`routes/index.js:112`) but is not in
  `vercel.json`'s crons, and `coldStart.test.js:12` *asserts* the 5-minute schedule is
  absent (Hobby plan allows one run/day).
- **Region.** `X-Vercel-Id: sin1::dub1::` — edge in Singapore, execution in Dublin. `/health`
  (a bare `select 1`) measured **2.08 s** TTFB.
- **`id::text = $1` sequential scans** survive in `ads.routes.js:26`, `share.routes.js:27`
  and `buildShareCard.js:21`, despite migration 027 and the comment at `videos.routes.js:711`.

Precomputable at publish time: card status (a boolean on `videos`), ad-break selection,
`ensureClips` staleness. None need to be on the play path.

---

## 3. Entitlement trace

**Decided server-side, once, in `resolveAccess` (`server/src/services/entitlement.js:14-72`).**

```
canWatchFull = free || owned || isOwner || isStaff
owned        = exists(purchases where user_id=$1 and video_id=$2 and status='active')
```

`loadWatchContext` (`playback.routes.js:41-72`) joins `purchases` on
`p.video_id = v.id AND p.user_id = $3 AND p.status='active'` and passes the row in, so the
lookup is per-user **and** per-video. The full film's token is only minted inside
`if (access.canWatchFull)` (`playback.routes.js:229-247`). **A locked viewer never receives
the full asset's URL.** Verified live: `/api/playback/live-at-arusha-full-set/playback`
anonymously returns `kind: "preview"`, `canWatchFull: false`.

**Can a purchase of A grant B? Not any more, and there are four independent guards:**

1. `App.jsx:65` — `<Watch key={videoId || location.pathname} />` forces a fresh instance.
2. `Watch.jsx:108,170` — `justPaidFor` holds an **id**, not a boolean; `justPaid` compares it
   against `videoId`/`v.id`/`v.slug`. The comment at `Watch.jsx:101-107` records that a
   boolean `justPaid` was the original bug.
3. `watchUrl.js:45` — `playbackRouteMatches` rejects a payload whose `videoId` differs.
4. `prefetchWatch.js:96-107` — warm cache keyed by slug/id with a 10-minute TTL.

`shareRules.test.js:36-43` locks guard 3 down.

**Role shortcuts that do leak, by design:** `isStaff` (`entitlement.js:41`) grants
`canWatchFull` on **everything** to any `admin` or `sub_admin`, in the viewer app, with no
purchase. `isOwner` does the same for the creator's own videos. This is intended (review
requires watching), and the Watch page labels it — `accessReason` renders
*"Open to you as staff — not a purchase"* (`Watch.jsx:671`). **But if the client tested
"buy A, then open B" while signed in as an admin or as the creator, every video would open
and it would look exactly like the reported bug.** This is the single most likely
explanation for issue #8 still being reported after the fix.

No client-side caching of `access: true` across routes was found.

---

## 4. Resume-after-payment trace

Where the number lives, in priority order:

| Source | Where |
|---|---|
| Player's live second | `StreamPlayer.jsx:346` writes `positionRef.current` **before** the halt branch, because a halted preview stops reporting |
| Session storage | `watchProgress.js:22` — `sessionStorage`, written from the first second, covers a signed-out viewer |
| Server | `watch_progress` table, `PUT /api/playback/:id/progress` (`playback.routes.js:334`) |

`capturePosition()` (`Watch.jsx:334`) takes `max(live, watchedTo, recallProgress)` at the
paywall **and** again the instant checkout opens. `resumePoint()`
(`client/src/lib/resumePoint.js`) picks the furthest honest value and falls back to the
preview's end only when `previewEnded` proves the viewer reached it. That rule has its own
test file.

Unlock sequence (`Watch.jsx:491-538`): compute `from` → `dropWarmedWatch` ×3 (so the
prefetched *preview* payload cannot be reused) → `setJustPaidFor(v.id)` →
`setResumeHint(from)` → `await api.saveProgress` → `playback.reload({quiet:true})`.

**Does the player unmount on unlock? Yes — deliberately.** `key={`${v.id}-${p.playback.kind}`}`
(`Watch.jsx:778`) changes `preview` → `full`, so a genuinely new player is built with a new
signed token. Two mechanisms then land it at the right second:

- `startTime=Ns` in the iframe URL, **pinned for the life of that source** (`StreamPlayer.jsx:210-218`).
  The pin is the important part: `startAt` used to be re-derived every render from a
  position that playback itself advances, which re-navigated the live iframe mid-film.
- A `seekRequest` nonce (`Watch.jsx:563-568`), applied through the SDK, only when the player
  is more than 2 s away, retried up to 5 times.

Auto-continue with no second tap: `autoplay` + `playOnReady` + muted `play()` from the
parent (`StreamPlayer.jsx:510-527`), with a `continue-veil` that self-clears after 3.5 s
(`Watch.jsx:544-548`) so a refused autoplay never leaves two "Watch now" screens.

**Assessment: correct as written.** Residual risk is Safari refusing even muted `play()`
after the payment sheet closes, in which case the viewer sees Cloudflare's own play button
at the right second — acceptable, but it is a second tap.

---

## 5. Share / OG trace

### Share button click (`ShareSheet.jsx`)
| Action | Requests |
|---|---|
| Sheet opens | idle: `warmShare` (no-cors GET ×2 + `<img>` for the card) ; `api.share.payload(slug)`, **retried every 4 s until a clip exists** (`ShareSheet.jsx:132-156`) |
| WhatsApp tap | `healShareCard` if not ready, `warm()`, then `window.location.href = whatsappHref(shareUrl)` |
| Instagram/TikTok | `copyWatchUrl` → `saveClip` (downloads the 60 s MP4 through `/api/share/:id/clip.mp4`) → `instagram://app` / `tiktok://` |
| Facebook | `facebook.com/sharer/sharer.php?u=` |
| More apps | `navigator.share({title, url})` |

### `/watch/:slug` — `client/api/watch.js`
Rewritten by `client/vercel.json` to `/api/watch?slug=:slug`. `/s/:slug` → the same with
`share=1`. Crawler detection is two-stage:
- `isLinkPreviewBot(ua)` — matches WhatsApp/facebookexternalhit/Twitterbot/LinkedInBot/
  Slackbot/TelegramBot/Discordbot/Pinterest/Googlebot/bingbot/Applebot, **but returns false
  if the UA also contains `Mozilla/` plus a browser token** (`ogDocument.js:17-23`).
- `isUnfurlFetch(req)` — catches WhatsApp Web / Desktop, which fetch with the *user's own*
  browser UA: `Sec-Fetch-Mode: cors` or `Sec-Fetch-Dest: empty` → treated as an unfurl
  (`ogDocument.js:25-33`).

Live verification (all 2026-08-31):

| Caller | Result |
|---|---|
| `WhatsApp/2.23.20.0 A` | ✅ `X-Crawler: whatsapp-android`, 2,195-byte crawler doc, full per-video OG, `og:image` = `/og/card/<slug>.jpg?v=<sourceKey>`, 1.44 s |
| Chrome UA + `Sec-Fetch-Mode: cors` + `Origin: web.whatsapp.com` | ✅ crawler doc, `Access-Control-Allow-Origin: *`, 0.73 s |
| iPhone Safari, `Sec-Fetch-Mode: navigate` | ✅ SPA shell with per-video OG injected, 0.69 s |
| `/s/<slug>` in Safari | ✅ SPA shell |

**OG tags for a plain `GET /watch/<slug>` with no special UA: present.** But the title is
only per-video if `memoedShareMeta` has a warm per-instance memo; on a cold instance
`titleFromSlug()` produces `"Behind The Fame A Coast Documentary — MTONYO+ | MTONYO+"`
(slug-derived, creator missing, "MTONYO+" duplicated). Confirmed live.

### The cache-variant collision — **the most damaging bug found**

`watch.js` returns two different bodies for the same URL, and declares only
`Vary: User-Agent, Accept-Encoding` (`watch.js:220` and `watch.js:275`). It does **not**
vary on `Sec-Fetch-Mode`/`Sec-Fetch-Dest` — the very headers it branches on. With
`s-maxage=300`, the Vercel edge stores whichever variant arrives first.

Reproduced live, both directions:

```
# Direction A — browser first, then WhatsApp Web unfurl
/watch/behind-the-fame-a-coast-documentary
  1. Chrome UA, navigate  → 4698 bytes, MISS   (SPA shell)
  2. Chrome UA, cors      → 4698 bytes, HIT    ← unfurl gets the React shell
  3. Chrome UA, cors      → 4698 bytes, HIT

# Direction B — unfurl first, then a human taps the link
/watch/how-to-cook-pilau-properly
  1. Safari UA, cors      → 2198 bytes, MISS   (crawler doc)
  2. Safari UA, navigate  → 2198 bytes, HIT    ← HUMAN GETS THE CRAWLER STUB
```

Direction B is the failure the client keeps hitting: **no `<div id="root">`, no script tag,
no app** — a bare `<h1>` and a text link, for up to 300 s, to everyone who taps a
freshly-shared link. It is intermittent by construction, which is exactly why it reproduces
for the client and not for the developer.

### Card image path
`og:image` → `/og/card/:slug.jpg` → `client/api/og.js`:
1. Supabase public bucket, 2 s timeout — **measured HTTP 400 in 1.43 s, every time**
2. `${API}/api/share-card/:slug.jpg`, 8 s timeout — **measured 0.57 s, HTTP 200, 38 KB, `X-Share-Card: built`**

Measured end-to-end: **2.50 s TTFB / 2.84 s total on a MISS**; 0.39 s on an edge HIT
(`Age: 19`, `X-Vercel-Cache: HIT`, `Cache-Control: public, max-age=86400`).

Leg 1 can never succeed: `uploadShareCardToStorage` short-circuits on
`if (!capabilities.serviceRole …) return false` (`shareCardStorage.js:52`), and production
reports `"serviceRole": false` at `/health`. So `SUPABASE_SERVICE_ROLE_KEY` is unset and the
bucket has never been written. Every cold card fetch pays 1.43 s for nothing.

Card contents match the requirement exactly: poster frame + title + creator + `MTONYO+` +
`WATCH FREE PREVIEW` + a play cue, burned into the JPEG (`shareCard.js:13-14,105-148`) —
correctly, since WhatsApp often drops OG text.

### WhatsApp URL — three implementations, the wrong one is used
| File | URL | Used? |
|---|---|---|
| `socialShare.js:61-63` | `https://api.whatsapp.com/send?text=` | ✅ **imported by `ShareSheet.jsx:31`, called at `:167`** |
| `whatsappShare.js:38-42` | `whatsapp://send?text=` on phone, `web.whatsapp.com/send?text=` elsewhere; header comment explicitly says *"api.whatsapp.com is deliberately not used … it is what produced 'Something went wrong. The application couldn't be opened.' on iPad"* | ❌ **nothing imports it** |
| `share.routes.js:140` | `https://wa.me/?text=` | server payload, unused by the sheet |

On iPad, `isTouchMobile()` is true, so `ShareSheet.jsx:169` does
`window.location.href = 'https://api.whatsapp.com/send?text=…'` — navigating the page to the
exact URL the client reported. `shareRules.test.js:61-67` asserts
`href.startsWith('https://api.whatsapp.com/send?text=')`, so the test suite defends the bug.

---

## 6. Login trace

- **Storage:** `localStorage` **and** an in-memory mirror (`api.js:47-51`). The memory
  mirror is the fix for Safari Private Browsing / "Block All Cookies", where a
  `localStorage` write silently fails. `safeStorage.js` wraps even the *property access*,
  which is required on iOS.
- **Origins:** `client` (or `admin`) → `server`. Bearer header only. **No cookies are used
  for auth**, so the `*.vercel.app` Public Suffix List problem and ITP third-party cookie
  blocking do not apply to sign-in.
- **The first-attempt race:** two guards, both present.
  - `api.js:175` — `tokenStillCurrent`: a 401 only clears the session if the token that
    failed is still the current one. A late 401 from a stale `/me` no longer wipes fresh
    tokens.
  - `AuthContext.jsx:82` — `reload()` only clears the user on a 401 *and* an already-absent
    token.
- **Autofill:** `Login.jsx:95-99` reads from `FormData` and falls back to a direct DOM query
  before React state — the documented cause of "first tap submits empty credentials".
- **Redirect:** `onSubmit` navigates on success; a parallel effect (`Login.jsx:69-75`)
  navigates when `authed` flips. Both target the same place, so the duplicate is benign.

**Assessment: the known causes of #17 are all fixed.** Residual, unverified: Supabase Auth
rate-limiting a burst of attempts returns a 429 that `supabase.js:151` correctly converts
to *"your password is fine"* — worth checking the client is not seeing that.

---

## 7. Ads player trace

State machine (`AdBreak.jsx` + `adSkip.js` + `StreamPlayer.jsx`):

| Concern | Behaviour | Verdict |
|---|---|---|
| Skip clock start | `elapsed` is set only from `onTimeUpdate` → `noteAirtime`, and `StreamPlayer` is mounted with `requireAirtime`, so `noteIfAiring` ignores anything below `AD_AIRTIME_FLOOR = 0.25 s` of **media time** (`StreamPlayer.jsx:392-396`) | ✅ cannot start on a black buffer |
| Skip button visible | `{skippable && playing && …}` — hidden until airtime is proven (`AdBreak.jsx:99`) | ✅ |
| Content paused | `paused={Boolean(activeAd)}` on the main player; the effect at `StreamPlayer.jsx:597-608` calls `pause()`, and the resume path awaits `play()` and retries muted | ✅ |
| Ad-load failure | `AdBreak.jsx:69-76` — 4 s timer, `finish(false)` if `!playing`. No fake countdown runs, because the countdown needs `playing` | ✅ |
| Impression on failure | `finish(false)` **does** post an impression with `secondsWatched: 0, completed: false` | ⚠️ recorded, but `billable = completed && campaign && midrollValid` (`ads.js:212`) so **no money moves**. Correct. |
| Replay on scrub-back | `playedBreaks` Set (`Watch.jsx:416-424`) | ✅ |
| Double billing | `playId` UUID per sitting + `on conflict (campaign_id, video_id, placement, play_id) do nothing` (`ads.js:226-228`) | ✅ |
| Client-forged impressions | `campaignServable()` re-runs the full selection predicate server-side before crediting (`ads.js:101-119`) | ✅ |
| Buyers stay ad-free | `showsAds = free && ads_enabled && !owned && !isOwner` (`entitlement.js:69`) + `adEligibility` re-checks `purchases` | ✅ |

**This subsystem is the strongest part of the codebase.** No defects found.

---

## 8. Supabase security

`capabilities` from live `/health`: `{database: true, auth: true, email: true,
serviceRole: false, cloudflareStream: true, signedPlayback: true}`.

**Client bundle scan — clean.** `grep -oE "(service_role|SUPABASE|supabase\.co|eyJ…)"` over
`client/dist/assets/*.js`, `client/dist/index.html`, `admin/dist/assets/*.js`,
`admin/dist/index.html` → **zero matches**. The only `import.meta.env` reads in either app
are `DEV`, `PROD`, `VITE_API_URL`. No Supabase key of any kind reaches a browser bundle.
`.env` files are correctly gitignored and untracked in all three apps.

Table inventory from the migrations. "anon read/write" = reachable through PostgREST with
the publishable key, after migration 025's `REVOKE ALL … FROM anon, authenticated, public`.

| Table | RLS | Policies | anon read | anon write |
|---|---|---|---|---|
| `profiles` | ✅ 002 | self read; self update (role locked) | ❌ | ❌ |
| `creator_profiles` | ✅ 002 | none | ❌ | ❌ |
| `videos` | ✅ 002 | `videos_public_read` (published+approved+not deleted, or own, or admin); creator insert/update; admin all | ❌ (grant revoked; policy would allow) | ❌ |
| `video_deletion_requests` | ✅ 002 | own/admin read; own insert | ❌ | ❌ |
| `payments` | ✅ 002 | own/admin select | ❌ | ❌ |
| `purchases` | ✅ 002 | own/admin/creator-of-video select | ❌ | ❌ |
| `earnings` | ✅ 002 | own/admin select | ❌ | ❌ |
| `withdrawals` | ✅ 002 | own/admin select; own pending insert | ❌ | ❌ |
| `ad_campaigns` | ✅ 002 | none | ❌ | ❌ |
| `ad_impressions` | ✅ 002 | none | ❌ | ❌ |
| `video_views` | ✅ 002 | none | ❌ | ❌ |
| `platform_settings` | ✅ 002 | `select using (true)`; admin update | ❌ (grant revoked; **policy alone would allow anyone**) | ❌ |
| `audit_log` | ✅ 002 | admin select | ❌ | ❌ |
| `password_resets` | ✅ 004 | none | ❌ | ❌ |
| `announcements` | ✅ 004 | addressed read | ❌ | ❌ |
| `notifications` | ✅ 004 | own read/update | ❌ | ❌ |
| `watch_progress` | ✅ 011 | own read/insert/update/delete | ❌ | ❌ |
| `content_reports` | ✅ 013 | own read; insert | ❌ | ❌ |
| `staff_permissions` | ✅ 014 | own read | ❌ | ❌ |
| `creator_applications` | ✅ 020 | own read; own insert | ❌ | ❌ |
| `crawler_hits` | ✅ 021 | staff read | ❌ | ❌ |
| `share_card_cache` | ✅ 025 | none | ❌ | ❌ |
| `follows` | ✅ 029 | none (+ explicit `revoke`) | ❌ | ❌ |
| `_migrations` | ✅ 011 | none (deliberate) | ❌ | ❌ |

Defence in depth is genuinely layered: 011 and 025 both sweep `pg_class` for
`relrowsecurity = false`; 025 revokes table/sequence/function grants and rewrites default
privileges for `postgres` **and** `supabase_admin`; 026 installs a `ddl_command_end` event
trigger that locks any future `CREATE TABLE` in `public`. `shareCardCache.js:21-22` repeats
the lock for its runtime `create table if not exists`.

**Two caveats, both material:**

1. **Nothing runs these migrations on deploy.** `server/vercel.json` has
   `"buildCommand": null`; `db:migrate` is a manual npm script. Whether 025, 026 and 029 are
   applied to production is **unverified** — and that is precisely the gap the Aug 26
   Advisor warning would sit in. → §13 Q1.
2. `platform_settings`'s `select using (true)` is a policy that would expose the revenue
   split, price floors and maintenance flag to anyone with the anon key if grants were ever
   restored. Harmless today, wrong as a default.

The API connects as the table **owner**, which bypasses RLS unless `FORCE`d. That is stated
and intended (`011_rls_everywhere.sql:29-34`): authorisation for the application lives in
route guards + triggers, RLS is the wall against direct PostgREST access.

---

## 9. Deployment integrity

**Does the live build equal `main` HEAD?**

| App | Evidence | Verdict |
|---|---|---|
| `/server` | `X-Build: 4419c9c` on `/health` == local `git rev-parse HEAD` | ✅ **matches** |
| `/client` | `X-Build: 4419c9c` on `/watch/:slug` (set by `api/watch.js:30`) | ✅ **matches** — but the header exists only on `/watch/*` and `/s/*`; `/` carries none |
| `/admin` | no build id anywhere | ❌ **cannot be determined** |

- **Version header/endpoint:** server yes (`app.js:34-40`, every response). Client partial.
  Admin none. The SPA bundles use `__BUILD_ID__ = Date.now().toString(36)`
  (`client/vite.config.js:9`) — a timestamp, not a commit, and `admin/vite.config.js` has no
  equivalent.
- **Can frontend and server drift to incompatible versions?** **Yes.** They are three
  independent Vercel projects with no shared version gate. `VITE_API_URL` is baked at build
  time. There is one defensive guard: `api.js:16` rewrites the retired
  `…-backend.vercel.app` host to `…-server.vercel.app`, mirrored in
  `client/api/_lib/apiOrigin.js:6`.
- **Env vars:** `/health` reports `publicApp` and `adminApp` correctly and
  `allowedOrigins` = exactly the two live hosts. `client/.env` and `admin/.env` both point at
  `…-server.vercel.app`. **The one missing variable is `SUPABASE_SERVICE_ROLE_KEY`**
  (`serviceRole: false`), which silently disables share-card CDN upload, `createUserAsAdmin`
  and `deleteAuthUser`.
- **Local Vercel link is wrong.** `server/.vercel/project.json` reads
  `"projectName":"video-monetization-platform-backend"` — the *legacy* host the code goes out
  of its way to route away from. Either the project was renamed (in which case this file is
  merely stale) or a `vercel deploy` from `/server` targets a different project than the one
  serving traffic. This is exactly the shape of the Aug 23 failed-deploy confusion. → §13 Q2.
- The Aug 23 04:06/04:12/04:16 failures cannot be diagnosed from the repo — no build logs are
  committed. → §13 Q3.

---

## 10. Issue-by-issue findings

Fields: **Root cause · Evidence · Platform · Confidence · Fix scope · How to verify**

### A. Player / performance

**A1 — "Connecting to player…" for 20–30 s**
- **Root cause.** Three compounding causes. (i) The first frame waits on *both*
  `/api/videos/:slug` and `/api/playback/:slug/playback` (`Watch.jsx:155,775`), and the video
  request runs ~7 serial DB round trips including `ensureShareCardTable()`'s three DDL
  statements (`shareMeta.js:50` → `shareCardCache.js:11-23`). (ii) `sharp` is imported on
  every cold start via `routes/index.js:5` → `shareCard.routes.js:3` → `shareCardServe.js:3`
  → `shareCardFallback.js:4`, defeating `lazyRouter.js`. (iii) No warm-keeping —
  `/api/jobs/keep-warm` is unscheduled and `coldStart.test.js:12` asserts it stays that way.
  The 20 s figure is the ceiling at `Watch.jsx:139`; the old *"This video could not start"*
  is that timeout expiring (`Watch.jsx:765`).
- **Evidence.** Measured warm: `/api/videos/:slug` **1.04 s**, `/api/playback` **0.70 s**,
  `/health` (bare `select 1`) **2.08 s**. `X-Vercel-Id: sin1::dub1::`.
- **Platform.** Not platform-specific, but far worse for the client: edge in Singapore,
  execution in **Dublin**, client on a slower connection in a different time zone. Every
  round trip costs the developer ~40 ms and the client several hundred.
- **Confidence.** High for the mechanism; Medium that it fully accounts for 30 s.
- **Fix scope.** Medium — server only. Lazy-import `getFallbackShareCard`; drop
  `readCardStatus` from `GET /api/videos/:id` (store `card_ready` as a column); pass the
  already-loaded purchase into `resolveAccess`; gate `ensureShareCardTable` behind a
  module-level flag that survives warm isolates.
- **Verify.** On the client's iPhone, Safari → Settings → Advanced → Web Inspector, connect to
  a Mac, open a video, screenshot the Network panel showing `/api/videos/:slug` and
  `/api/playback/…` timings. Send the client a before/after of those two numbers.

**A2 — 4–7 s freezes opening a video or returning Home**
- **Root cause.** Two candidates, ranked. (1) Same as A1 — the freeze *is* the request wait,
  since `Watch` is the only lazy route (`App.jsx:23`) so it also downloads a chunk.
  (2) Historic: `startAt` re-derived per render re-navigated the live iframe. That is fixed
  and pinned (`StreamPlayer.jsx:210-218`), with the reason written down.
- **Evidence.** `App.jsx:23`, `Watch.jsx:132-144`, `StreamPlayer.jsx:191-218`.
- **Platform.** Not platform-specific.
- **Confidence.** Medium. **Fix scope.** Medium, client + server.
- **Verify.** Safari Timelines while navigating Explore → Watch → back.

**A3 — Free preview no longer autoplays**
- **Root cause.** It does autoplay, muted: `autoplay=true&muted=true` in the iframe URL
  (`StreamPlayer.jsx:30-31`), plus parent-side muted `play()` and a 900 ms watchdog
  (`:510-560`). What the client is most likely seeing is **Low Power Mode on iOS**, which
  blocks *all* autoplay including muted, leaving Cloudflare's own play button.
  `StreamPlayer.jsx:522-525` deliberately does not draw a second one over it.
- **Evidence.** `StreamPlayer.jsx:24-42, 496-561`.
- **Platform.** **iOS-specific.** Low Power Mode overrides muted-autoplay permission.
- **Confidence.** Medium — needs the client to confirm the battery state.
- **Fix scope.** Small (client) — detect a refused `play()` and surface one clear
  full-frame tap target rather than relying on Cloudflare's button.
- **Verify.** Ask the client to open the same video with Low Power Mode off. → §13 Q4.

**A4 — UI says 3:37, playback runs to ~5:00**
- **Root cause.** Fixed, and correctly. The stop is enforced **in the player**, not by
  overlaying a paywall: `stopAt={previewSeconds}` (`Watch.jsx:804`) → `haltIfDue` polls every
  200 ms and calls `pause()` + `currentTime = limit` (`StreamPlayer.jsx:339-377`). Independent
  of the underlying clip's real length. `ensureClips` also re-cuts a stale clip
  (`playback.routes.js:492-513`).
- **Evidence.** Live: `stopsAtSeconds: 217` (3:37) for `live-at-arusha-full-set`,
  `durationSeconds: 653` — the client's exact video.
- **Platform.** Not platform-specific. **Confidence.** High. **Fix scope.** None.
- **Verify.** Play that video to 3:37 on the client's iPhone and screen-record the halt.

**A5 — Portrait/square videos render tiny in a black box**
- **Root cause.** Fixed. `videoShape()` (`client/src/lib/videoShape.js`) drives
  `--player-aspect`/`--player-ratio` (`Watch.jsx:716-719`), consumed at
  `client/src/styles/realdata.css:29-47`: the stage takes the file's own rectangle,
  capped at `min(80dvh, 820px)`.
- **Evidence.** Live API returns real dimensions — `886×1920`, `360×640`, `360×480`.
  Fallback `onMediaSize` from the SDK covers null columns (`Watch.jsx:790-794`).
- **Platform.** Not platform-specific. `dvh` needs iOS 15.4+; below that the height cap is
  ignored, not broken. **Confidence.** High.
- **Fix scope.** None. **Verify.** Open `rpreplay-final1589783013-2` (886×1920) on the iPhone.

**A6 — Top progress bar animates indefinitely**
- **Root cause.** No unbounded path survives. `start()` carries an 8 s `FORCE_STOP_MS` cap
  (`ProgressContext.jsx:24-27`); `RouteProgress` stops at 600 ms (`App.jsx:39-44`); Explore's
  `isRefetching` is always cleared in a `finally` (`Explore.jsx:87-91`). **Residual:**
  `VideoCard.warm()` calls `start()` on `onPointerDown` *and* `onTouchStart`
  (`VideoCard.jsx:117-118`) — on iOS both fire, and a tap that does not navigate leaves the
  bar up for the full 8 s, which reads as "indefinitely".
- **Evidence.** As cited. **Platform.** iOS/iPadOS — dual pointer+touch events.
- **Confidence.** Medium (mechanism High, that it is *the* report Medium).
- **Fix scope.** Small (client) — drop `onTouchStart`, keep `onPointerDown`.
- **Verify.** Tap a card and swipe away without navigating; time the bar.

**A7 — Homepage first-load glitch, layout jumps**
- **Root cause.** The known cause is fixed — Landing has no boot splash and renders
  `is-ready` from the first frame (`Landing.jsx:16-22,41`), and `Preloader` skips `/`
  entirely (`Preloader.jsx:14-15`). Remaining candidates: `Trending` paints from
  `landingCache` (sessionStorage) then swaps to live data, changing grid height; and lazy
  card images without reserved boxes above the fold.
- **Evidence.** `landingCache.js`, `VideoCard.jsx:73-84` (a placeholder span exists, so the
  box *is* reserved). **Platform.** Not platform-specific.
- **Confidence.** **Low — unverified.** → §13 Q5.
- **Fix scope.** Small. **Verify.** iPhone screen recording of a hard reload of `/`.

### B. Monetization

**B8 — Buying A unlocks other paid videos**
- **Root cause.** Not reproducible from the code — see §3. Four independent guards, one
  test. **The likely explanation is the test account:** `isStaff` grants `canWatchFull` on
  everything (`entitlement.js:41-45`), as does `isOwner`. An admin or the creator browsing
  the viewer site opens every video without paying.
- **Evidence.** `entitlement.js:14-72`, `App.jsx:65`, `Watch.jsx:108,170`,
  `watchUrl.js:45`, `shareRules.test.js:36-43`. Live anonymous probe returns
  `canWatchFull: false`.
- **Platform.** Not platform-specific. **Confidence.** High that the server is correct;
  **Low** on which account reproduced it. → §13 Q6.
- **Fix scope.** Small — the badge already says "Staff"; consider requiring an explicit
  "open as staff" action so staff cannot mistake it for a viewer entitlement.
- **Verify.** Register a brand-new email, buy one video, open two others. Screen-record.
  Send the client the recording plus the `purchases` rows for that user id.

**B9 — Playback restarts at 0:00 after payment**
- **Root cause.** Fixed — full trace in §4. Server-side `watch_progress` +
  `sessionStorage` + the player's live second, `resumePoint()` picking the furthest honest
  value, `startTime` pinned in the URL, SDK seek as a backstop, muted auto-continue with no
  second tap.
- **Evidence.** `Watch.jsx:334-341, 491-538, 563-568`; `resumePoint.js`; `StreamPlayer.jsx:210-218, 466-494`.
- **Platform.** Residual iOS risk only: Safari may refuse even muted `play()` after the sheet
  closes, leaving the film paused *at the right second*.
- **Confidence.** High. **Fix scope.** None. **Verify.** Sandbox-buy at 3:37 on the client's
  iPhone; screen-record the resume.

**B10 — Skip countdown starts on a black ad screen**
- **Root cause.** Fixed. See §7 — the clock is driven by media time above a 0.25 s floor.
- **Evidence.** `adSkip.js:10-26`, `AdBreak.jsx:30-36,99`, `StreamPlayer.jsx:392-396`.
- **Platform.** Not platform-specific. **Confidence.** High. **Fix scope.** None.
- **Verify.** Open `how-to-cook-pilau-properly` (free_with_ads) signed out.

**B11 — Paid Premiere → Free + Ads automatically**
- **Root cause.** Implemented both ways: the daily cron `POST /api/jobs/premiere-expiry`
  (`server/vercel.json` crons) and an on-open `expireIfDue` on the video, playback and ads
  routes (`premiere.js:70-79`). Buyers keep ad-free access (`entitlement.js:69`).
- **Evidence.** `premiere.js`, `videos.routes.js:728`, `playback.routes.js:173`, `ads.routes.js:43`.
- **Platform.** Not platform-specific.
- **Confidence.** **Medium** — the cron is guarded by `assertCronSecret`
  (`routes/index.js:74-82`) and throws 403 if `CRON_SECRET` is unset on Vercel. I cannot see
  Vercel's env from here. → §13 Q7.
- **Fix scope.** Small (config). **Verify.** `curl -H "x-cron-secret: …" …/api/jobs/premiere-expiry`
  and check Vercel's cron execution log.

**B12 — Admin data reconciliation**
- **Root cause.** Three separate things.
  - *Revenue chart hard-coded 70/30:* **fixed.** `RevenueTab.jsx:21,27` reads
    `api.admin.revenue()` and `defaultSplitPercent`; the literal `70` at `:23` is initial
    state only.
  - *Duplicate creator override rows:* **partly fixed.** `admin.routes.js:1156-1165` now
    selects `p.email` to disambiguate identical display names. But the query returns **all**
    `creator_profiles`, including those with `revenue_split_percent IS NULL`, under a heading
    that says "overrides".
  - *Analytics 0 while Dashboard shows revenue:* **live bug.** Two different permission gates
    for the same data — `OverviewTab.jsx:38` uses `can('revenue')`, `AnalyticsTab.jsx:33` uses
    `can('payments')`. A sub-admin with one and not the other sees exactly this. Worse,
    Analytics computes "Total Views" and "Paid Unlocks" by summing the **first 100 published
    videos** and "Payment Success" over the **last 200 payments**
    (`AnalyticsTab.jsx:37-48,75`), while the Dashboard uses DB-side aggregates — so the two
    diverge as the catalogue grows, regardless of permissions.
  - *User Management showed 0 users:* not reproducible from code — `UsersTab.jsx:35` calls
    `api.admin.users(...)` normally. Most likely the same permission gate (`users` module)
    or a stale build. → §13 Q8.
- **Platform.** Not platform-specific. **Confidence.** High for Analytics; Medium for Users.
- **Fix scope.** Small (admin) for the gate; Medium to move the aggregates server-side.
- **Verify.** Sign in as the full admin, then as a sub-admin with only `revenue`, and
  compare the two tabs. Send the client both screenshots side by side.

### C. Sharing

**C13 — WhatsApp delivers a plain URL / bare domain; iPad "application couldn't be opened"**
- **Root cause.** Three, all confirmed.
  1. **Cache-variant collision** — `watch.js` branches on `Sec-Fetch-Mode`/`Sec-Fetch-Dest`
     but declares only `Vary: User-Agent, Accept-Encoding` (`watch.js:220,275`). Reproduced
     both directions (§5). WhatsApp Web receives the React shell; humans receive the crawler
     stub.
  2. **iPad** — `ShareSheet.jsx:31,167` imports `whatsappHref` from `socialShare.js:61-63`,
     which returns `api.whatsapp.com`. The correct implementation
     (`client/src/lib/whatsappShare.js`) is imported by nothing, and
     `shareRules.test.js:61-67` asserts the broken URL.
  3. **Slow poster** — 2.50 s TTFB on a card MISS, 1.43 s of it a guaranteed HTTP 400 to a
     Supabase bucket that was never written because `serviceRole: false`.
- **Evidence.** Live reproductions in §5; `/health` capabilities; the three files above.
- **Platform.** (1) affects WhatsApp Web/Desktop **and every tapped link on every device**;
  (2) is iPad/iOS-specific; (3) is worst on slow connections.
- **Confidence.** **High** — all three reproduced against production.
- **Fix scope.** Small×3. Add `Vary: Sec-Fetch-Dest, Sec-Fetch-Mode, User-Agent` (or give the
  crawler doc its own URL); switch the import to `whatsappShare.js` and update the test; set
  `SUPABASE_SERVICE_ROLE_KEY` and backfill the bucket (`npm run share:backfill`).
- **Verify.** For the client: `curl -A "WhatsApp/2.23.20.0 A" <url>` then immediately open the
  same URL in Safari — currently returns a page with no app. Send them that before/after.
  Then a real WhatsApp send from iPad Safari.

**C14 — Share button froze 60–90 s; failing again Aug 29**
- **Root cause.** The warm-up retry loop is gone: `healShareCard` is one attempt per slug per
  page and its guard is deliberately never released (`warmShare.js:78-91`), and the card is
  DB-cached with `Cache-Control: immutable` (`shareCardServe.js:21`). **But** the sheet still
  polls `api.share.payload(slug)` every 4 s **forever** while `clip` is null
  (`ShareSheet.jsx:132-156`), and that endpoint calls `cf.ensureMp4Download` — up to two
  Cloudflare API calls per poll (`share.routes.js:76`). On a video whose 60 s clip never
  materialises, that is an unbounded poll against Cloudflare's API from every open sheet.
  The Aug 29 recording is most likely C13(3): a 2.5–2.8 s card fetch on a slow link.
- **Evidence.** `ShareSheet.jsx:132-156`, `share.routes.js:70-99`, measured 2.50 s.
- **Platform.** Worse on slow connections. **Confidence.** Medium-High.
- **Fix scope.** Small (client) — cap the clip poll at 3 attempts.
- **Verify.** Open the sheet with the Network panel and watch `/api/share/<slug>` repeat.

**C15 — Instagram / TikTok / Facebook open the OS share sheet**
- **Root cause.** Fixed. `socialShare.js:37-58` returns real app schemes:
  `instagram://app`, `tiktok://`, and Android `intent://…;package=…` with a
  `browser_fallback_url`. `launchSocial` (`ShareSheet.jsx:204-217`) navigates directly;
  `navigator.share` is only behind the separate "More apps" row.
- **Evidence.** As cited. **Platform.** iOS custom schemes open the app but **cannot
  pre-fill a post** — no iOS API allows it. The clip is downloaded and the link copied
  instead, which is the correct workaround and is explained in the UI copy
  (`ShareSheet.jsx:227-229`).
- **Confidence.** High. **Fix scope.** None.
- **Verify.** Tap Instagram on the client's iPhone with the app installed.

**C16 — Per-video OG in the initial server HTML**
- **Root cause.** Implemented and verified live (§5). Full tag set, absolute
  same-origin `.jpg` `og:image`, `twitter:card`, canonical, `sw_TZ` locale, `ACAO: *`,
  edge-cached (`X-Vercel-Cache: HIT`, `Age: 19`). Card = poster + title + creator + MTONYO+ +
  WATCH FREE PREVIEW, burned into the JPEG.
- **Gaps.** (i) The cache collision in C13(1) can serve the wrong variant. (ii) On a cold
  instance the *browser* variant falls back to a slug-derived title with a duplicated
  "MTONYO+" (`watch.js:149,202`) — confirmed live:
  `"Behind The Fame A Coast Documentary — MTONYO+ | MTONYO+"`. (iii) Card MISS is 2.50 s.
- **Confidence.** High. **Fix scope.** Small.
- **Verify.** Facebook Sharing Debugger + `curl -A "WhatsApp/2.23.20.0 A"`.

### D. Auth / UX

**D17 — First login fails, second works** — Fixed. Full trace in §6. Autofill read from the
DOM (`Login.jsx:95-99`), 401 scoped to the token that failed (`api.js:175`), in-memory token
mirror for Safari Private Browsing (`api.js:47`). **Confidence** High. **Scope** none.
**Verify:** iPhone Safari, private window, saved-password autofill, one tap.

**D18 — Buttons need two taps on iPhone/iPad**
- **Root cause.** Mostly fixed, with a residue. Every transform-based hover lift is inside
  `@media (hover: hover) and (pointer: fine)` **and** gated on `html:not(.is-touch)`
  (`global.css:2960-2987`), with `is-touch` set by an inline script before first paint
  (`client/index.html:4-15`) that also catches iPad via `maxTouchPoints > 1`. **But 53 of 72
  `:hover` rules sit outside those guards**, and one of them moves the element:
  `a.pw-og-stage:hover{transform:translateY(-3px)}` at `global.css:2751` is guarded by bare
  `@media(hover:hover)` — **no `pointer: fine`, no `is-touch`** — so it lifts on an iPad with
  a Magic Keyboard or trackpad attached. The other 52 are colour/border only.
- **Evidence.** Enumerated programmatically over `global.css`. **Platform.** iPad-specific.
- **Confidence.** Medium. **Fix scope.** Small (one CSS rule).
- **Verify.** iPad with keyboard attached, tap the homepage share-card preview once.

**D19 — Blank area near the bottom; anchor links land under the header**
- **Root cause.** Anchors: fixed — `scroll-padding-top: calc(var(--header-h) + 12px)`
  (`global.css:31`) plus `scrollWhenReady` with drift correction
  (`useSectionLink.js:46-72`). Blank area: `.explore{min-height:100vh}`
  (`global.css:1752`) is **not** in the `@supports (height:100dvh)` override at
  `global.css:966-970`, which lists `.hero`, `.auth-wrap`, `.dash`, `.page`, `.sidebar`,
  `#preloader`, `.landing-boot` — so on iOS Safari `/explore` is taller than the visible
  viewport by the URL-bar height. The homepage itself *is* covered.
- **Evidence.** As cited. **Platform.** **iOS Safari-specific** (`100vh` ≠ visible viewport).
- **Confidence.** High for `/explore`; **Low** that this is the homepage report the client
  made. → §13 Q5.
- **Fix scope.** Small — add `.explore` to the `dvh` block.
- **Verify.** iPhone Safari, scroll `/explore` to the bottom.

**D20 — Logo not clickable on some pages** — Fixed. `Logo.jsx:43-58` handles the
same-route case React Router treats as a no-op, and strips a `replaceState` hash. Present on
Landing/Explore/Watch/CreatorProfile/Legal via `Header`, and on Dashboard via
`Sidebar.jsx:127` plus a separate `dash-home` link (`Dashboard.jsx:172`).
**Confidence** High. **Scope** none. **Verify:** tap the logo on `/` while scrolled to
`#features`.

### E. Access control / security

**E21 — Unapproved video appeared in Explore**
- **Root cause.** **Not a gating hole — a data artefact.** Every public query filters
  `is_published = true and review_status = 'approved' and deleted_at is null`:
  list `videos.routes.js:119`, one `:748`, related `:795`, storefront
  `creatorStorefront.js:20-22`, share-meta `shareMeta.js:85`, share payload `:47`,
  clip `share.routes.js:290`, stats `stats.routes.js:33`, ads `ads.js:35`. **And the database
  refuses it independently** — `guard_video_publication()` raises
  *"A video cannot be published before it is approved"*
  (`002_publish_guard_and_rls.sql:49-52`), for the API's own connection too.
  The title in question is a **demo seed row deliberately named**
  `'Nyerere Day — Rehearsals (awaiting review)'` (`server/src/cli/demo.js:803`) — it says
  "awaiting review" in its *title*. `demo.js:836-857` contains a corrective that forces it
  back to `pending_review` if it was ever approved, and `videos.list.import.test.js:17`
  locks that in.
- **Evidence.** **Live check: it is not in the public catalogue today.**
  `GET /api/videos?limit=6` returns 8 total, none of them that row.
- **Platform.** Not platform-specific. **Confidence.** High. **Fix scope.** None (data).
- **Verify.** Send the client the live `/api/videos` JSON and an Explore screenshot.
  Separately, two rows on Explore now look like accidents: a 1-second `free_with_ads` video
  titled `"80915499123 FD8FEAC4 6609 4D3E 8739 D3A2CDDE7F76"` and
  `"WhatsApp Video 2026 08 15 at 11.50.34 PM"`. → §15.

**E22 — Supabase "Table publicly accessible / RLS disabled", Aug 26**
- **Root cause.** The migration that answers it exists (`025_lock_postgrest.sql`, naming
  `share_card_cache` explicitly, plus a `pg_class` sweep, `REVOKE ALL`, and rewritten default
  privileges for both `postgres` and `supabase_admin`), reinforced by `026`'s event trigger.
  **But `server/vercel.json` has `"buildCommand": null` — nothing runs migrations on
  deploy.** Whether 025/026/029 reached production is unverified.
- **Service-role key in browser bundles: NO.** Scanned both `dist` trees for
  `service_role|SUPABASE|supabase\.co|eyJ…` → zero matches. Only `VITE_API_URL` is read.
- **Evidence.** §8. **Platform.** N/A. **Confidence.** High on the code, **unverified** on
  whether it is applied. **Fix scope.** Small (run `npm run db:migrate`; then re-run
  `node server/scripts/audit-rls.mjs`).
- **Verify.** `npm run db:status` and paste the output; screenshot Supabase Security Advisor
  showing zero findings. That screenshot is the proof to send the client.

**E23 — Role enforcement server-side**
- **Root cause.** Correctly enforced, three layers deep. `admin.routes.js:30` mounts
  `requireAuth(), requireStaff()` over the whole router; `:49-60` adds per-module
  `requirePermission()`; account and settings routes additionally carry `requireAdmin()`
  (`:833,867,898,914,939,1015,1274,1686`). `requirePermission` re-reads
  `staff_permissions` **on every request** (`auth.js:193-201`), so a revoked permission takes
  effect on the next call. `requireAdmin` explicitly excludes `sub_admin` rather than relying
  on `requireRole` (`auth.js:93-104`). The database enforces the same rules in
  `guard_account_changes()` and `guard_staff_permissions()`.
- Spot-checked each route the brief names: **verify** → `requirePermission('creators')`;
  **approve** → `('review')`; **withdrawals** → `('withdrawals')`; **revenue split** —
  per-creator `('creators')`, platform-wide `PATCH /settings` `requireAdmin()`;
  **category edit** → `('videos')`; **publish** → `('videos')`. All 403 server-side.
- **Confidence.** High. **Fix scope.** None. **Verify.** Call each with a sub-admin token
  lacking the module and screenshot the 403 bodies — they name the missing permission.

### F. Requested but possibly not built

| # | Feature | Status | Evidence |
|---|---|---|---|
| F24a | **Follow creator** (persisted + count) | ✅ **Built** | `029_follows.sql`, `server/src/lib/follows.js`, `creators.routes.js:9-20`, `api.js:321-324`, `CreatorProfile.jsx:63-69,146-158`. Count mirrored to `creator_profiles.followers`. **Only on the creator profile page** — no follow button on Watch. |
| F24b | **Continue Watching** (exact resume across sessions) | ⚠️ **Partial** | The *data* exists and is exact — `watch_progress` (008) + `resumeFromSeconds` (`playback.routes.js:187,294`) — and resume works per video. **There is no Continue Watching row, list or endpoint anywhere.** Grep for `continue watching` finds only marketing copy (`Features.jsx:169`) and a migration comment (`008:11`) saying it is "the honest foundation … *later*". |
| F24c | **My List / Save for later** | ❌ **Missing** | No table, no route, no UI. Zero matches across client, server, admin and migrations. |
| F24d | **Recently Watched** | ❌ **Missing** | Same. `video_views` exists but is never read back per user. |
| F24e | **Creator name → profile from every video card** | ⚠️ **Partial** | Works from the Watch page (`Watch.jsx:1008`) and Profile tab (`ProfileTab.jsx:200`). **`VideoCard.jsx:99` renders `{author \|\| byline}` as plain text** — not a link, on the homepage, Explore, More Like This and the library. Note a nested `<Link>` inside the card's `<Link>` is invalid HTML, so this needs a non-anchor click target. |

- **Fix scope.** F24b/c/d are the real work: one `saved_videos` table + 2 endpoints + 2 rows
  on the dashboard, and a `GET /api/library/continue` reading `watch_progress`. Medium,
  server + client. F24e is Small (client).

### G. Deployment integrity

**G25** — see §9. Server and client are both on `4419c9c`; admin is unverifiable; the three
apps can drift freely; `SUPABASE_SERVICE_ROLE_KEY` is missing in production; the local Vercel
link for `/server` names the **legacy** project. The Aug 23 failures cannot be diagnosed from
the repo.

---

## 11. Safari / iOS / iPadOS / WhatsApp risk list

| # | Risk | Status |
|---|---|---|
| 1 | **A tapped share link returns a no-JavaScript stub** (edge cache variant collision) | ❌ **Live, reproduced** — §5, C13 |
| 2 | `api.whatsapp.com` on iPad → "Something went wrong. The application couldn't be opened." | ❌ **Live** — the fix exists unused; the test defends the bug |
| 3 | Muted-autoplay refused under iOS Low Power Mode | ⚠️ Unverified — A3, §13 Q4 |
| 4 | `100vh` ≠ visible viewport on iOS Safari | ⚠️ `.page`/`.hero`/`.dash` fixed via `@supports (height:100dvh)`; **`.explore` missed** (`global.css:1752`) |
| 5 | `(hover: hover)` true on iPad with a trackpad → first tap eaten | ⚠️ Fixed for all main controls; **1 residual** at `global.css:2751` |
| 6 | `localStorage` throws on property access in Private Browsing | ✅ `safeStorage.js` wraps the access itself; `api.js:47` keeps an in-memory mirror |
| 7 | Cross-origin cookies between `*.vercel.app` hosts (Public Suffix List) | ✅ **Not applicable** — auth is Bearer + localStorage, never cookies |
| 8 | `navigator.share` cannot name a target app | ✅ Real app schemes used; `navigator.share` only behind "More apps" |
| 9 | iPadOS reports itself as MacIntel | ✅ Handled in three places (`index.html:10`, `socialShare.js:23-26`, `whatsappShare.js:25-27`) |
| 10 | Native HLS vs hls.js | ✅ **Not applicable** — playback is a Cloudflare `<iframe>`; Cloudflare picks the pipeline |
| 11 | `playsinline` | ✅ Inside Cloudflare's embed; `allow="… autoplay; encrypted-media; picture-in-picture; fullscreen"` set (`StreamPlayer.jsx:678`) |
| 12 | Stream SDK blocked (content blocker / DNS filter) | ✅ Handled — `ensureStreamSdk()` resolves `null`, nothing is drawn over the iframe, Cloudflare's own controls take over (`StreamPlayer.jsx:308-326`) |
| 13 | `visualViewport` / keyboard | ⚠️ `interactive-widget=resizes-content` set (`index.html:17`); no `visualViewport` handling. Not reported. |
| 14 | Card fetch 2.5 s on a slow link → WhatsApp gives up on `og:image` | ❌ **Live** — C13(3) |

---

## 12. Recommended fix order

**Tier 1 — do these before anything else (all Small, all reproduced)**

1. **`Vary: Sec-Fetch-Dest, Sec-Fetch-Mode, User-Agent`** on both responses in
   `client/api/watch.js` — or give the crawler document its own path. *Nothing else matters
   while shared links can return a page with no app.* No dependencies.
2. **Set `SUPABASE_SERVICE_ROLE_KEY` in the server's Vercel env**, redeploy, run
   `npm run share:backfill`. Removes a guaranteed 1.43 s from every card MISS and turns the
   CDN leg on. No dependencies.
3. **Switch `ShareSheet.jsx:31` to import `whatsappHref` from `@/lib/whatsappShare`**, and
   update `shareRules.test.js:61-67` to assert `whatsapp://` on phone / `web.whatsapp.com`
   elsewhere. Fixes iPad. No dependencies.
4. **Import `recordCrawlerHit` in `server/src/modules/share.routes.js`.** Without it you
   cannot measure whether 1–3 worked. Do it *with* them, not after.

**Tier 2 — the player wait (Medium, server)**

5. Lazy-import `getFallbackShareCard` in `shareCardServe.js` so `sharp` leaves the cold path.
6. Remove `readCardStatus` from `GET /api/videos/:id` — store `card_ready` as a boolean
   column, written by `buildShareCard`. *Depends on 5* (same file family).
7. Pass the already-loaded purchase into `resolveAccess` at `videos.routes.js:731`.
8. Replace `id::text = $1` with typed uuid/slug in `ads.routes.js:26`, `share.routes.js:27`,
   `buildShareCard.js:21`.
9. Make `ensureShareCardTable()` a no-op on warm isolates (module-level flag already exists —
   it just needs to not re-run the DDL when the first call raced).
10. Then re-measure. Only if `/api/videos/:slug` is still >500 ms warm should you consider a
    scheduled keep-warm (which needs a paid Vercel plan).

**Tier 3 — correctness and polish (Small)**

11. Add `.explore` to the `@supports (height:100dvh)` block (`global.css:966-970`).
12. Guard `a.pw-og-stage:hover` with `pointer: fine` + `html:not(.is-touch)` (`global.css:2751`).
13. Drop `onTouchStart` from `VideoCard.jsx:118` (keep `onPointerDown`).
14. Cap the clip poll in `ShareSheet.jsx:142,147` at 3 attempts.
15. Align `AnalyticsTab` to `can('revenue')` and move its two aggregates server-side.
16. Make `VideoCard`'s creator name a real click target to `/creator/:id`.

**Tier 4 — build the missing features (Medium)**

17. `saved_videos` table + `GET/POST/DELETE /api/library/saved` → My List.
18. `GET /api/library/continue` from `watch_progress` → Continue Watching + Recently Watched
    rows. *Depends on 17 only for shared UI.*

**Tier 5 — deployment hygiene**

19. Run `npm run db:migrate` and capture `db:status`; re-run the Security Advisor.
20. Confirm which Vercel project `/server` actually deploys to; fix or delete
    `server/.vercel/project.json`.
21. Add a build id to `/admin` and a `/version` endpoint or header to both SPAs.

---

## 13. Questions for Waqas

1. **Have migrations 025, 026 and 029 actually been applied to production?**
   `server/vercel.json` sets `buildCommand: null`, so nothing runs them on deploy. Please run
   `npm run db:status` against the production `DATABASE_URL` and paste the output. This is the
   single fact that decides whether the Aug 26 Supabase warning is fixed or still open.
2. **Which Vercel project does `/server` deploy to?** `server/.vercel/project.json` says
   `video-monetization-platform-backend` — the legacy name the code routes away from — while
   traffic is served from `…-server.vercel.app`. Was the project renamed, or are there two?
3. **Do you still have the Aug 23 04:06 / 04:12 / 04:16 build logs?** Nothing in the repo
   records what failed.
4. **Was the client's iPhone in Low Power Mode** when the preview would not autoplay? It
   blocks muted autoplay outright and would explain A3 completely.
5. **Which page and which device** produced the "large blank/black area near the bottom"?
   I can prove `/explore` has a `100vh` bug on iOS; I cannot reproduce it on the homepage.
6. **Which account did the client use when buying video A opened video B?** If it was an
   admin, a sub-admin, or the creator of those videos, the behaviour is by design
   (`entitlement.js:41-45`) and the fix is a UX one, not a security one. A fresh viewer
   account changes the answer entirely.
7. **Is `CRON_SECRET` set in the server's Vercel environment,** and does the Vercel cron log
   show `/api/jobs/premiere-expiry` succeeding daily? Without it the job 403s silently and
   premieres never convert.
8. **When User Management showed 0 users** — which role was signed in, and does it still
   happen on the current build? The route looks correct; I suspect the `users` permission gate
   or a stale admin bundle (the admin app has no build id, so I cannot check).
9. **Is `SUPABASE_SERVICE_ROLE_KEY` deliberately unset,** or an oversight? It also disables
   admin user creation and deletion, not just share-card upload.
10. **The two junk rows on Explore** (`80915499123 FD8FEAC4…`, 1 second long, and
    `WhatsApp Video 2026 08 15 at 11.50.34 PM`) — test uploads, or does the client see these?

---

## 14. Claims vs reality

| Homepage claim | Source | Reality |
|---|---|---|
| "Pay Once & Paid Premiere … becomes Free + Ads automatically when your paid period ends" | `copy.js:231` | ✅ **Backed** — cron + on-open `expireIfDue`. *Conditional on `CRON_SECRET` being set (Q7).* |
| "You Set the Free Preview … choose exactly how many minutes" | `copy.js:236` | ✅ **Backed**, with a ceiling: `min(5 min, duration/3)` (`preview.js`). The creator is not told the ceiling until it clamps. |
| "Mobile money. Verified in seconds, and the video unlocks instantly" | `copy.js:243` | ⚠️ **Partial** — the unlock mechanics are real, but the provider is **sandbox** (`/health` env, `payments.provider`). Real M-Pesa/Airtel is Milestone 3. |
| "Auto Social Previews — every upload automatically generates a 60-second promotional clip" | `copy.js:249` | ✅ **Backed** — `ensureClips` cuts a public 60 s clip and enables MP4 download (`playback.routes.js:515-529`). |
| "…WhatsApp and Facebook get the video card from the link" | `copy.js:250` | ⚠️ **Partial** — the card is real and correct, but the poster is 2.5 s on a MISS and the shared *link* can serve a no-JS stub (C13). |
| "Smart Deep Links — each video gets a unique link that opens customers directly on its watch & purchase page" | `copy.js:255` | ❌ **Broken intermittently** — the edge cache can serve the crawler stub to humans for 300 s. Reproduced. |
| "Secure Streaming Protection — signed, expiring stream URLs mean copied links die instantly" | `copy.js:261` | ✅ **Backed** — RS256 tokens, 15 min preview / 60 min full (`playback.routes.js:77-78`), full-film token never minted for a locked viewer. A past bypass (signing the poster against the full asset) is fixed and documented (`entitlement.js:194-215`). |
| "Adaptive streaming delivers smooth playback even on slow connections" | `copy.js:262` | ✅ **Backed** — Cloudflare Stream HLS/DASH. |
| "Generous 70/30 revenue split" | `copy.js:310` | ❌ **Marketing only** — hard-coded copy. The real split is `platform_settings.creator_split_percent` with per-creator overrides; change it in the admin and the homepage still says 70/30. |
| "Real-time earnings dashboard … update live" | `copy.js:315` | ⚠️ **Partial** — figures are real and DB-derived, but there is no live push; they update on load/refetch. |
| "Ads keep paying after the premiere" | `copy.js:320` | ✅ **Backed** — `ads_on_expired_premieres` setting, `showsAds` excludes buyers and the creator. |
| "Everyone who paid keeps it ad-free" | `entitlement.js:60-68` | ✅ **Backed** and defended in two places (`entitlement.js:69`, `ads.js:49-56`). |
| "Buyers keep access after unpublish" | brief | ✅ **Backed** — `videos.routes.js:748` and `playback.routes.js:203` admit a held purchase; hard delete is blocked by trigger while purchases exist. |
| "Nothing public until admin approves" | brief | ✅ **Backed at three layers** — API filters, RLS policy, and a DB trigger that refuses `is_published` without `approved`. |

---

## 15. Additional findings

1. **`POST /api/share/crawl-hit` returns 500 on every request.** `recordCrawlerHit` is called
   at `share.routes.js:335` and never imported (the file imports 14 other symbols; this one is
   missing). ESM does not fail at load time, so it only throws inside the handler.
   **Verified live: HTTP 500.** Every OG render calls it (`client/api/watch.js:181` →
   `report.js:25`), so all HTML-side crawler telemetry is lost while image-side telemetry works
   (`shareCardServe.js` imports it correctly) — giving a *systematically misleading* picture in
   `crawler_hits`.
2. **`startReport` puts a cross-function API call on the OG path.** Opening any `/watch/:slug`
   causes the client's serverless function to POST to the server's serverless function
   (`report.js:23-41`), so a cold share link cold-starts **two** lambdas. It is awaited after
   `res.end()`, so it does not delay the response — but it doubles the invocation cost and, as
   above, always fails.
3. **`ensureClips` fires a Cloudflare API call on the play path.** `playback.routes.js:265,276`
   call it fire-and-forget on every locked playback; inside, it does a DB read and
   `cf.getVideo(preview_uid)` to check clip staleness (`playback.routes.js:493-497`). On Vercel
   the isolate may be frozen the moment the response ends, so this work is often killed
   half-done — while still consuming a Cloudflare API quota slot per view.
4. **The payment modal polls once per second for up to 180 s** (`PaymentModal.jsx:149`) against
   a **120 requests/minute** rate limit (`app.js:113-119`). A single checkout consumes half the
   viewer's budget; add `saveProgress` and any browsing and a real purchase can rate-limit
   itself. The rate limiter is keyed by IP, so shared/NAT'd mobile connections in Tanzania make
   this worse, not better.
5. **The service worker caches every successful navigation under the key `'/'`**
   (`sw.js:77`). Navigate to `/watch/x`, go offline, open `/` → you get that video's HTML as the
   app shell. Offline-only, but wrong.
6. **Two migrations share the number `021`** (`021_crawler_hits.sql`, `021_share_card_cache.sql`).
   `migrate.js:18` sorts by filename so the order is deterministic today, but the numbering
   convention is broken and the next `021_*` will be ambiguous.
7. **`admin.routes.js` "overrides" list returns every creator,** including those with
   `revenue_split_percent IS NULL` (`:1156-1165`) — presented under a heading that says
   overrides. This is very likely what the client read as "duplicate creator override rows",
   separately from the same-display-name issue that was fixed.
8. **`socialShare.js` is imported by `mobileUx.js` for `isTouchMobile`** (`mobileUx.js:1-4`),
   which is why the dead `whatsappShare.js` was never noticed — the module *is* loaded, just
   not the function that matters.
9. **Data hygiene visible to the client on Explore:** a 1-second `free_with_ads` video titled
   `"80915499123 FD8FEAC4 6609 4D3E 8739 D3A2CDDE7F76"` with `freePreviewSeconds: 0`, and
   `"WhatsApp Video 2026 08 15 at 11.50.34 PM"`. Both are live and public right now.
10. **`platform_settings` RLS policy is `select using (true)`**
    (`002_publish_guard_and_rls.sql:215`). Grants are revoked so it is not currently reachable,
    but the policy itself would expose the revenue split and price floors to the anon key.

11. **`api/watch` ships the entire website inside the function — 942 KB for a 22 KB job.**
    `client/vercel.json` gives `api/watch.js` `"includeFiles": "dist/**"`, so every build
    artefact is bundled into the serverless function. Measured from a real deployment
    (`vercel inspect`, 2026-08-31): `λ api/watch (942.56KB)`, against ~22 KB of actual
    source (`watch.js` + its three `_lib` imports). The five heaviest included files are
    `dist/assets/index-*.js` 411 KB, `dist/logo.png` 268 KB, `dist/logo-lockup.png`
    228 KB, `dist/assets/index-*.css` 159 KB and `dist/icons/icon-512.png` 126 KB — and
    the function reads **none** of them. `loadShell()` opens exactly one file,
    `dist/index.html`, which is 4.84 KB.

    This matters for A1 rather than for disk: bundle size is a direct input to cold-start
    time, and this function is on the critical path of every shared link and every direct
    `/watch/:slug` open. Narrowing the glob to `dist/index.html` should cut it by ~97%.
    Not changed here — Tier 2, and it wants a deploy-and-measure rather than a code review,
    because the win is entirely in cold-start latency.

12. **Test files under `api/` were being deployed as public serverless functions.**
    Vercel turns every file directly under `api/` into an endpoint. The same
    `vercel inspect` listed `λ api/watch.og.test (14.54KB)` and
    `λ api/watch.variants.test (15.33KB)` alongside the real handlers — so
    `/api/watch.og.test` and `/api/watch.variants.test` were live URLs that would throw on
    invocation. `watch.og.test.js` predates this branch; `watch.variants.test.js` was added
    by it, so this branch made it worse before catching it. Both moved to `api/_tests/`,
    which Vercel excludes — proven by the same build output, which never listed anything
    from the existing `api/_lib/` directory. Fixed on this branch.

---

## Infrastructure note

No infrastructure change is needed to fix anything in this report, and I am not recommending
one. Every Tier 1 and Tier 2 item is a code or environment-variable change on the current
stack.

The one measurement that would justify infrastructure spend later is the region split:
`X-Vercel-Id: sin1::dub1::` — requests enter at a Singapore edge and execute in Dublin, and a
bare `select 1` at `/health` measured **2.08 s**. If, after Tier 2 removes `sharp` and the
share-card round trips from the cold path, `/api/videos/:slug` is still above ~500 ms warm for
the client, the specific bottleneck is **serverless cold start plus the geographic distance
between the function region, the Supabase region and Tanzania** — and the narrowest fix for
that is a Vercel plan that permits a 5-minute keep-warm cron (the endpoint already exists at
`routes/index.js:112`), not a platform migration. Measure first; the code fixes are likely to
be enough.
