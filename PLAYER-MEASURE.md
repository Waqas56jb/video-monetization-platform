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

---

*Browser-side baseline, per-item changes and after-numbers follow below as they are produced.*
