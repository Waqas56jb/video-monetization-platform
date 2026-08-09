# MTONYO+

A video platform for Tanzanian creators. Upload a video, set your own price,
get paid by M-Pesa or Airtel Money — and when the paid window closes, the video
turns free-with-ads and keeps earning.

## Repository layout

| Folder | What it is |
| --- | --- |
| [`client/`](client/) | Public app (React + Vite) — landing, auth, explore, watch, dashboard |
| [`admin/`](admin/) | Control centre (React + Vite) — review, users, finance, announcements |
| [`server/`](server/) | API (Node + Express) — Supabase, Cloudflare Stream, payments, email |

Each folder has its own README with the detail.

---

## Running it locally

Three processes. All three must be running or the apps will report a
connection problem.

```bash
cd server && npm install && npm run dev    # http://localhost:4000
cd client && npm install && npm run dev    # http://localhost:5173
cd admin  && npm install && npm run dev    # http://localhost:5174
```

The dev servers also bind to your LAN address, so the apps can be opened on a
real Android or iOS phone on the same Wi-Fi.

Check the API is healthy before anything else:

```
http://localhost:4000/health
```

Every capability should read `true`. Anything false is listed under
`needsConfiguration` with the setting that fixes it.

### If a screen says it cannot reach the API

Either the API is not running, or it is refusing that origin. In development
any `localhost` port is accepted, so this is nearly always the first one —
check `server` is up.

---

## Useful commands

Run from `server/`:

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Apply new database migrations |
| `npm run admin:create <email>` | Create an administrator |
| `npm run admin:list` | List administrators and sub-admins |
| `npm run mail:test <email>` | Prove outbound email works |
| `npm run cf:verify` | Upload, encode, play and clip a real file end to end |
| `npm run cf:orphans` | Find Cloudflare videos with no record here |
| `npm run cf:webhook <url>` | Register the encoding webhook |

`cf:orphans` is worth running monthly. Abandoned uploads — a closed tab, a lost
signal — leave files on Cloudflare that count against your storage minutes
permanently, and nothing in the normal flow removes them because nothing in the
normal flow knows they exist. Add `-- --delete` to clear them.

---

## Deployed

| | |
| --- | --- |
| API | https://video-monetization-platform-backend.vercel.app |
| Public app | https://video-monetization-platform-chi.vercel.app |
| Control centre | https://video-monetization-platform-admin.vercel.app |

Check the API first if anything looks wrong:
`https://video-monetization-platform-backend.vercel.app/health`

---

## Deploying

Three Vercel projects from this one repository. **The API has to go first**,
because the other two need its address baked into their build.

### The mistake that costs an afternoon

The apps read `VITE_API_URL` **at build time**, not at run time. If it is
missing on the host, the build silently falls back to `http://localhost:4000` —
which works perfectly for whoever built it and fails for every real visitor
with *"Cannot reach the API"*.

Changing `VITE_API_URL` is not enough on its own. **Redeploy**, or the old
build keeps the old address inside it.

### 1 · API

Root directory `server`, framework preset **Other**, no build command.

Environment variables come from `server/.env`. Set them for Production,
Preview and Development:

```
NODE_ENV=production
CORS_ORIGINS=https://your-app.vercel.app,https://your-admin.vercel.app
PUBLIC_WEB_URL=https://your-app.vercel.app
ADMIN_WEB_URL=https://your-admin.vercel.app

SUPABASE_URL=…
SUPABASE_ANON_KEY=…
DATABASE_URL=…                  # the pooler URL, port 6543 — see below

CLOUDFLARE_ACCOUNT_ID=…
CLOUDFLARE_API_TOKEN=…
CLOUDFLARE_STREAM_KEY_ID=…
CLOUDFLARE_STREAM_KEY_PEM=…     # a private key — server side only

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=…
SMTP_PASS=…                     # a Gmail app password, not the account password
MAIL_FROM=MTONYO+ <…>

PAYMENT_PROVIDER=sandbox
CRON_SECRET=…                   # any long random string
MEDIA_TOKEN_SECRET=…            # signs poster links for unpublished videos
```

`DATABASE_URL` must be the **transaction pooler** (port **6543**, not 5432).
Serverless functions open a connection per invocation; a direct connection
would exhaust Postgres's limit within minutes of real traffic.

`SUPABASE_SERVICE_ROLE_KEY` is **not needed** — nothing depends on it.

### 2 · Public app

Root directory `client`, framework preset **Vite**.

```
VITE_API_URL=https://your-api.vercel.app
```

### 3 · Control centre

Root directory `admin`, framework preset **Vite**.

```
VITE_API_URL=https://your-api.vercel.app
```

Keep it on its own URL and do not link to it from the public site. It is not
secret — the login refuses anyone who is not staff — but there is no reason to
advertise it.

### 4 · Afterwards

**Point CORS at the real addresses.** Put the two app URLs into the API's
`CORS_ORIGINS`, `PUBLIC_WEB_URL` and `ADMIN_WEB_URL`, then redeploy the API.
Password-reset and staff-invitation links are built from those two URLs — if
they still say `localhost`, every emailed link points at the recipient's own
machine.

**Register the Cloudflare webhook**, so encoding finishes without waiting on a
poll:

```bash
cd server && npm run cf:webhook https://your-api.vercel.app
```

It prints a secret. Add it as `CLOUDFLARE_WEBHOOK_SECRET` and redeploy —
without it every incoming webhook is rejected, by design.

**Confirm the nightly job.** `server/vercel.json` schedules the premiere-expiry
sweep for 02:00 UTC; check it appears under Settings → Cron Jobs. Nothing else
turns a paid premiere into free-with-ads when its window closes, so if it never
runs, videos stay paid forever.

---

## How it holds together

**Video never passes through the API.** The browser uploads straight to
Cloudflare with a one-time URL, which is what makes a large upload from a phone
on mobile data workable and why the API never needs more memory.

**The paywall is enforced by the server, not the page.** When a viewer has not
paid, the full video's playback token is never generated, so it never reaches
their browser. There is nothing in devtools to bypass.

**Publication is enforced by the database.** A creator cannot move their own
video to published even by calling the API directly — a trigger refuses it. The
same applies to a sub-admin trying to touch an account.

**Uploaded pictures live in Supabase Storage.** Profile photos and custom
cover images go into two buckets created by a migration, so a fresh
environment comes up complete rather than needing anything clicked into
existence. They are uploaded with the caller's own token, so the storage
policies apply as written — everyone writes only into a folder named after
their own account.

**Payments are in sandbox.** `PAYMENT_PROVIDER=sandbox` simulates the mobile
money flow end to end. Going live is a change to that variable and its
credentials; nothing else in the app knows the difference.
