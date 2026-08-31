# Backend move — Vercel → Railway

Branch `fix/backend-railway`, off `main` (`777137d`). **Not pushed.** 2026-08-31.

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

**One thing to know: `X-Build: dev`.** The header is built from `VERCEL_GIT_COMMIT_SHA`,
which Railway does not set, so it no longer identifies the deployed commit. That header was
how the last two tiers proved which build was answering. Railway exposes
`RAILWAY_GIT_COMMIT_SHA`; wiring it in is a small change and is **not** in this branch,
because it would change `app.js` while the deployed code is still `main` and I would not be
able to verify it until after your redeploy. Worth doing next.

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

## Step 8 — Verification, pending your redeploy

Not run. These need the Railway env set, the Railway service redeployed from this branch,
and both Vercel frontends rebuilt so `VITE_API_URL` is baked in fresh. Ready to run verbatim
on your word:

1. client production `/watch/:slug` → the shell's injected API origin is Railway
2. anonymous `/api/playback/live-at-arusha-full-set/playback` on Railway → `kind:preview`,
   `canWatchFull:false`
3. `POST /api/share/crawl-hit` on Railway → 2xx
4. `/og/card/how-to-cook-pilau-properly.jpg` → `X-Bucket: hit`, and the fallback leg must
   reach Railway rather than Vercel
5. `OPTIONS` from `https://video-monetization-platform-chi.vercel.app` → allowed
6. plus `/health` `proxy.hops` vs `trustProxyHops`, and `scheduler.inProcess: true`

## Ordering, and one thing to decide

**Deploy order is safe either way** — the branch works against a Railway env that is already
set, and the frontends will keep working until rebuilt because the old host redirects. But
the retired Vercel *server* deployment must stay up until the frontends are rebuilt, or a
cached bundle pointing at it has nothing to redirect *from*.

**To decide:** the Railway region. If it is not in Europe, moving it is worth more than the
whole of Tier 2, and it changes what the Tier 2 numbers will look like — so it is better
done before that branch is measured again.
