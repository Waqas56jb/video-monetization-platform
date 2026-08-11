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
| `npm run cf:origins` | Which sites may embed each video (`-- --fix` repairs) |
| `npm run demo:seed` | Fill the database with demo creators, videos and sales |
| `npm run demo:status` | What demo content is there |
| `npm run demo:clear` | Remove every trace of it |

### Demo content

`demo:seed` puts sample content in the **real database**, created the way a
real creator creates it: real accounts, real Cloudflare uploads, real review and
approval, real purchases with the revenue split recorded. It is not front-end
fixtures — if the demo works, the platform works, because it is the same code
path.

It covers every case worth testing: pay-once-forever, a premiere with weeks
left, one with days left, one whose window has expired and been turned
free-with-ads by the nightly job, something free from the start, one video
sitting in the review queue, and a live ad campaign with impressions behind it.

All of it is tagged, so `demo:clear` removes every trace on the day real
creators arrive and touches nothing of theirs. A demo video that a real customer
has bought is the one exception: it gets unpublished rather than deleted, because
a purchase never disappears.

**The footage has to be long.** The first version of this seeder gave every
video the same fifteen-second clip, and that quietly broke the whole
demonstration: a 15-second video with a 14-second preview plays almost to its end
before stopping, so a paid video is indistinguishable from a free one. The client
reported the monetisation as broken and was right to — nothing on screen could
have told them otherwise. The sources are now real films of ten minutes and up,
with previews that are a fraction of them, so the stop and the paywall are
unmistakable. If you substitute your own URLs, they must answer HEAD and range
requests or Cloudflare cannot size the file; the seeder falls back to
downloading and re-uploading when they do not.

### Housekeeping

`cf:origins` is worth checking after any change to `PUBLIC_WEB_URL` or
`ADMIN_WEB_URL`. Cloudflare stores the list of sites allowed to embed a video
**on the video, permanently, when it is created** — so a video uploaded while
the API was pointed somewhere else is locked to that place for good and renders
as a blank white player. `-- --fix` repairs them.

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

**The public names and the database values differ, deliberately.** A release model
is called **Pay Once**, **Paid Premiere** or **Free + Ads** everywhere a person can
read it — viewer, creator and admin alike. The stored enum is still
`ppv_forever` / `paid_premiere` / `free_with_ads`, because renaming a column that
purchases and triggers depend on would be a migration with real risk for no gain.
So the labels live in `client/src/data/copy.js` and the `ACCESS_LABEL` maps, and
nothing reads a label to make a decision. The word "forever" is not used in
customer-facing copy at all: the client's point was that "the video stays in your
library" says the same thing without implying MTONYO+ holds onto a creator's work.

**An entitlement is one viewer and one video.** `purchases` is keyed on both, and
`resolveAccess` reads it that way, so buying one video cannot reach another. Note
the three other doors into full playback, because they look identical on screen
and are easy to mistake for a broken paywall: the creator of a video, any member
of staff (reviewing a video means watching it), and a video that is simply free.
The watch page now names which one applies, so an administrator browsing the
public site sees "open to you as staff" rather than concluding the paywall failed.

**The hero is allowed to be taller than the screen.** It was briefly compressed to
fit one viewport — every vertical gap tied to `dvh`, the phone's poster included —
and that was the wrong trade: the phone is what the section is built around, and it
shrank along with everything else. A landing page scrolls. The phone having presence
matters more than the marquee sitting above the fold.

If you are tempted to make it fit again: measure the phone first. Anything that
compresses the hero compresses that.

**The hero diagram is proportions, not pixels.** Three callouts float around the
phone — top-left, right, bottom-left — and they are *meant* to lap its edge: that
overlap is what makes the group read as one composed object rather than a phone
with boxes parked beside it. The lap comes from the shares adding to more than
100% of the stage (`28% + 54% + 28% = 110%`, so 5% of overlap each side), never
from pushing a card outside the stage. A card positioned outside the stage is a
card that can leave the screen, and one nearly did.

Because the shares are shares, the phone holds the same fraction of the screen
(~24%, matching the design) from 1280px to 1920px instead of shrinking into the
middle of a large monitor, and no arrangement of widths can make the cards collide.

Below 1024px they stop floating and become a list under the phone. They used to be
hidden outright, which is what the client saw as them "disappearing"; floating them
over a 390px mock would bury the very thing they describe.

**The container grows with the screen.** It was capped at 1200–1360px, so a 1920px
monitor showed the whole site in 71% of its width with 280px of dead margin either
side, and the phone came out at 16% where the design has it at 23%. That — not a
font size — was the whole "everything looks small" report. `min(1800px, 94%)`.

Two traps in that file cost real time and are worth knowing about. `.fcN`
positions existed in **two** places, hundreds of lines apart, and the later set
silently won — so did a stale `.hero-stats{grid-template-columns:repeat(4,…)}`
from when there were four stats, which squeezed three figures into two thirds of
the strip. If a hero rule appears not to apply, grep the whole file for the
selector before changing anything.

**A poster is taken from 15 seconds in, not from frame one.** Films open on black —
a fade, a title card, a dark room — so every poster on the site rendered as a
black rectangle that reads as a broken image. A creator's own uploaded cover
always wins; this is only the default when there isn't one.

**A card opens its own video, because the cards are real videos.** The homepage
Trending grid used to be drawn from a hard-coded showcase list, so the cards had
nothing behind them and clicking one could only dump the viewer on /explore to go
and find it again. That was not a routing mistake — there was genuinely nothing to
route to. The grid is the live catalogue now, ordered by `sort=trending`: views
and purchases over the last fortnight, with a purchase weighted five times a view,
because somebody paying is a far stronger signal than somebody clicking. Lifetime
views break ties so a quiet fortnight still produces a sensible order.

**Signing in is an interruption, not a destination.** The place someone was going
travels in the URL — `/login?next=/watch/some-video?unlock=1` — never only in
router state, because router state does not survive a page load, the detour
through Sign up, or an already-signed-in visitor being bounced off the login page.
All three were losing it, which is how a viewer who tapped Unlock ended up on the
dashboard. `?unlock=1` has to sit *inside* `next`, not beside it: the login page
navigates to `next` and anything alongside is left behind. `safeNext` refuses
anything that is not an internal path, so the login page cannot be turned into an
open redirector. The dashboard is now only ever reached by choosing it.

**Where a viewer got to is stored, not remembered.** `watch_progress` holds a
position per viewer per video, which is what makes "pay, then carry on from the
paywall" work: the page reloads its playback the moment payment lands, so a
position held in memory would already be gone. The first attempt did hold it in
memory, and the client found the video restarting — correctly. A stored position
grants nothing; reaching 5:00 of a film says nothing about whether you may watch
5:01.

There is a second copy in session storage, and it is not redundant. The server can
only record a position against an account, which left out precisely the person who
needs it most: a signed-out visitor who watches five minutes of a preview, taps
Unlock, signs in, and expects the video to carry on. `client/src/lib/watchProgress.js`
keeps their position from the first second, hands it over as soon as we know who
they are, and then forgets it so there is only ever one copy that can go stale.

**Nav links to a landing section work from everywhere.** Those sections only
exist on the landing page, so a plain `#features` anchor did nothing at all from
/explore — the label highlighted and the page stayed put, which is exactly what
the client reported. The links now route to the landing page first, then wait for
the section to exist before scrolling, and re-check afterwards because lazily
loaded images above it keep moving the target for a second or two.

**A lost payment confirmation heals itself.** The provider's push is the fast
path, not the only one. It can be dropped — a missed webhook, a retry that never
came, or a serverless instance frozen the moment its response was sent, which is
what was actually happening here. So the status poll the customer's browser is
already making doubles as reconciliation: if a payment is still pending, the
provider is asked what became of it and the answer is recorded. A payment stuck
on "pending" for ever is indistinguishable, to the person who paid, from being
charged for nothing.

**A counter is never written by hand.** `videos.views` and `videos.paid_unlocks`
are maintained by triggers over the rows they summarise. They used to be
incremented in application code as well, which is how the admin came to report
3.2K views against a few hundred actual view rows, and 6 paid unlocks against 3
purchases. Two screens quoting two numbers for one fact is worse than either
being wrong, because it means neither can be trusted.

**Advertising is a real ledger, in micro-shillings.** A CPM is priced per
thousand impressions, so one impression is worth a fraction of a shilling.
Rounding that to a whole number pays a creator nothing on any campaign under
TZS 1,500 — which is most of them. Impressions are therefore recorded in
millionths, exactly, and the whole-shilling earnings row is a daily rollup
recomputed from them. An advertiser is billed only for an advert that reached its
end, and the platform share is whatever is left after the creator's, never an
independent rounding, so the split always adds up to the total.

**An advert can never trap the viewer.** The skip countdown runs on wall clock,
not on the advert's playback position. Tying it to playback looked more correct
and was worse: when a browser refuses to autoplay, the position never moves, the
countdown never finishes, and the viewer is left holding a frozen advert in front
of the video they came for. Revenue is unaffected — billing is on the advert's own
`ended` event, and time passing earns nobody anything.

**Nobody who paid ever sees an advert.** Not even after the premiere they bought
expires and the video turns free for everyone else. Skipping advertising is part
of what they paid for, and a premiere ending is not permission to renege on it.
