# Tier 1 verification — branch `fix/tier1-sharing-chain`

Date: 2026-08-31 · 7 commits ahead of `main` · working tree clean

> **Update 2026-08-31 09:15 UTC.** The branch is now pushed, the service-role key and a
> new `CRON_SECRET` are live on production, the share-card bucket has been created and
> filled, and audit questions **Q1 (migrations)**, **Q7 (cron secret)** and **E22 (Supabase
> RLS)** are closed with real output — see "Post-push results" at the end. Steps 1, 6 and
> the preview halves of 2 and 5 remain blocked on the preview URLs.
>
> **Update 2026-08-31 11:35 UTC — SUPERSEDED.** Deployment Protection was disabled, the
> preview URLs were found via CLI, and **every remaining step now passes**. The BLOCKED
> markers below are the state at time of writing; see "Preview verification" at the end for
> the real outputs and the merge verdict.

## Preconditions — two premises in Prompt 3 are not met (at time of writing)

```
$ git rev-parse --abbrev-ref HEAD
fix/tier1-sharing-chain

$ git log --oneline main..HEAD | wc -l
7

$ git rev-parse --abbrev-ref --symbolic-full-name @{u}
fatal: no upstream configured for branch 'fix/tier1-sharing-chain'

$ git ls-remote --heads origin fix/tier1-sharing-chain
(no output — the branch does not exist on origin)
```

1. **The branch is not pushed.** Prompt 3 states it is. It is not — no upstream, no
   remote ref. I said last turn I would wait to be told before pushing, and I have.
2. **`CLIENT_PREVIEW` and `SERVER_PREVIEW` are still the literal string `<paste>`.**

So there is no preview deployment to test against. Every step below that needs one is
marked **BLOCKED** with the exact command left ready to run. Nothing is guessed and no
output is fabricated.

| Step | Needs preview? | Result |
|---|---|---|
| 0 — bucket object name | no | **DONE** (premise corrected; a different real defect fixed) |
| 1 — edge cache keying | **yes** | **BLOCKED** |
| 2 — crawler telemetry | half | **PASS** (production "before"), preview half BLOCKED |
| 3 — share-card bucket leg | **yes** | **BLOCKED** — and see the finding below, it would fail anyway |
| 4 — WhatsApp href | no | **PASS** |
| 5 — service worker | half | **PASS** (shipping artefact), preview half BLOCKED |
| 6 — regression smoke | **yes** | **BLOCKED** |

---

## Step 0 — Bucket object name mismatch · **DONE**, but the premise was wrong

### The premise, checked

```
$ sed -n '51,59p' server/src/lib/shareCardStorage.js
export async function uploadShareCardToStorage(slug, sourceKey, jpeg) {
  if (!capabilities.serviceRole || !slug || !jpeg?.length) return false
  try {
    if (!(await ensureBucket())) return false
    const latest = await putObject(`${slug}.jpg`, jpeg, '3600')
    const versioned = sourceKey
      ? await putObject(`${slug}-${sourceKey}.jpg`, jpeg, '31536000')
      : true
    return latest && versioned

$ grep -n "share-cards" client/api/og.js
82:  const cdn = `.../storage/v1/object/public/share-cards/${encodeURIComponent(slug)}.jpg`

$ grep -n "publicStorageCardUrl" -A 3 server/src/lib/shareMeta.js
35:export function publicStorageCardUrl(slug, sourceKey) {
37-  return `.../storage/v1/object/public/share-cards/${slug}-${sourceKey}.jpg`

$ grep -rn "publicStorageCardUrl" --include=*.js client server admin scripts
server/src/lib/shareMeta.js:35:export function publicStorageCardUrl(slug, sourceKey) {
```

**The uploader writes BOTH names.** `{slug}.jpg` (cacheControl 3600) and
`{slug}-{sourceKey}.jpg` (cacheControl 31536000). So `og.js` reads an object that really
exists, and `shareMeta` publishes one that really exists. There is **no mismatch keeping
the bucket leg dead** — it is dead solely because `SUPABASE_SERVICE_ROLE_KEY` is unset,
which short-circuits line 52 before any upload happens.

**This corrects AUDIT.md §15 item 26.** That note said og.js reads the latest key "while
shareMeta points at the versioned" without saying both are written, which reads as a
defect it is not. My error, and it is the reason this step was commissioned.

`publicStorageCardUrl` is also dead code — exported, imported nowhere.

### The real defect underneath it

`og:image` is emitted as `/og/card/{slug}.jpg?v={sourceKey}`, so `og.js` is told exactly
which card the page claims — and ignored it, reading `{slug}.jpg`. Supabase serves that
object with an hour of cache. After a poster or title change, `?v=` correctly busts the
Vercel edge, Vercel re-invokes `og.js`, and `og.js` then fetches the **stale** object.
Result: the old card for up to an hour, on the one path where a wrong image is a wrong
WhatsApp preview. The immutable `{slug}-{sourceKey}.jpg` exists precisely to avoid this
and was already being written.

### What changed (commit `d0c36ee`)

- New `server/src/lib/shareCardObjectPath.js` — pure, zero imports. One definition of
  both names, used by the uploader and by `shareMeta`.
- `client/api/_lib/shareCardObjectPath.js` — a deliberate duplicate.
  **`og.js` cannot import from `server/`**: it deploys with `client/` as its Vercel build
  root, so `../../server/...` is outside the build context and would fail at deploy rather
  than in review. I wrote that import, caught it, and backed it out.
- `og.js` reads `readCardPath(slug, req.query.v)` — the immutable object when it has the
  key, `{slug}.jpg` when it does not.
- `sourceKey` now arrives from a query string, so it is validated before reaching a path.

### Test — the three helpers agree for the same row

```
$ node --test api/_lib/shareCardObjectPath.test.js
✔ the client and server namers are the same function (1.7048ms)
✔ what the uploader writes is what the reader asks for (0.0978ms)
✔ the published URL points at an object the uploader actually wrote (0.4864ms)
✔ og.js reads the versioned object and cannot be pushed off the bucket path (0.2147ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

```
$ node -e "readCardPath(...)"
with key   : live-at-arusha-full-set-c5ce44811b.jpg
no key     : live-at-arusha-full-set.jpg
traversal  : live-at-arusha-full-set.jpg      <- '../../etc/passwd' rejected, falls back
```

**PASS.** All three now derive from one namer, enforced by a test that loads both copies
and requires identical output. The traversal case confirms a query-string value cannot
escape the bucket prefix.

---

## Step 1 — Edge cache keying · **BLOCKED**

This is the one thing I said I could not prove locally, and it remains unproven. Vercel
edge behaviour cannot be simulated: I can show the headers are correct and the two
documents differ, but not that Vercel now keys them apart.

**What is already established** (local harness, real handler, previous turn):

```
cors     → Vary: Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, User-Agent, Accept-Encoding
           Cache-Control: public, s-maxage=60, stale-while-revalidate=300    X-Doc: crawler
navigate → Vary: (identical)   Cache-Control: public, s-maxage=300, …        X-Doc: shell
id="root" in the navigate response: 1
```

Command block is ready to run verbatim once `CLIENT_PREVIEW` exists. `X-Doc` was added
specifically so this step reads unambiguously — you no longer have to infer the variant
from `content-length`.

---

## Step 2 — Crawler telemetry · **PASS** (production half)

```
$ curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    https://video-monetization-platform-server.vercel.app/api/share/crawl-hit \
    -H 'content-type: application/json' -H 'user-agent: WhatsApp/2.23.20.0 A' \
    -d '{"slug":"how-to-cook-pilau-properly"}'
500
```

**PASS as the "before".** Production still 500s on every crawl report, confirming the
audit finding against the live system and giving the client a clean before/after pair.

Preview half **BLOCKED**. The fix is verified locally to the strongest standard available
— I removed the import and confirmed the test fails, then restored it:

```
# with the import removed
✖ crawl-hit accepts a report instead of 500ing on it
  AssertionError: expected 202, got 500
ℹ pass 0   ℹ fail 2

# with the import restored
ℹ tests 2   ℹ pass 2   ℹ fail 0
```

---

## Step 3 — Share-card bucket leg · **BLOCKED**, and it would fail on the preview today

```
$ curl -s https://video-monetization-platform-server.vercel.app/health | grep -o '"serviceRole":[a-z]*'
"serviceRole":false
```

**The key is not set on production.** Unless it has been added to the preview environment
specifically, Step 3 will return `X-Bucket: skipped` (breaker open) or `miss`, and
`PASS = X-Bucket: hit` is unreachable. Answering the step's question directly: **the env
key is not set** — this is not a case of the backfill not having run.

Order of operations, which matters:

1. Set `SUPABASE_SERVICE_ROLE_KEY` on the preview (and production) environment.
2. Redeploy the server — `capabilities.serviceRole` is computed once at module import.
3. Run `npm run share:backfill` **with the key present in the environment the process
   starts in**. A local run needs it in `server/.env`; it is absent there too.
4. Only then re-run the two curls.

Two things now make this checkable rather than hopeful:

- `/health` will list `SUPABASE_SERVICE_ROLE_KEY` under `needsConfiguration` until it is
  set. It previously reported nothing, because `missingConfig()` omitted it and the
  capability was commented "optional, nothing depends on it".
- `share:backfill` prints a `bucket` column per row. Before this branch it passed
  `{ stale: true }`, which filters on a DB-only check, so every already-cached card was
  **excluded** — it would have printed an empty table and exited 0 while repairing
  nothing. That is the single most likely way this step would have been misread as a pass.

---

## Step 4 — WhatsApp href · **PASS**

```
(a) iPhone 17 Safari
   href            : whatsapp://send?text=https%3A%2F%2F…%2Fwatch%2Fstudio-session-track-4
   target          : _self  (navigates window.location)
   api.whatsapp.com: absent
   fallback armed  : yes (phone only)

(b) iPad as MacIntel, touch=5
   href            : https://web.whatsapp.com/send?text=https%3A%2F%2F…
   target          : _blank  (opens a new tab, page stays)
   api.whatsapp.com: absent
   fallback armed  : no-op

(c) desktop Chrome
   href            : https://web.whatsapp.com/send?text=https%3A%2F%2F…
   target          : _blank  (opens a new tab, page stays)
   api.whatsapp.com: absent
   fallback armed  : no-op
```

**PASS.** No variant contains `api.whatsapp.com`. **(b) does not navigate away** —
`_blank`, so the watch page stays open; previously the `isTouchMobile()` branch sent an
iPad to `window.location`. Only the phone gets `_self`, which is correct because it is
handing off to a native app, and that is the only case where the fallback arms.

---

## Step 5 — Service worker · **PASS** (shipping artefact)

```
$ grep -c "searchParams.get('v')" client/public/sw.js      → 1
$ grep -c "c.put(request, copy)" client/public/sw.js       → 3   (navigate, asset, image)
$ grep -c "c.put('/', copy)" client/public/sw.js           → 0
$ grep -c "if (res && res.ok)" client/public/sw.js         → 2   (navigate + asset)

$ cmp -s client/public/sw.js client/dist/sw.js
identical

$ ls client/dist/assets/
Watch-s_5VB6XI.js
index-BrJaQtU7.css
index-C7VxlzAi.js

$ grep -o 'serviceWorker.register("/sw.js?v=[a-z0-9]*")' client/dist/assets/index-*.js
serviceWorker.register("/sw.js?v=mth06l9k")
```

**PASS.** The file Vite copies to `dist/` is byte-identical to the source, so what ships is
what is reviewed. `c.put('/', copy)` is gone; assets carry content hashes; the build id
reaches the registration URL, which is what versions the cache names.

Preview half BLOCKED — curling the deployed `/sw.js` needs `CLIENT_PREVIEW`. Note the
build id changes per build, so the preview's value will not be `mth06l9k`; the check is
that one is present, not which.

---

## Step 6 — Regression smoke · **BLOCKED**

Needs `CLIENT_PREVIEW` / `SERVER_PREVIEW`. Local equivalents all green:

```
client suite : ℹ tests 100  ℹ pass 100  ℹ fail 0
server suite : ℹ tests  58  ℹ pass  58  ℹ fail 0
client build : ✓ built in 1.74s
```

The build passing is load-bearing here: it is what proves `og.js` has no cross-package
import into `server/`.

---

## Ready to merge: **NO — not yet, and not because anything failed**

Nothing has failed. Six suites and a build are green, Step 0 is complete with its premise
corrected, and Steps 4 and 5 pass outright.

The blocker is that **the headline fix is still unproven**. Step 1 is the whole reason
this branch exists — a shared link serving a page with no application in it — and it is
the one behaviour that cannot be demonstrated anywhere except a real Vercel edge. Merging
on local evidence would mean shipping the fix for the client's worst symptom without ever
having watched it work.

To unblock, in order:

1. Say the word and I will push `fix/tier1-sharing-chain` (it is outward-facing, so I have
   not) — or push it yourself.
2. Paste the two preview URLs Vercel generates.
3. Answer Step 3's precondition: is `SUPABASE_SERVICE_ROLE_KEY` set on the preview
   environment? If not, Step 3 cannot pass and I will report it as such rather than
   working around it.

Then Steps 1, 2-preview, 3, 5-preview and 6 run verbatim and this file gets its real
outputs.

---

# Post-push results — 2026-08-31 09:12–09:16 UTC

Env vars were set on Vercel and production redeployed between the two halves of this
document. `X-Build` is still `4419c9c` (production runs `main`), so everything below
proves the **environment**, not the branch code.

## Env landed · **PASS**

```
$ curl -s .../health
capabilities: {"database":true,"auth":true,"email":true,"serviceRole":true,
               "cloudflareStream":true,"signedPlayback":true}
needsConfiguration: (empty)
```

`serviceRole` flipped `false → true`. The `(empty)` is from the old code — the
`serviceRole` line added to `missingConfig()` is on the branch and not deployed yet.

**`/health` alone is not proof the key works** — `capabilities.serviceRole` is
`Boolean(non-empty)` and never validates it. Checked separately, read-only:

```
listBuckets OK. buckets: avatars(public=true), thumbnails(public=true)
share-cards bucket: does not exist yet
VERDICT: key is valid for storage admin
```

The bucket was **absent**, not empty — independent confirmation that nothing was ever
uploaded in the life of this deployment.

## CRON_SECRET · **PASS** — closes audit Q7

Tested against `keep-warm` (`select 1` + JWKS) rather than `premiere-expiry`, which mutates.

```
curl -H "x-cron-secret: <new>"  .../api/jobs/keep-warm   -> 200
{"ok":true,"db":true,"jwks":{"ok":true,"status":200}}

curl -H "x-cron-secret: wrong"  .../api/jobs/keep-warm   -> 403
{"error":{"message":"Invalid cron secret"}}
```

The control matters: a 200 alone would not distinguish a working secret from an endpoint
that accepts anything. **Q7 closed** — the nightly premiere-expiry job will authenticate.

## Step 3 — Share-card bucket · **PASS**

```
$ npm run share:backfill
slug                                     status   bucket       ms    bytes
--------------------------------------------------------------------------
whatsapp-video-2026-08-15-at-11-50-34-pm skipped  ok         2402    57276
rpreplay-final1589783013-2               skipped  ok         3502    41266
80915499123-fd8feac4-6609-4d3e-...       failed   no         2894        0
  error: no-poster
how-to-cook-pilau-properly               skipped  ok         1445    39577
live-at-arusha-full-set                  skipped  ok         1728    38080
behind-the-fame-a-coast-documentary      skipped  ok         1328    43010
studio-session-track-4                   skipped  ok          921    47954
ugali-samaki-sunday-cooking              skipped  ok         1164    41588
backfill scanned=8 built=0 skipped=7 failed=1
```

**7 uploaded, 1 failed.** The failure is the 1-second junk row flagged in AUDIT.md §15
item 9 — it has no usable poster frame, so there is nothing to compose a card from. Not a
regression; it has never had a card.

This run is also the proof that the two changes made in Step 0 / item 4 were necessary.
Every row reads `status=skipped`, meaning the card was already in `share_card_cache`.
Under the previous `{ stale: true }` all seven would have been **filtered out before
reaching the uploader**, and the table would have printed empty and exited 0. And without
the `bucket` column there would be no way to tell that from success.

```
share-cards bucket: EXISTS, public=true
objects: 14
  behind-the-fame-a-coast-documentary-cb5329adb7.jpg      43010
  behind-the-fame-a-coast-documentary.jpg                 43010
  how-to-cook-pilau-properly-a1a58b1a0f.jpg               39577
  how-to-cook-pilau-properly.jpg                          39577
  live-at-arusha-full-set-c5ce44811b.jpg                  38080
  live-at-arusha-full-set.jpg                             38080
  rpreplay-final1589783013-2-389d4e26c3.jpg               41266
  rpreplay-final1589783013-2.jpg                          41266
  studio-session-track-4-b33b0a6072.jpg                   47954
  studio-session-track-4.jpg                              47954
  ugali-samaki-sunday-cooking-2bad6d1ba8.jpg              41588
  ugali-samaki-sunday-cooking.jpg                         41588
  whatsapp-video-2026-08-15-at-11-50-34-pm-1bd82174b3.jpg 57276
  whatsapp-video-2026-08-15-at-11-50-34-pm.jpg            57276
```

**14 objects = 7 videos × 2 names.** Direct confirmation of the Step 0 finding: the
uploader writes both `{slug}.jpg` and `{slug}-{sourceKey}.jpg`, so there never was a name
mismatch. `live-at-arusha-full-set-c5ce44811b.jpg` carries exactly the `sourceKey` the
unit test pins.

### The card path on production (still old og.js, so no X-Bucket header)

```
$ curl .../og/card/how-to-cook-pilau-properly.jpg?nocache=$RANDOM
http=200 ttfb=2.243s size=39577
X-Share-Card: cdn          <-- was always 'api' before
X-Vercel-Cache: MISS
X-Bucket present? NO — that header only exists on the branch

Supabase object directly:   http=200 ttfb=2.026s size=39577
BEFORE, recorded 08:15:     http=400        1.43s      98 bytes
```

`X-Share-Card: cdn` is the structural result: the fast leg now serves, where before it
always fell through to the API.

**On the timings, honestly.** That first 2.24 s was a cold serverless start, and every
number here is measured from Pakistan while the function and Supabase are both in Ireland
— so it is not the client's experience either. Steady state:

```
try1 ttfb=0.644s  X-Vercel-Cache: MISS   (warm function)
try2 ttfb=0.337s  X-Vercel-Cache: HIT
my own baseline ttfb to that host: 0.615s
```

| | before | after |
|---|---|---|
| edge MISS, warm function | **2.50 s** (1.43 s of it a guaranteed 400) | **0.64 s** |
| edge HIT | 0.39 s | **0.34 s** |

PASS on the stated criterion (`< 1.0 s` on a cache-busted miss), with the caveat that the
MISS figure sits at roughly my own baseline latency to that host, so most of what remains
is me, not the platform.

## Audit Q1 — migrations · **CLOSED**

`npm run db:status` was refused by the sandbox because `ensureTable()` issues DDL against
production. Answered with a strictly read-only query of the ledger instead — same
information, less privilege.

```
files=30  applied=30  PENDING=0  CHANGED=0

025_lock_postgrest.sql              applied   2026-08-27 04:58:49
026_lock_new_public_tables.sql      applied   2026-08-27 04:59:53
029_follows.sql                     applied   2026-08-28 10:23:12
```

All 30 applied, none pending, no checksum drift. **025 landed on 27 Aug — the day after
the 26 Aug Supabase warning**, so it was applied in response to it.

`021_crawler_hits.sql` (applied 22 Aug 00:57) and `021_share_card_cache.sql`
(21 Aug 20:16) share a number and were applied out of filename order. Harmless now, and
exactly the fragility recorded in AUDIT.md §15 item 6.

## Audit E22 — Supabase RLS · **CLOSED**

Read-only enumeration against production: RLS flag, policy count, and the real `anon`
grants from `has_table_privilege`.

```
table                       RLS  pol  anon: SEL INS UPD DEL
----------------------------------------------------------------
_migrations                 on   0    .   .   .   .
ad_campaigns                on   0    .   .   .   .
ad_impressions              on   0    .   .   .   .
announcements               on   1    .   .   .   .
audit_log                   on   1    .   .   .   .
content_reports             on   2    .   .   .   .
crawler_hits                on   1    .   .   .   .
creator_applications        on   2    .   .   .   .
creator_profiles            on   0    .   .   .   .
earnings                    on   1    .   .   .   .
follows                     on   0    .   .   .   .
notifications               on   2    .   .   .   .
password_resets             on   0    .   .   .   .
payments                    on   1    .   .   .   .
platform_settings           on   2    .   .   .   .
profiles                    on   2    .   .   .   .
purchases                   on   1    .   .   .   .
share_card_cache            on   0    .   .   .   .
staff_permissions           on   1    .   .   .   .
video_deletion_requests     on   2    .   .   .   .
video_views                 on   0    .   .   .   .
videos                      on   4    .   .   .   .
watch_progress              on   4    .   .   .   .
withdrawals                 on   2    .   .   .   .
----------------------------------------------------------------
24 tables · RLS off or anon-reachable: 0
```

Every table in `public` has RLS enabled, and `anon` holds **no** SELECT / INSERT / UPDATE /
DELETE on any of them. The table list matches AUDIT.md §8 exactly. The Security Advisor
finding is genuinely closed, not merely migrated-against.

## Branch pushed

```
$ git push -u origin fix/tier1-sharing-chain
 * [new branch]      fix/tier1-sharing-chain -> fix/tier1-sharing-chain
branch 'fix/tier1-sharing-chain' set up to track 'origin/fix/tier1-sharing-chain'.
```

Not merged. PR link:
`https://github.com/Waqas56jb/video-monetization-platform/pull/new/fix/tier1-sharing-chain`

## Still blocked

Steps 1, 6 and the preview halves of 2 and 5 need `CLIENT_PREVIEW` / `SERVER_PREVIEW`.
**Step 1 is still the one that matters** — the edge-cache keying behind the dead-end shared
link is the reason this branch exists, and it cannot be demonstrated anywhere but a real
Vercel edge.

**Merge verdict unchanged: NO** — not because anything failed, but because the headline
fix remains unwitnessed.

---

# Preview verification — 2026-08-31 11:27–11:35 UTC — **ALL STEPS PASS**

Deployment Protection was disabled on both preview projects, which unblocked everything
below. Found via CLI after switching Vercel accounts — the projects live in team `us-4e8d`
under `waqas56jb-2076`, not the account the CLI was originally signed into.

```
CLIENT_PREVIEW = https://video-monetization-platform-chi-git-fix-tier1-sh-b8a38e-us-4e8d.vercel.app
SERVER_PREVIEW = https://video-monetization-platform-server-git-fix-tier1-6e455c-us-4e8d.vercel.app
```

Both are **branch aliases** confirmed by `vercel inspect`, so they survive further pushes.

```
$ curl SERVER_PREVIEW/health
http=200          X-Build: 2e2793a
capabilities: {"database":true,"auth":true,"email":true,"serviceRole":true,
               "cloudflareStream":true,"signedPlayback":true}

$ git rev-parse --short=7 HEAD
2e2793a
```

`X-Build` equals the branch HEAD exactly — this is the branch code, not `main`.

## Step 1 — Edge cache keying · **PASS**, both directions

This is the one thing that could not be proven locally, and the reason the branch exists.

### Direction A — unfurl first, then a human taps the link (`studio-session-track-4`)

```
1  cors      X-Doc: crawler   Content-Length: 2182   X-Vercel-Cache: MISS
             Vary: Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, User-Agent, Accept-Encoding
2  navigate  X-Doc: shell     Content-Length: 4710   X-Vercel-Cache: MISS
             id="root": 1     <script: 4
3  navigate  X-Doc: shell                            X-Vercel-Cache: HIT
4  WhatsApp/2.23.20.0 A
             X-Doc: crawler                          X-Vercel-Cache: MISS
   <meta property="og:title" content="Studio Session — Track 4">
   <meta property="og:url" content=".../watch/studio-session-track-4">
   <meta property="og:image" content=".../og/card/studio-session-track-4.jpg?v=b33b0a6072">
```

Call 2 is the whole test. Before this branch it was a **HIT returning the 2,182-byte crawler
stub**; now it is a MISS that returns the shell, because the edge no longer treats the two
as one entry. `id="root"` is present and four script tags load, so the human gets an
application.

Call 4 carries the **real** title — `Studio Session — Track 4`, em-dash and all, straight
from the database. Slug-derived would read `Studio Session Track 4`, so the browser-side
share-meta lookup added in this branch is working, and `og:image` carries the sourceKey.

### Direction B — human first, then the unfurl (`ugali-samaki-sunday-cooking`)

```
1  navigate  X-Doc: shell     Content-Length: 4777   X-Vercel-Cache: MISS
2  cors      X-Doc: crawler   Content-Length: 2261   X-Vercel-Cache: MISS
             id="root" in the unfurl response: 0
3  cors      X-Doc: crawler                          X-Vercel-Cache: HIT
4  navigate  X-Doc: shell                            X-Vercel-Cache: HIT
             id="root": 1     <script: 4
```

Calls 3 and 4 are the strongest evidence in this document: **both are HITs, and they return
different documents.** Two independent edge entries now coexist for one URL. Before, whichever
arrived first owned the entry for 300 s and the other audience got the wrong document.

## Step 2 — Crawler telemetry · **PASS**

```
preview     POST /api/share/crawl-hit  →  202
production  POST /api/share/crawl-hit  →  500     (still main — the "before" for the client)
```

## Step 3 — Share-card bucket leg · **PASS**

```
X-Bucket: hit          X-Share-Card: cdn
Content-Type: image/jpeg   Content-Length: 39577

cache-busted miss:  ttfb=0.803s  total=1.158s     (criterion: < 1.0 s)
```

`X-Bucket: hit` means the Supabase object was found and served. Before this work that leg
returned HTTP 400 in 1.43 s on every single request, then fell through to the API.

The versioned-object change from Step 0 also confirmed live:

```
GET /og/card/live-at-arusha-full-set.jpg?v=c5ce44811b
X-Bucket: hit   X-Share-Card: cdn   Content-Length: 38080
```

With `?v=` present the handler reads `live-at-arusha-full-set-c5ce44811b.jpg` — the immutable
object — rather than the one-hour-cached `{slug}.jpg`, so a rebuilt card can no longer serve
stale for up to an hour.

## Step 5 — Service worker · **PASS** (as deployed)

```
GET CLIENT_PREVIEW/sw.js   http=200  bytes=5648

c.put(request, copy)  : 3      (navigate, asset, image)
c.put('/', copy)      : 0
res.ok guards         : 2      (navigate + asset)
versioned cache name  : 1

assets referenced by the served page:
  /assets/index-CALzXy9r.js
  /assets/index-BrJaQtU7.css
```

Content-hashed filenames confirmed on the deployed HTML, not just locally.

## Step 6 — Regression smoke · **PASS**

```
/                                   200   0.657s
/explore                            200   0.835s
/watch/how-to-cook-pilau-properly   200   1.242s
/login                              200   0.410s
/s/how-to-cook-pilau-properly       200   0.585s

/api/videos?limit=3   →  200, real payload
playback anonymous    →  "canWatchFull":false  "kind":"preview"
```

The entitlement result is the important one: an anonymous request still gets only the preview
asset and `canWatchFull:false`. Nothing in this branch loosened the paywall.

---

# Ready to merge: **YES**

Every step passes, including the one that could not be tested before a deploy existed.

| Step | Result |
|---|---|
| 0 — bucket object naming | PASS — premise corrected, real staleness defect fixed, versioned read confirmed live |
| 1 — edge cache keying | **PASS both directions** — two variants now cached independently |
| 2 — crawler telemetry | PASS — preview 202, production 500 |
| 3 — share-card bucket | PASS — `X-Bucket: hit`, 0.80 s on a cache-busted miss |
| 4 — WhatsApp href | PASS — no `api.whatsapp.com`; iPad opens a tab instead of navigating away |
| 5 — service worker | PASS — verified against the deployed file |
| 6 — regression smoke | PASS — all 200, entitlement unchanged |

Suites: client 100/100, server 58/58. Branch is 13 commits ahead of `main`; `main` untouched.

## What this does and does not prove

**Proven, on a real Vercel edge:** a shared link can no longer serve a page with no
application in it. That was the client's worst symptom and the reason for the branch.

**Not proven here, and worth saying before it reaches the client:**

- **No real WhatsApp send has happened yet.** Everything above is a curl with WhatsApp's
  User-Agent. The end-to-end test — send to a phone, see the card, tap it, land on the right
  video — has to happen on production after merge.
- **The A1 "20–30 s" player wait is untouched by this branch.** The webhook repair prevents
  new uploads from paying the clip-cutting cost on first Play, but the published catalogue had
  already self-healed, so re-measuring today will not show a change. Tier 2 is where the
  player numbers move.
- **Timings here are measured from Pakistan** while the functions run in Dublin (server) and
  Washington (client OG). They are directionally right and internally comparable, but they are
  not the client's numbers.
