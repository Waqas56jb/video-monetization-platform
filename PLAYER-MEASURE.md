# Tap → first frame

Branch `fix/player-start`, off `main` (`0eb7641`). 2026-08-31.
Target: press Play → video moving in ≤ 2 s on a warm session, and the UI never looks frozen.

---

## Step 0 — Baseline, before any change

### The instrument

`server/scripts/count-queries.mjs`. It wraps `pg.Pool.query`, `pg.Pool.connect` and
`globalThis.fetch`, boots the real app on an ephemeral port, and issues real HTTP requests —
the only way to catch the work that middleware and helpers do behind the route handler, which
is exactly the work nobody remembers is there.

Three things about it decide whether its numbers mean anything:

**It counts outbound HTTP, not only SQL.** On the player's path a call to Cloudflare or to
Facebook's scraper costs far more than a query and is invisible to a database counter. That is
where this measurement's largest finding came from.

**Attribution is per-request via `AsyncLocalStorage`.** A shared array is wrong in a way that
looks right: fire-and-forget work started by request N lands in request N+1's window. My first
pass did exactly that and reported a Cloudflare call against `/api/ads/preroll`, which never
makes one. Every number below is from the corrected version.

**It waits 2.5 s past the response.** The expensive work here is fire-and-forget —
`ensureClips(id)` is called without `await`, so its Cloudflare request starts only after its
own query resolves, long after the response is sent. Settling for one tick reports **zero**
outbound calls and is confidently wrong. That work is still charged to the request that began
it, because on a persistent host it goes on competing for the same pool and the same rate limit.

### Round trips per request — production database, real routes

| route | cold | warm |
|---|---|---|
| `/health` | 1 sql · 0 http | **1 sql · 0 http** |
| `/api/videos/live-at-arusha-full-set` | 7 sql · 4 http | **3 sql · 3 http** |
| `/api/playback/live-at-arusha-full-set/playback` | 3 sql · 1 http | **2 sql · 1 http** |
| `/api/playback/…fd8feac4…/playback` (no `preview_uid`) | 1 sql · 0 http | **1 sql · 0 http** |
| `/api/ads/preroll/how-to-cook-pilau-properly` | 2 sql · 0 http | **2 sql · 0 http** |
| `/api/ads/preroll/live-at-arusha-full-set` (no ads) | 1 sql · 0 http | **1 sql · 0 http** |

**The audit's "6 queries" on `/api/videos/:slug` was right for the host it was written
against, and half of it has already gone.** Cold is 7; warm is 3. The difference is the
settings load, the share-card DDL and a lazy router's first import — all of them "once per
process", which on serverless meant once per cold invocation and therefore on the request path
in practice. On Railway they are paid at boot and never again. Item 4 is real but is no longer
worth what §12 priced it at; item 1's remaining prize is 3 → 2, not 6 → 2.

### What the DB counter could not see

`/api/videos/:slug`, **on every request**, warm:

```
 1. sql   select v.*, p.full_name as creator_name, … (video + creator)
 2. sql   select source_key, octet_length(jpeg) … from share_card_cache where slug = $1
 3. sql   select v.*, coalesce(cp.display_name, p.full_name) … (a second video+creator read)
 4. HTTP  supabase.co/storage/v1/object/share-cards/live-at-arusha-full-set.jpg
 5. HTTP  supabase.co/storage/v1/object/share-cards/live-at-arusha-full-set-c5ce44811b.jpg
 6. HTTP  graph.facebook.com/?id=…%2Fwatch%2Flive-at-arusha-full-set&scrape=true
```

Three outbound calls on the video route, one of them a **Facebook re-scrape ping**, fired for
every viewer who opens a watch page. Neither the audit nor this brief mentions them, because
a query counter cannot see them. They do not block the response — but they are three network
round trips per play competing for the same process, and the Facebook one is a request to a
third party that has nothing to do with serving this viewer.

`/api/playback/:slug/playback`, warm, on a **locked** video:

```
 1. sql   select v.*, p.id as _purchase_id, … (video + purchase + resume)
 2. sql   select * from videos where id = $1          <- ensureClips re-reads the same row
 3. HTTP  api.cloudflare.com/…/stream/712c14cb453e268cbeb77c3958aa3177
```

This is item 2's claim, confirmed exactly — and with one correction to the brief's framing:
`ensureClips` at `playback.routes.js:265,276` is called **without `await`**, so it adds no
latency to the response the player is waiting on. Its cost is a Cloudflare API call and a
redundant read of a row the route already has in memory, on every locked play. Worth removing;
not worth removing for the reason stated.

The video with **no** `preview_uid` makes no Cloudflare call at all — it is free-with-ads, so
nothing locked ever asks for a preview clip. Every locked title in production already has
`preview_uid` set, which means the `cf.getVideo` on line ~497 fires on the *hit* path, not the
miss path: it re-checks a clip that already exists, on every play.

### Latency, production, warm, `time_starttransfer`, median of 5

| route | samples (s) | median |
|---|---|---|
| `/health` | 0.734 0.863 0.632 0.634 0.684 | **0.684** |
| `/api/videos/live-at-arusha-full-set` | 0.752 0.802 0.755 0.761 0.814 | **0.761** |
| `/api/playback/live-at-arusha-full-set/playback` | 0.629 0.663 0.716 0.728 0.673 | **0.673** |
| `/api/ads/preroll/live-at-arusha-full-set` | 0.936 0.625 0.628 0.650 0.711 | **0.650** |

Per-query cost from these: `(0.761 − 0.684) / (3 − 1) ≈ **38 ms**`, consistent with the
~41 ms measured during the Railway move and with the ~51 ms first estimate once its noise was
corrected. **But note the spread**: `/health` ranges 0.632–0.863 across five warm samples, a
231 ms band on a one-query route. My floor from Pakistan is ~0.6 s and it moves by more than
the entire quantity being measured. That is why the counts above are the load-bearing numbers
and these are corroboration.

### Browser side — tap → first frame, production, median of 3

All figures milliseconds from the tap on an Explore card. `first_playing` is
`currentTime > 0.25` read from inside the Cloudflare iframe via Playwright frame
access — the picture actually moving, not an SDK event.

| video | profile | playback | iframe | video el | canplay | unpaused | **first_playing** |
|---|---|---|---|---|---|---|---|
| `live-at-arusha-full-set` | desktop | 502 | 1147 | 3065 | 4297 | 3065 | **6264** |
| `live-at-arusha-full-set` | desktop · Fast 3G | 304 | 932 | 6155 | 10138 | 6260 | **14186** |
| `live-at-arusha-full-set` | iPhone 13 | 191 | 934 | 2364 | 3832 | 2470 | **5686** |
| `live-at-arusha-full-set` | iPhone 13 · Fast 3G | 194 | 939 | 6220 | 10147 | 6327 | **14217** |
| `how-to-cook-pilau-properly` | desktop | 494 | 1061 | 2644 | 4741 | 2778 | **7652** |
| `how-to-cook-pilau-properly` | desktop · Fast 3G | 563 | 1062 | 6034 | 10113 | 6034 | **14903** |
| `how-to-cook-pilau-properly` | iPhone 13 | 389 | 952 | 2608 | 4679 | 2740 | **6648** |
| `how-to-cook-pilau-properly` | iPhone 13 · Fast 3G | 391 | 980 | 4423 | 8014 | 4553 | **11180** |
| `rpreplay-final1589783013-2` | desktop | 407 | 1071 | 2459 | 4803 | 2559 | **6355** |
| `rpreplay-final1589783013-2` | desktop · Fast 3G | 1338 | 1699 | 6702 | 10262 | 6814 | **13791** |
| `rpreplay-final1589783013-2` | iPhone 13 | 772 | 1714 | 3939 | 6465 | 4054 | **8593** |
| `rpreplay-final1589783013-2` | iPhone 13 · Fast 3G | 190 | 1090 | 6516 | 11249 | 6617 | **16282** |

**Target is 2000. The best cell is 5686 and the worst is 16282** — a portrait title on a
throttled iPhone, sixteen seconds from tap to a moving picture. Every one of the twelve cells
reached the player on all three runs, so none of these is a timeout or a failed load; they are
all successful plays that simply took this long.

Where the time goes, desktop unthrottled, `live-at-arusha-full-set`:

```
tap          0
playback   502   the API has answered                       ← items 1–4 live here
iframe    1147   our page mounts the iframe        (+645)   ← item 5
video_el  3065   Cloudflare's SDK builds its player (+1918)  ← item 7
canplay   4297   enough data buffered              (+1232)
PLAY      6264   the picture moves                 (+1967)
```

**The API is 8% of the wait.** Items 1–4 of the brief target that 8%, and driving
it to zero still leaves 5.8 seconds. The whole of the remaining 92% is after our
own JavaScript has done its job: 645 ms of ours between the response and the
iframe, then **5.1 seconds inside Cloudflare's player.**

One probe decides how to read that, and it was worth adding: **`unpaused` lands at
3065 — the same instant the video element appears, and 1.2 s before `canplay`.**
`play()` is being called early and is not being refused. So the wait is manifest
and buffering, not autoplay permission. Without that mark the obvious reading
would have been an autoplay block, and the fix would have been aimed at the wrong
thing entirely.

The pattern is the same on every profile and every video: `unpaused ≈ video_el`,
always well before `canplay`. Fast 3G triples the buffering leg and leaves the
rest roughly intact, which is consistent with it being data-bound.

**This reorders the brief.** Items 5 and 7 own the large terms; items 1–4 are
worth about 500 ms between them and are still worth doing, because on a
persistent host they also decide how much load the process carries per viewer.
Item 8 stops mattering as polish and starts mattering as the honest answer to a
six-second wait that is not going away this week.

---

*Per-item changes and after-numbers follow below as they are produced.*

---

## Item 7 — the two gaps, named before touching anything

Traced with in-frame resource timing plus the parent's full network log. Both gaps
turned out to be **inside Cloudflare's iframe**, not in our code.

### `iframe → video_el` (+1.9 s) — Cloudflare's embed SDK, with a redirect

```
 861  200  iframe.videodelivery.net/<jwt>                          our iframe document
1047  301  customer-….cloudflarestream.com/embed/sdk-iframe-integration.fla9.latest.js
2080  200  customer-….cloudflarestream.com/embed/sdk-iframe-integration.fla9.latest.js
2483  200  embed/925.684065c0.chunk.js  +  embed/10.8bc27614.chunk.js
```

One script, **1033 ms**, including a **301 redirect** that costs a whole extra round
trip, then two more chunks. In-frame `performance` agrees: `sdk-iframe-integration`
runs 189 → 1701 ms of the iframe's own timeline.

**It is not our watchdog, not the 1500 ms `setPainted` failsafe, and not the manifest.**
`StreamPlayer` cannot make Cloudflare's bootstrap faster. The only lever we hold is
paying DNS and TLS for `iframe.videodelivery.net` and `customer-*.cloudflarestream.com`
before the tap — which is item 6's preconnect, worth a few hundred milliseconds, not two
seconds.

### `canplay → playing` (+1.4–2.0 s) — segment buffering

```
3117  200  …/audio/13…      first audio segment
3133  200  …/video/24…      first video segment
3444  200  …/audio/13…      second
3475  200  …/video/24…      second
```

The player buffers roughly two audio and two video segments before it starts. `unpaused`
is already true well before `canplay`, so nothing is being refused and nothing is waiting
on a gesture — this is data. **Also not ours.**

### What item 7's own checklist actually found

| sub-point | state |
|---|---|
| `preload=auto` | already set (`buildSrc`) |
| `autoplay=true&muted=true` | already set |
| iframe not lazy | confirmed — no `loading="lazy"` |
| play on `canplay`, not a 900 ms poll | `canplay` listener already registered; the 900 ms interval is a watchdog **behind** it, not the primary path |
| 1500 ms `setPainted` failsafe → 400 ms | cosmetic only — it decides when the frame stops being transparent, and the frame is revealed on document load long before playback |
| ad player pre-mount | ad break already fetched in parallel |

**So item 7 has almost nothing to give.** The changes it lists are either already in place
or off the critical path.

### Three things the trace found that the brief does not mention

**1. `/api/videos/:slug` is fetched twice per play** — at 692 ms and again at 1269 ms, same
URL, same row. That is two of the 3-SQL-plus-3-outbound-HTTP requests measured earlier, so
the `graph.facebook.com` re-scrape ping fires **twice for every viewer who opens a video**.

**2. Explore warms six playback payloads before any tap.** One per visible card, on idle.
When they have not finished, they compete with the real request: in a cold trace
`/api/videos` was pushed to 1442 ms and this video's own playback response to 962 ms. When
they have finished, the tap costs **zero** playback requests — the warm cache serves it.
The prefetch works; there is just far too much of it.

**3. A consistent `400` from `videodelivery.net`** on a signed URL, on every play.

### A correction to the baseline above

The browser harness stamped `playback_done` on the first response whose URL contained
`/playback`. With six prefetches in flight that was usually **another video's** payload, so
the baseline's `playback` column read faster than the truth — ~500 ms where this video's own
response had not arrived until ~960 ms. The harness now matches the slug under test. The
`iframe`, `video_el`, `canplay` and `first_playing` columns were never affected, and those
are the ones the conclusions rest on.
