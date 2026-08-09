# Putting MTONYO+ online

Three pieces deploy separately: the **API**, the **public app**, and the
**control centre**. They are three Vercel projects from one repository.

The order matters. The API has to exist first, because the other two need its
address baked into their build.

---

## The one mistake that costs an afternoon

The apps read the API address from `VITE_API_URL` **at build time**, not at
run time. If that variable is missing on Vercel, the build silently falls back
to `http://localhost:4000` — which works perfectly for whoever built it and
fails for every real visitor with *"Cannot reach the server"*.

If you change `VITE_API_URL`, you must **redeploy**. Setting the variable is
not enough; the old build still has the old address inside it.

---

## 1 · The API

**Vercel → Add New → Project → this repository**

| Setting | Value |
| --- | --- |
| Root Directory | `server` |
| Framework Preset | Other |
| Build Command | *(leave empty)* |

### Environment variables

Copy these from `server/.env`. Set them for **Production, Preview and
Development** so preview deployments work too.

```
NODE_ENV=production
CORS_ORIGINS=https://your-public-app.vercel.app,https://your-admin.vercel.app
PUBLIC_WEB_URL=https://your-public-app.vercel.app
ADMIN_WEB_URL=https://your-admin.vercel.app

SUPABASE_URL=…
SUPABASE_ANON_KEY=…
DATABASE_URL=…                 # the pooler URL, port 6543 — see below

CLOUDFLARE_ACCOUNT_ID=…
CLOUDFLARE_API_TOKEN=…
CLOUDFLARE_STREAM_KEY_ID=…
CLOUDFLARE_STREAM_KEY_PEM=…    # private key — server side only, never in an app

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=…
SMTP_PASS=…                    # a Gmail app password, not the account password
MAIL_FROM=MTONYO+ <…>

PAYMENT_PROVIDER=sandbox
CRON_SECRET=…                  # any long random string
```

**`DATABASE_URL` must be the transaction pooler** (the one on port **6543**,
not 5432). Serverless functions open a connection per invocation; a direct
connection would exhaust Postgres's limit within minutes of real traffic.

`SUPABASE_SERVICE_ROLE_KEY` is **not needed**. Nothing depends on it.

### Check it

```
https://your-api.vercel.app/health
```

Every capability should read `true`. Anything false is listed under
`needsConfiguration` with the variable that fixes it.

---

## 2 · The public app

| Setting | Value |
| --- | --- |
| Root Directory | `client` |
| Framework Preset | Vite |

```
VITE_API_URL=https://your-api.vercel.app
```

---

## 3 · The control centre

| Setting | Value |
| --- | --- |
| Root Directory | `admin` |
| Framework Preset | Vite |

```
VITE_API_URL=https://your-api.vercel.app
```

Keep this on its own URL and do not link to it from the public site. It is not
secret — the login refuses anyone who is not staff — but there is no reason to
advertise it.

---

## 4 · Afterwards

**Point CORS at the real addresses.** Once the two apps have their URLs, put
them in the API's `CORS_ORIGINS`, `PUBLIC_WEB_URL` and `ADMIN_WEB_URL`, and
redeploy the API. Password-reset and staff-invitation links are built from
those two URLs — if they still say `localhost`, every emailed link will point
at the recipient's own machine.

**Register the Cloudflare webhook**, so encoding finishes without waiting for
a poll:

```
cd server
npm run cf:webhook https://your-api.vercel.app
```

It prints a secret. Add it to the API as `CLOUDFLARE_WEBHOOK_SECRET` and
redeploy — without it every incoming webhook is rejected, by design.

**Confirm the nightly job.** `vercel.json` schedules the premiere-expiry sweep
for 02:00 UTC. Check it appears under Settings → Cron Jobs. Nothing else turns
a paid premiere into free-with-ads when its window closes.

---

## Useful commands

Run these from `server/`:

```
npm run db:migrate      apply any new database migrations
npm run admin:create <email>    create an administrator
npm run admin:list      list administrators and sub-admins
npm run mail:test <email>       prove outbound email works
npm run cf:verify       upload, encode, play and clip a real file end to end
npm run cf:orphans      find Cloudflare videos with no record here
```

`cf:orphans` is worth running monthly. Abandoned uploads — a closed tab, a lost
signal — leave files on Cloudflare that count against your storage minutes
permanently, and nothing in the normal flow removes them because nothing in the
normal flow knows they exist. Add `-- --delete` to clear them.

---

## Things to know

**Video never passes through the API.** The browser uploads straight to
Cloudflare using a one-time URL, which is what makes a large upload from a
phone on mobile data workable and why the API never needs more memory.

**The paywall is enforced by the server, not the page.** When a viewer has not
paid, the full video's playback token is never generated, so it never reaches
their browser. There is nothing in devtools to bypass.

**Publication is enforced by the database.** A creator cannot move their own
video to published even by calling the API directly — a trigger refuses it. The
same applies to a sub-admin trying to change an account.

**Payments are in sandbox.** `PAYMENT_PROVIDER=sandbox` simulates the mobile
money flow end to end. Switching to a live provider is a change to that one
variable and its credentials; nothing else in the app knows the difference.
