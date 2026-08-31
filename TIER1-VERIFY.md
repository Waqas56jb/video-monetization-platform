# Tier 1 verification — branch `fix/tier1-sharing-chain`

Date: 2026-08-31 · 7 commits ahead of `main` · working tree clean

## Preconditions — two premises in Prompt 3 are not met

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
