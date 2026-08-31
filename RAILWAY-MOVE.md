# Backend move — Vercel → Railway

Branch `fix/backend-railway`, merged to `main` as `2cfe935` and deployed. 2026-08-31.

```
New API origin   https://video-monetization-platform-production.up.railway.app
Frontends        unchanged — both still Vercel projects
```

---

## The finding that matters most

**The API and the database are no longer in the same place, and it is measurable.**

Latency against query count, 5 samples each, median:

| route | queries | Railway | Vercel (old host) |
|---|---|---|---|
| `/` | 0 | 0.720 | 0.563 |
| `/health` | 1 | 0.950 | 0.497 |
| `/api/playback/:slug/playback` | 3 | 0.896 | — |
| `/api/videos/:slug` | 6 | **1.025** | **0.530** |

Cost per database round trip, taken from the 0-query and 6-query ends:

```
Railway   (1.025 - 0.720) / 6  ≈  51 ms per query
Vercel    (0.530 - 0.563) / 6  ≈   0 ms per query  (indistinguishable from noise)
```

Vercel ran in `dub1` (Dublin), beside Supabase in `aws-1-eu-west-1` (Ireland) — the
`regions: ["dub1"]` line in `server/vercel.json` was there for exactly this. Railway is
somewhere else, and each query now crosses that distance.

**Correcting myself:** my first measurement of this was `/health` minus `/` on a single
pass, which gave ~156 ms and an inference that the container was in Singapore (the edge
header says `x-railway-edge: sin1`). Corroborating against query count did not support it —
the 3-query route measured *faster* than the 1-query route, so that gap was noise, not
signal. 51 ms is the figure the scaling supports; the container is not beside Ireland, but
it is not necessarily a full continent away either. **The Railway dashboard will say
outright, and that is one click for you and unavailable to me from outside.**

Two consequences:

- **Tier 2 is now worth roughly six times what it was.** Cutting `GET /api/videos/:slug`
  from six queries to one saves ~250 ms here against ~40 ms on Vercel. Those items are on
  `fix/tier2-player-speed` and unmerged.
- **Setting the Railway region to Europe would beat every code change in Tier 2 combined**,
  and it is a setting rather than a change. Worth doing before re-measuring anything.

Separately, and independent of the database: Railway's zero-query baseline is ~160 ms
slower than Vercel's *from Pakistan*. That is edge routing, and it is my location, not
necessarily the client's in Tanzania.

---

## Step 1 — Railway verified before any change

```
GET /health   →  200
Server: railway-hikari      x-railway-edge: sin1      x-build: dev

service        : mtonyo-api | env: production
database       : connected
capabilities   : {"database":true,"auth":true,"email":true,"serviceRole":true,
                  "cloudflareStream":true,"signedPlayback":true}
urls.publicApp : https://video-monetization-platform-chi.vercel.app
urls.adminApp  : https://video-monetization-platform-admin.vercel.app
allowedOrigins : ["…-chi.vercel.app","…-admin.vercel.app"]
needsConfiguration : (empty)

TTFB ×5 : 0.944  0.846  0.888  0.844  0.965
```

All six capabilities true, `needsConfiguration` empty — **nothing is missing from the
Railway environment.** `allowedOrigins` correctly still names the two Vercel frontends.

**`X-Build: dev` — since fixed, in the fourth commit on this branch.** The header was built from
`VERCEL_GIT_COMMIT_SHA` alone, which Railway does not set, so it stopped identifying the
deployed commit the moment the API moved. That header is how the last two tiers proved which
build was answering, and it is what Step 8 below uses to confirm the redeploy is live, so
`dev` would have made this move's own verification unfalsifiable.

It now reads `RAILWAY_GIT_COMMIT_SHA` first, then `VERCEL_GIT_COMMIT_SHA`, then `dev`.
Railway wins because Railway runs the API; Vercel is still read so a rollback there is not
blind; `dev` stays as the honest local answer rather than an invented commit.

`client/api/watch.js` keeps its Vercel-only read — that function still runs on Vercel, so
that is the correct variable there, not an oversight.

Four tests boot the app and read the header off a real response. That matters more than it
sounds: a source-text test would have passed happily through this entire move, because the
string `VERCEL_GIT_COMMIT_SHA` was still sitting in the file and looking right. Checked
against the old `app.js`, the two Railway cases fail (`dev` and `9999999` against the
expected `ab12cd3`), so the tests are not passing vacuously.

The Step 1 reading above is left as it was measured — `x-build: dev` is what that deployment
actually returned.

---

## Step 2 — Every reference repointed

Before: **24 files**, 33 hits. After: **zero in live code.**

Changed (22 replacements): `client/.env`, `client/.env.example`, `admin/.env`,
`admin/.env.example`, `client/index.html` (dns-prefetch + preconnect),
`client/src/lib/warmShare.js`, `client/src/App.perf.test.js`,
`server/src/config/env.js` (`DEPLOY_URLS.api`), `server/.env`, `server/.env.example`
(`SERVER_PUBLIC_URL`), `scripts/verify-share-previews.sh`, four `server/scripts/*`,
`server/src/cli/smoke.js`, `README.md`.

Rewritten by hand, because the logic changed rather than the string:

- **`client/api/_lib/apiOrigin.js`** — now rewrites **both** retired hosts onto Railway.
- **`client/src/lib/deployUrls.js`, `admin/src/lib/deployUrls.js`** — `legacyApi` (one host)
  became `legacyApis` (both).
- **`client/src/lib/api.js`, `admin/src/lib/api.js`** — `resolveApiBase` maps any entry in
  that list onto the live origin.

The rewrite is kept, and widened, deliberately. `VITE_API_URL` is baked into a build and
builds outlive deployments: a bundle already in a viewer's cache, a Vercel project env still
holding an old value, a stale preview. Anything naming a host we no longer run is redirected
rather than left to fail as an opaque network error — which is indistinguishable, to a
viewer, from the product being down.

```
apiOrigin() with:
  (unset)            -> …up.railway.app
  old server host    -> …up.railway.app
  old backend host   -> …up.railway.app
  railway            -> …up.railway.app
  trailing slash     -> …up.railway.app   (normalised)
```

**Remaining hits, all intentional:**

| where | why |
|---|---|
| `AUDIT.md`, `TIER1-VERIFY.md` | historical records; **dated note added at the top of each** |
| `deployUrls.js` `legacyApis` | the rewrite list itself |
| `apiOrigin.js` `RETIRED` | same |
| `reconcile-stream.mjs` comment | describes the webhook that pointed at a dead host — history, not config |

The audit documents keep their old hostnames on purpose: they are records of what was
measured against that deployment, and rewriting the hosts would make the measurements
unreproducible and the reasoning harder to follow.

**Self-referencing URLs** all come from env rather than a literal: the webhook target is a
CLI argument checked against `SERVER_PUBLIC_URL`, the share payload uses `env.publicWebUrl`
(a frontend, unchanged), and `client/api/_lib/report.js` posts to whatever `apiOrigin()`
returns.

---

## Step 3 — Crons

`server/vercel.json` declared two, and **Vercel Cron is a property of a Vercel deployment**,
so the move stopped both. Silently, which is the problem — neither failure is visible from
outside for days.

| job | schedule | what breaks if it stops |
|---|---|---|
| `/api/jobs/premiere-expiry` | `0 2 * * *` | A Paid Premiere whose window closed keeps showing a price and keeps selling. **Not total** — `expireIfDue` converts a title the moment anyone opens it, so this strands only the ones nobody opens, which is exactly the long tail. |
| `/api/internal/share-cards/rebuild?stale=true` | `15 3 * * *` | A changed poster or title serves the old card until a viewer opens the video and the read-path self-heal notices. |

Nothing else was scheduled. `/api/jobs/keep-warm` exists but was never in the cron list, and
is now meaningless on a persistent host.

### Chosen: (a) in-process scheduler — `server/src/jobs/scheduler.js`

**Why, and not the Railway Cron service.** Railway runs one persistent process, which is the
model in-process scheduling was always for and the thing Vercel could not offer — a function
has nobody to hold a timer. A cron service would cost a second deploy target and a shared
secret travelling over the network to reach code already running in this process, and it
would put the schedule in a dashboard. **The Vercel crons were exactly that, and that is
part of why nobody noticed them stopping.** The repository should state its own schedule.

The HTTP endpoints and the `CRON_SECRET` guard are kept, so an external scheduler stays
available if the deployment ever needs one.

Safety: runs only when `RAILWAY_ENVIRONMENT` is set, so a laptop or CI run never fires
production work; `DISABLE_CRON=1` is an off switch needing no redeploy; overlapping runs are
refused rather than queued. Both jobs are idempotent by design — `runPremiereExpiry` says so
in its own header — so even two instances would duplicate work rather than corrupt anything.

```
5 tests: off without RAILWAY_ENVIRONMENT · off with DISABLE_CRON=1 · both jobs scheduled
         on Railway · schedules match the Vercel ones · HTTP endpoints survive
```

Confirmed on a local boot: `scheduler off (not a Railway environment) — jobs still reachable
at /api/jobs/*`.

**Incidental:** the share-card cron targeted `?stale=true` and Vercel Cron issues `GET`.
`internal.routes.js` registers both `GET` and `POST`, so it would have worked — checked
rather than assumed, because a `POST`-only route would have meant that cron never ran at all.

---

## Step 4 — Cloudflare webhook repointed

```
before  notification_url: https://…-server.vercel.app/api/playback/webhooks/cloudflare
        modified        : 2026-08-31T09:34:09Z

after   notification_url: https://…up.railway.app/api/playback/webhooks/cloudflare
```

**The secret did not rotate.** Same value as before, so **no Railway env change is needed**:

```
CLOUDFLARE_WEBHOOK_SECRET=b2000ce1e3d9f8e36d71ffb0223bd929ea68a82c
```

Three-way test against Railway:

```
UNSIGNED           403  {"error":{"message":"Invalid webhook signature"}}
CORRECTLY SIGNED   200  {"ok":true,"ignored":"unknown video"}
WRONG SIGNATURE    403  {"error":{"message":"Invalid webhook signature"}}

VERDICT: PASS — signed only
```

All three matter. Unsigned→403 proves the secret is set on Railway. Signed→200 proves it is
the *same* secret. Wrong→403 proves it verifies rather than merely checking the header exists.

---

## Step 5 — Server runtime

**`start` and `listen`: already correct.** `package.json` has `"start": "node src/index.js"`,
and `index.js` calls `app.listen(env.port)` where `env.port` is `process.env.PORT`. The
serverless entry (`api/index.js`) exports the app without listening; had Railway been pointed
at that, it would deploy cleanly and serve nothing. A test now pins the three facts together.

Booted locally to prove it rather than reading it:

```
MTONYO+ API listening on http://localhost:8123  (production)
postgres pool: max=3 (serverless sizing)
database connected · split 60/40
scheduler off (not a Railway environment)
GET /health 200
```

**`pg.Pool max: 3` → 12 on a persistent host.** On Vercel that 3 was right and generous:
many isolates, each with its own pool, all multiplexed by the transaction pooler. On Railway
it is the ceiling for the *entire API* — and the watch page issues three requests in
parallel, so two simultaneous viewers already exhaust it and everything after queues on
connection acquisition. Nothing errors; requests just mysteriously take turns.
`PG_POOL_MAX` overrides. `allowExitOnIdle` follows the same switch, since it exists to stop
an idle pool holding a serverless invocation open and means nothing on a server.

**`trust proxy` stays 1, but is now settable.** One hop is right for both Vercel's edge and
Railway's, which each append one `X-Forwarded-For` entry. It matters because the rate limiter
is keyed on client IP: trust too few hops and `req.ip` is the proxy's address, so **every
viewer shares one 120-per-minute bucket** and the site rate-limits itself under load; trust
too many and a client can forge the header. `/health` now reports the observed chain length
beside the trusted one, so this is checkable after a move rather than assumed —
`{"ip":"…","hops":0,"trustProxyHops":1,"host":"other"}` locally, and step 8 checks it on
Railway.

**`server/vercel.json` deleted.** Nothing else read it — the only other mentions are two
comments and a test. Leaving a file whose crons no longer run is worse than removing it, and
it is recoverable with `git show main:server/vercel.json`. The Dublin-region test went with
it: region is a dashboard setting on Railway, so it is measured above rather than asserted
against a file the host ignores.

> **Action for you:** if the retired Vercel *server* project still auto-deploys from this
> repo, disconnect it. With `vercel.json` gone its builds will change behaviour, and a
> failing build on every push is noise you do not want. The frontend projects are unaffected.

---

## Step 6 — Region

```
Railway edge      x-railway-edge: sin1        (Singapore)
Railway container unknown from outside — read it from the dashboard
Supabase          aws-1-eu-west-1.pooler.supabase.com:6543   (Ireland)
Old Vercel host   regions: ["dub1"]           (Dublin, beside Supabase)
```

They differ. How far is not determinable from here — see the correction at the top — but the
~51 ms per query says they are not co-located, where Vercel's Dublin region was. **This is
the single highest-value thing on the list and it is a setting, not a code change.**

---

## Step 7 — AUDIT.md §12 updated

A dated block now heads Tier 2:

- **Obsolete:** cold start and keep-warm (item 10). Railway holds one process; there is no
  per-request cold start to pay and no plan upgrade to consider.
- **Survives, lower value:** item 5, Sharp off the cold path — now about boot and restart
  time, and about not loading a native image library into a process that serves payments.
- **Now the main event:** items 6–9, the serial queries and `id::text` scans, because a
  round trip costs ~51 ms here against ~0 ms before.
- **Unchanged:** `includeFiles` for `client/api/watch` — that function is on the *frontend*
  Vercel project, which did not move.
- **New and outranking all of them:** co-locate the Railway service with `eu-west-1`.

---

## Suites

```
server   63 passing   (was 58 — 5 new scheduler tests)
client  100 passing
```

---

## Step 8 — Verification, run live

All against the deployed merge commit, 2026-08-31 ~12:51–12:58 UTC.

**`X-Build: 2cfe935` on Railway** — the merge commit. This goes first because
everything below is meaningless without it, and it is only readable at all because
the header was fixed earlier on this branch; before that it said `dev` and this
check could not have been made.

### Passing

| # | check | result |
|---|---|---|
| 1 | Railway `/health` | `200`, `database: connected`, all six capabilities `true`, no `needsConfiguration` |
| 2 | scheduler | `scheduler.inProcess: true` — the nightly jobs are running again |
| 3 | frontends rebuilt | both bundles inline `…up.railway.app` as `VITE_API_URL`; **zero** occurrences of `localhost:4000` |
| 4 | frontend build | `X-Build: 2cfe935` on the watch shell — both Vercel projects are on the merge commit |
| 5 | entitlement, anonymous, `ppv_forever` | `canWatchFull: false`, `owned: false`, `requiresPayment: true`, `playback.kind: preview`, `stopsAtSeconds: 217` of 653 |
| 6 | `POST /api/share/crawl-hit` | `202` (was a 500 before Tier 1) |
| 7 | `/og/card/…jpg` | `200`, `X-Bucket: hit`, 39,577 bytes `image/jpeg` |
| 8 | CORS, real frontend | `204` + `access-control-allow-origin` for the client origin |
| 9 | CORS, rogue origin | explicit `ORIGIN_NOT_ALLOWED` JSON, not an opaque failure |

**The Tier 1 cache fix holds under real edge caching** — which is the test that
matters, because the original bug only fired on a HIT:

```
round 1   crawler: X-Doc: crawler  MISS      browser: X-Doc: shell  MISS
round 2   crawler: X-Doc: crawler  HIT       browser: X-Doc: shell  HIT
round 3   crawler: X-Doc: crawler  HIT       browser: X-Doc: shell  HIT
Vary: Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, User-Agent, Accept-Encoding
```

Two documents at one URL, both cached, neither ever served to the other.

### Three things that need you

**1 · The rate limiter is not counting per viewer. `TRUST_PROXY_HOPS=2` on Railway.**

```
/health proxy : {"ip":"152.233.15.120","hops":2,"trustProxyHops":1,"host":"railway"}
my actual IP  : 103.104.87.140
```

`req.ip` is not the caller — it is a Railway internal address, and it moves
between `.120` and `.121` across requests. Every viewer therefore shares a
handful of 120-requests-per-minute buckets instead of holding one each, so the
site can rate-limit its own users under load. Watching `ratelimit` bounce
`116 → 117 → 116` across three of my own sequential calls is the same fact from
the other side: those calls were not landing in one bucket, and other traffic was
spending it.

Setting 2 is safe here, and that was checked rather than assumed — Railway
**replaces** `X-Forwarded-For` rather than appending to it:

```
sent XFF: (none)                      -> hops 2
sent XFF: 1.2.3.4                     -> hops 2
sent XFF: 1.2.3.4, 5.6.7.8            -> hops 2
sent XFF: 1.2.3.4, 5.6.7.8, 9.10.11.12 -> hops 2
```

Nothing a client sends survives, so trusting the second hop cannot be forged into
someone else's bucket. The old Vercel host confirms the other half: it reports
`{"ip":"103.104.87.129","hops":1,"trustProxyHops":1}` — my real address. One hop
was right there, two is right here, which is exactly why the value is settable
rather than hard-coded. **No code change: a Railway variable.**

**2 · The region is still not in Europe.** `x-railway-edge: sin1` unchanged, and
the cost per query is unchanged with it:

| route | queries | median (s) |
|---|---|---|
| `/` | 0 | 0.588 |
| `/health` | 1 | 0.711 |
| `/api/playback/:slug/playback` | 3 | 0.700 |
| `/api/videos/:slug` | 6 | **0.832** |

`(0.832 − 0.588) / 6 ≈ **41 ms per query**`, against ~0 ms when the API sat in
`dub1` beside Supabase. Slightly better than the 51 ms measured before the
redeploy, and the same story. The 1-query and 3-query rows still fail to separate,
which is the same noise noted earlier — the 0-vs-6 span is the load-bearing
figure, not the middle.

**3 · The retired Vercel backend is still live, and still deploying from `main`.**

```
…-server.vercel.app/health                 -> 200   X-Build: 2cfe935
…-server.vercel.app/api/videos             -> 200
…-server.vercel.app/api/playback/…/playback -> 200
…-backend.vercel.app/health                -> 404   (genuinely gone)
```

It built the merge commit within minutes of the push, so that project is still
connected to this repository. It is a second production API, fully functional,
on the same database. It is **not** running the nightly jobs
(`scheduler.inProcess: false`, since `RAILWAY_ENVIRONMENT` is unset there), so
there is no duplicate-cron problem — but it is a live second copy nobody is
watching, and it will keep deploying on every push.

Deleting or disconnecting it is safe **now** rather than earlier, and the order
matters: both frontends are confirmed rebuilt onto Railway, so nothing points at
it any more. The `legacyApis` rewrite still names it, which is deliberate — that
list exists for bundles already sitting in someone's browser cache, and it costs
nothing to keep after the host is gone.

---
## What is left

Everything in this document is deployed and verified. Three things remain, all of
them settings rather than code:

1. **`TRUST_PROXY_HOPS=2`** on Railway — the rate limiter is currently counting
   proxies instead of viewers.
2. **Region → Europe** on Railway. Worth more than the whole of the unmerged
   Tier 2 branch, and it changes what Tier 2's numbers will look like, so it is
   better done before that branch is measured again.
3. **Delete or disconnect the retired Vercel *server* project.** Safe now: both
   frontends are confirmed rebuilt onto Railway, so nothing points at it. It was
   deliberately left up until they were.

Tier 2 (`fix/tier2-player-speed`) is still unmerged and migration
`030_video_card_ready.sql` is still unrun. Its baseline should be taken again on
Railway — the old numbers were measured against a co-located database and no
longer describe this deployment.
