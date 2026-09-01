# Milestone 2 — gap audit

Diagnosis only. No code was changed, no migration was run, every database query here was a
read. Numbers already established elsewhere are cited with their date rather than re-measured.

Sources: `AUDIT.md`, `PLAYER-MEASURE.md`, `TIER1-VERIFY.md`, `RAILWAY-MOVE.md`,
`CLIENT-REPORT.md`. Production is `main` on Railway + two Vercel projects, auto-deployed.

---

## 0. Status

| # | Client's item | Status | Evidence | What the client sees today |
|---|---|---|---|---|
| 1 | Performance / freezing | **Partial** | tap→playing 3108 / 3585 / 3218 ms, PLAYER-MEASURE.md 2026-09-01 | Playback is fixed and measured. Navigation timings are **not** — see §1, one number is disputed |
| 2 | Video startup speed | **Done (floor reached)** | PLAYER-MEASURE.md "Floor", 2026-09-01 | 3.1–3.6 s typical, ~3.5 s of it Cloudflare's. Item 8 "never frozen" **not built** |
| 3 | Sharing / WhatsApp | **Done** | D1 run 2026-09-01, 8/8 videos | Crawler doc, per-video title, 1200×630 JPEG 16–57 KB, cache HIT, shell for humans |
| 4 | Payment resume | **Done** | A2 15/15, 2026-09-01 | Buys, resumes at the preview stop, survives logout→login |
| 5 | First-click responsiveness | **Partial** | one unguarded hover rule, `global.css:2755` | `onTouchStart` duplication fixed; iPad-with-mouse **never run** |
| 6 | Mobile/tablet/desktop stability | **Not started** | no artefact for C1–C7 or E | **Blocked: WebKit will not install here** — see §6 |
| 7 | Follow persistence | **Partial** | `follows.js:40-45`, `029_follows.sql` | Works and does not drift (0/14 rows disagree). **No Follow button on Watch or on cards** |
| 8 | Continue Watching | **Missing** | no `/api/library/continue` | Per-video resume works; there is no list, and the write cadence is the real risk |
| 9 | My List | **Missing** | no `saved_videos` table | Nothing to save with |
| 10 | Recently Watched | **Missing** | no `/api/library/history` | Nothing |
| 11 | Creator connections | **Partial** | `VideoCard.jsx` byline is plain text | Creator reachable from Watch only, not from any card |

**My Library rows the client asked for — today: 1 of 4.** Purchased exists. Continue Watching,
My List and Recently Watched do not.

---

## 1. Performance and freezing

Established, not re-measured: tap→playing **3108 / 3585 / 3218 ms** (iPhone 13, production,
median of 5 with a discarded warm-up, PLAYER-MEASURE.md 2026-09-01), of which roughly 3.5 s is
Cloudflare's own floor.

Newly measured — Chromium only, median of 5, one warm-up discarded, 2026-09-01:

| journey | desktop 1440×900 | iPhone profile |
|---|---|---|
| Back from a video to Home | **169 ms** `[147–188]` | **62 ms** `[52–135]` |
| Home → a second video | 2301 ms `[1889–2994]` | 1059 ms `[1030–1511]` |
| Explore category filter | 2651 ms `[1540–2832]` | 1306 ms `[936–1425]` |
| Dashboard tab switch | not captured — the selector did not match a tab | — |

**The client's "4–7 s freezes returning Home" does not reproduce.** Going back to Home is
62–169 ms. Whatever they experienced, it is not this navigation as it stands today.

Over 1 s and worth work: **Explore's category filter** (1.3–2.7 s) and **Home → second video**
(1.1–2.3 s).

**One number is disputed and is deliberately not reported as a finding.** A breakdown run put
the lazy `Watch-*.js` chunk — and therefore the player — at ~17–21 s from both Home and Explore,
while the API answered in 0.7–1.6 s. That contradicts the repeatedly measured 3.1 s tap→playing
and the ~920 ms iframe attach in the same file. One of the two is wrong and I have not
established which. Four separate instrument errors were found and corrected during this
session's measurements, so an unexplained 20× disagreement is treated as a suspect instrument,
not as a result. **This needs resolving before anyone acts on it**, and it is the first thing
in the build order.

---

## 2. Video startup

Done as far as this codebase can take it: 3.1–3.6 s typical against a CDN floor of ~3.5 s.
Route B — mounting the player before `/api/videos` — was attempted three times and is closed;
the reasoning is in PLAYER-MEASURE.md.

**Gap: item 8, "never looks frozen", is not built.** No poster shell at 0 s, no "Connecting…"
at 1.5 s, no "Slow connection" at 5 s, no retry at 12 s. The known defect stands: the retry
button cannot render on the timeout path, because `waitingForPlayback` is gated on
`!playback.error` and the 20 s `useApi` timeout fires first.

---

## 3. Sharing / WhatsApp

Run 2026-09-01, all 8 published videos, CLI only:

`X-Doc: crawler` for a WhatsApp UA · per-video `og:title` · `og:description` · absolute
`og:image` · `image/jpeg` · **1200×630** · 16–57 KB (limit 300 KB) · `X-Vercel-Cache: HIT` on
both fetches · TTFB 0.32–0.82 s.
Same URL with an iPhone UA and `Sec-Fetch-Mode: navigate` → `X-Doc: shell` with `id="root"`.

Two notes. One video's description omits the creator segment — `WATCH FREE PREVIEW · MTONYO+`
against `WATCH FREE PREVIEW · Juma Kileo Live · MTONYO+` elsewhere — and it is one of the two
test uploads already slated for unpublishing. One TTFB read 2.16 s once; five re-samples gave a
0.45 s median, so it was a cold edge, not a defect.

**Cannot be proven without a phone: the card as it renders inside a WhatsApp chat, and the tap
from that card into the app.**

---

## 4. Payment resume

Done. A2, 2026-09-01, 15/15 with a real account created through the production form and three
real sandbox purchases.

**What the client could still see, and it is not a bug:** a viewer who pays without watching
resumes at 0, not at the preview cut-off — `resumePoint`'s documented rule. Nothing in the UI
explains it, so it can read as "it forgot where I was". A one-line caption when the resume
point is 0 would close it.

---

## 5. First-click responsiveness

`onTouchStart` duplication in `VideoCard.jsx` is fixed — a `warmed` ref makes one warm per card
whichever event arrives first.

One `:hover` rule that moves an element is still outside the touch guards:
**`global.css:2755`**. On iPad the first tap is consumed applying the hover state.

**The iPad-with-mouse profile has never been run.** No harness or results file in the
repository mentions it.

---

## 6. Cross-device stability — blocked

None of C1–C7 or Part E has run, for one reason: **WebKit cannot be installed on this machine.**
Three attempts — `playwright install webkit` twice, then a direct download of the archive — all
failed. The archive is reachable (`HTTP 200`, 62,478,226 bytes) but the transfer dies partway:
9,584,095 bytes received, `curl` exit 56.

Everything the client reported for stability is a Safari and iPad symptom, and Chromium is not
evidence for it. This is the single largest blocker in this audit.

What did get done without WebKit: `.explore` was the one full-height section missing from the
`@supports (height:100dvh)` block and is now fixed — the cause of both the blank strip and a
good part of the "vibration", since on iOS the collapsing URL bar resizes a `100vh` section
under the finger. It cannot be confirmed headlessly: no URL bar, no collapse.

Also established: there is no JavaScript scroll jank to remove on Chromium. A CPU profile of a
10 s Explore scroll shows the main thread **98.5 % idle, 23 ms of JavaScript**. Most of the
suspect list is already handled — the one scroll listener is passive and rAF-throttled,
`useInView` is one-shot, `.vid-card` already has `content-visibility`, `.vid-thumb` has a fixed
height, `.site-header` is promoted.

---

## 7. Follow persistence — Partial

**Works, and does not drift.** The count is maintained by application code
(`server/src/lib/follows.js:40-45`), not a trigger. Unfollow recounts rather than decrementing
(`follows.js:32-45`), so it is self-healing and cannot go negative. Double-tap is safe: primary
key on `(follower_id, creator_id)` plus `on conflict do nothing`. State is server-driven; there
is no `localStorage` in `CreatorProfile.jsx`.

Read-only check, production 2026-09-01, all 14 creator rows: **`followers` equals
`count(*) from follows` for every one. Zero drift.** The whole graph is 3 follows.

**Gaps.**

1. **Follow is offered on the creator profile page only.** Watch has no Follow control — its
   creator row is a link with a "Profile" pill. Cards have none. Every share link and every
   Explore tap lands on Watch, so the feature is invisible to almost all traffic.
2. **No trigger, and one real bypass.** `follows.follower_id` is `on delete cascade`: delete a
   *viewer* and their rows vanish while every creator they followed keeps the inflated integer.
   Nothing recomputes it. Today's zero drift is a 3-row table, not a guarantee. Migration
   `006_counter_integrity.sql` moved `videos.views` and `paid_unlocks` onto triggers for exactly
   this reason; `followers` was never given the same treatment.
3. **A blocked creator's followers cannot unfollow.** `unfollowCreator` goes through
   `requireCreator`, which filters `status <> 'blocked'`, so once a creator is blocked every
   follower gets `404` and stays counted forever.
4. No optimistic flip — the button waits a full round trip with only `disabled` as feedback.

**Size: M.** **CLI:** `curl -H "Authorization: Bearer $T" $API/api/creators/<id>` then
`POST/DELETE .../follow`, and the drift query above. **Browser:** that the button survives
logout→login and that the Watch-page control does not fight the paywall.

---

## 8. Continue Watching — Missing

`watch_progress` exists and per-video resume is proven (A2). The list does not: no
`GET /api/library/continue`, no client method, no UI.

**The harder half is the write path, not the list.** Whether a viewer "returns at 8:42" depends
entirely on when the last position was saved. This must be established before the row is built:
how often the player writes, whether it writes on pause and on unload, and whether anything
survives Safari being backgrounded or killed. If the only writer is a timer, the stored position
is the last tick, not where they stopped — and the row will be wrong in exactly the way the
client will notice.

**Size: L** (the list is M; the write path is the risk).

---

## 9. My List — Missing

No table, no routes, no UI. Needs `saved_videos (user_id, video_id, created_at,
primary key (user_id, video_id))` with the RLS and revoke pattern copied from `watch_progress`,
`GET/POST/DELETE /api/library/saved` with an idempotent POST, and a toggle on Watch and on cards.

**The one non-obvious constraint:** a card is already wrapped in a react-router `<Link>`, so any
control inside it must not nest an interactive element inside an anchor. The same constraint
governs item 11.

**Size: L.**

---

## 10. Recently Watched — Missing

No route, no UI. Derive from `watch_progress` rather than `video_views`: it is already keyed by
user and video with an `updated_at`, which is exactly "distinct video, newest first", whereas
`video_views` is an event log and would need de-duplication.

The interaction to decide before building: "Remove from history" and Continue Watching would
share the same row, so removing from one removes from the other unless a flag is added.

**Size: M.**

*(The agent assigned this item lost its connection mid-response; the design above is from the
schema and the surrounding items, and is thinner than the others. Treat it as a sketch.)*

---

## 11. Creator connections — Partial

`VideoCard.jsx` renders the creator's name as plain text on every surface — Home, Explore, More
Like This, My Library. The creator is reachable only from the Watch page.

Same nested-anchor constraint as item 9.

**Size: S.**

---

## 12. Build order

1. **Resolve the disputed navigation number** (§1). Nothing else in performance should be
   touched until it is known whether the Watch chunk really takes 17–21 s or the instrument is
   wrong. It is one afternoon, and every other performance decision depends on the answer.
2. **Get WebKit running**, or accept that C1–C7 and Part E cannot be verified here and decide
   who runs them. This blocks six of the eleven items' acceptance.
3. **Item 8's "never frozen" states** — including the retry button that currently cannot render.
   Independent of everything else, and it is what the client actually sees during the 3.5 s floor.
4. **`global.css:2755`** — one hover rule, one guard. Minutes.
5. **Follow on Watch and on cards** (item 7 gap 1), plus the `followers` trigger (gap 2) and the
   blocked-creator unfollow (gap 3).
6. **Creator link on cards** (item 11) — establishes the nested-anchor pattern that items 9 and
   10 both need.
7. **Continue Watching write path** (item 8) — measure and fix the save cadence *before*
   building the list, or the list will be built on wrong data.
8. **`saved_videos` migration + My List** (item 9).
9. **Continue Watching list**, then **Recently Watched** (items 8, 10), then wire all four My
   Library rows.

Items 3, 4 need nothing. Item 2 is at its floor.

---

## 13. Questions

1. **Who runs the Safari and iPad checks?** WebKit will not install here and the client's
   stability complaints are all WebKit. Either the download is unblocked, or Waqas runs them on
   real devices, or that acceptance is dropped.
2. **"Remove from history" and Continue Watching share a row.** Should removing from history
   also forget the resume position, or should the row carry a `hidden_at` so the film still
   resumes if reopened? This is a product decision, not a technical one.
3. **The two test uploads** — `WhatsApp Video 2026-08-15` and `80915499123 FD8FEAC4…` — are
   published and on Explore. Unpublish now, or at handover with the rest of the test data?
