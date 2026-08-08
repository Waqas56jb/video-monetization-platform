# MTONYO+ — Backend

Node.js API for the MTONYO+ video monetization platform.

- **Supabase (Postgres)** — the permanent system of record: accounts, videos, prices, premiere windows, purchases, earnings, withdrawals, audit trail.
- **Cloudflare Stream** — the media: direct uploads, transcoding, adaptive streaming, signed playback, and the clips used for the free preview and the 60-second social promo.
- **Payments** — a provider interface. Milestone 2 runs a sandbox; Milestone 3 drops AirPay in behind the same three methods without touching the monetization code.

Everything lives in `server/`. Nothing backend sits outside it.

---

## 1. What you need before it runs

| Secret | Where to get it | Blocking? |
|---|---|---|
| `DATABASE_URL` password | Supabase → Project Settings → Database → **Reset database password** | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` | **Yes** (auth) |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Custom → Account → **Stream: Edit** | Yes (upload/playback) |
| `CLOUDFLARE_STREAM_KEY_ID` + `_PEM` | generated for you: `node src/cli/cf-key.js` | Yes (paywall) |
| AirPay credentials | AirPay Tanzania merchant portal | No — Milestone 3 |

The API **boots without them** and reports exactly what is missing at `GET /health`, so a missing Cloudflare token degrades one feature instead of taking the server down.

## 2. Setup

```bash
cd server
npm install
cp .env.example .env          # then fill in the secrets above

npm run db:check              # configuration + connection test
npm run db:setup              # reset + migrate + seed (destructive)
npm run dev                   # http://localhost:4000
```

Day-to-day:

```bash
npm run db:migrate            # apply new migrations only
npm run db:status             # which migrations have run
npm run db:seed               # starter data
npm run cron:premieres        # switch expired premieres to Free With Ads
npm run smoke                 # end-to-end test against a running API
node src/cli/cf-key.js        # create the Cloudflare signing key (once)
```

## 3. How the paywall actually holds

A client-side timer that stops the video at 5:00 is trivially bypassed with devtools. So the free preview and the full video are **two separate Cloudflare assets**:

| | Asset | Who can play it |
|---|---|---|
| Preview | first *N* seconds, clipped by Cloudflare | anyone |
| Full video | the original | only after payment |

Until a purchase exists, the full video's signed token is never generated and never reaches the browser — there is nothing to bypass. Tokens are short-lived (1 hour for full playback, 15 minutes for previews), so a copied URL dies quickly.

`GET /api/playback/:id/playback` is the one place this is decided; the player, the share sheet and the entitlement check all read from it.

## 4. Rules the database enforces

The client's requirement was explicit: *"don't make this only a button/interface restriction."*

- **`videos_publication_guard`** — a trigger that refuses to set `review_status = 'approved'` or `is_published = true` unless the transaction declares an admin actor. It fires for this API's own connection too, so an application bug cannot publish anything either.
- **`videos_block_hard_delete`** — a video with active purchases cannot be deleted at all. Removal is a soft delete by an admin; the entitlement rows survive.
- **`sync_premiere_window`** — keeps `premiere_days` / `premiere_started_at` / `premiere_ends_at` consistent, and clears them for PPV Forever and Free With Ads.
- **Row Level Security** on every table, covering anyone talking to Supabase's REST API directly with the anon key.

Creator → `pending_review` is the furthest a creator can ever get.

## 5. Paid Premiere is per video

Not a platform-wide 30 days. The creator proposes a duration (30 / 60 / 90 / anything), and **an admin can change it while approving**:

```http
POST /api/admin/review/:id/approve
{ "premiereDays": 90 }
```

When the window expires, `runPremiereExpiry()` switches the video to `free_with_ads` — it stays in the library permanently and keeps earning through pre-roll. Anyone who bought it keeps their ad-free copy, because their entitlement row is untouched.

Run it from cron:

```bash
npm run cron:premieres
# or over HTTP
curl -X POST -H "x-cron-secret: $CRON_SECRET" $API/api/jobs/premiere-expiry
```

## 6. Payments

`POST /api/payments/initiate` → provider pushes an approval to the phone → provider calls back → `settlePayment()` runs **one transaction** that marks the payment paid, creates the permanent entitlement, writes the revenue split to the ledger and bumps the unlock counter. Either the customer gets access *and* the creator gets credited, or nothing happens. Webhooks are idempotent, so retries are harmless.

All four outcomes the client asked to test:

| Outcome | Result |
|---|---|
| `success` | video unlocks instantly, purchase saved, split recorded |
| `failed` | stays locked, failure reason returned |
| `pending` | waits — **never unlocks early** |
| `cancelled` / `expired` | stays locked |

Pick the outcome two ways:

```jsonc
// explicit
POST /api/payments/initiate { "simulate": "failed" }

// or by the phone's last digit: 0=failed 1=cancelled 2=expired 3=stays pending, else success
POST /api/payments/initiate { "phone": "0712345670" }
```

Force a pending sandbox payment at any time: `POST /api/payments/:id/simulate { "outcome": "success" }`.

## 7. Sharing

`GET /api/share/:id` returns the deep link, the 60-second promo clip, and the best method per network:

- **WhatsApp / Instagram / TikTok** — the OS share sheet (`navigator.share`), ideally carrying the clip **file** via Web Share Level 2. Instagram and TikTok have no public web publishing API; the device is the only route.
- **Facebook / X** — link-share URLs, which read the page's Open Graph tags.
- **Open Graph payload** — included in the response.

> **Architecture note for rich previews.** For WhatsApp to show a thumbnail and title, the crawler must receive per-video `og:` tags. The frontend is a Vite SPA, so every route currently returns the same `index.html` and the crawler sees generic tags. Per-video previews need SSR, prerendering, or a Vercel Edge Middleware that injects these tags for bots. The payload above is ready for whichever route we take.

## 8. Layout

```
server/
  src/
    index.js                 express app, health, route map, shutdown
    config/env.js            env + capability flags
    db/
      pool.js                pg pool via the Supabase transaction pooler
      migrate.js             migration runner
      seed.js                starter data
      migrations/
        001_core_schema.sql
        002_publish_guard_and_rls.sql
    lib/                     logger, errors, supabase, cloudflare
    middleware/              auth, role guards, validation, error handler
    services/                settings/split, entitlement, audit
    modules/
      auth.routes.js
      videos.routes.js
      playback.routes.js     paywall + signed URLs + Cloudflare webhook
      payments/              provider interface, sandbox, settlement
      library.routes.js      purchases + entitlement
      earnings.routes.js     split ledger + withdrawals
      share.routes.js
      ads.routes.js
      admin.routes.js        review queue, users, money, settings, audit
    jobs/premiere.js         Paid Premiere → Free With Ads
    cli/                     db, cron, cf-key, smoke
```

`GET /api` returns the full route list at runtime.

## 9. Seeded test accounts

After `npm run db:seed`:

| Role | Email | Password |
|---|---|---|
| admin | `admin@mtonyo.tz` | `Mtonyo!Admin2026` |
| creator | `konde@mtonyo.tz` | `Mtonyo!Creator1` |
| creator | `zuchu@mtonyo.tz` | `Mtonyo!Creator2` |
| viewer | `amina@mtonyo.tz` | `Mtonyo!Viewer1` |

Change these before anything goes near production.
