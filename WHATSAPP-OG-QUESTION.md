# Ask ChatGPT: WhatsApp link preview is unreliable — how do we make it deterministic?

> Copy everything below this line into ChatGPT.

---

I need a recommendation, not code. Read the whole thing, then tell me what you would change and why. Be specific about trade-offs, and say plainly if part of what I want is not achievable — I would rather know than be told it is fixed.

## The product

**MTONYO+** — a Tanzanian video platform. Creators upload a video, set a price, and share a link. Whoever receives the link watches a free preview, then pays to keep watching. Almost all discovery happens by creators sharing links on **WhatsApp**, so the link preview card is not decoration — it is the shop window, and the business depends on it.

Public URLs look like:

```
https://video-monetization-platform-chi.vercel.app/watch/live-at-arusha-full-set
```

## What I want

When anyone shares that URL to WhatsApp — from an **Android phone, an iPhone, or WhatsApp Web / WhatsApp Desktop on a laptop** — the recipient must **always** see a rich card: our branded 1200×630 poster, the video title, the creator's name, MTONYO+, and "WATCH FREE PREVIEW". Tapping it opens that exact video.

It must be **deterministic**. Not "usually", not "after a few tries".

## What actually happens (this is the problem)

### Symptom 1 — pasting works only if I wait

If I copy the link and paste it into the WhatsApp message box and then **wait 2–3 seconds** before pressing send, the card appears and is sent correctly.

If I paste and press send **immediately**, only the bare URL is sent — no card.

### Symptom 2 — retrying eventually works

If I send the same link repeatedly, the first 2–3 attempts arrive as a bare link, and by the 3rd or 4th attempt the card appears. After that, that URL keeps producing the card.

This looks like a cache being populated on the failed attempts.

### Symptom 3 — phone works, laptop does not

Our app has a "Share on WhatsApp" button.

- From an **Android/iPhone** it opens the WhatsApp app with the URL and the card is produced correctly.
- From a **laptop** (WhatsApp Web / Desktop) the same button produces a bare link with **no card**.

## Our architecture

**Frontend** — React 18 + Vite (JavaScript), deployed on **Vercel**.
**Backend API** — Node.js 20 + Express 4 (ESM, JavaScript), deployed on **Vercel serverless functions**.
**Database** — PostgreSQL on **Supabase**, connected through the transaction pooler (port 6543), raw SQL via `pg` (no ORM).
**Video hosting** — **Cloudflare Stream** (signed playback, signed thumbnails).
Two separate Vercel projects: one for the frontend, one for the API.

### How a link preview is currently produced

The frontend is a **single-page React app**, so a crawler that does not run JavaScript would see an empty shell. To handle that there is a Vercel serverless function on the frontend project:

**1. `client/api/watch.js`** — intercepts `/watch/{slug}`.
- It reads the `User-Agent`. If it matches a link-preview bot (`WhatsApp`, `facebookexternalhit`, `Twitterbot`, `TelegramBot`, `Slackbot`, etc.) it returns a **tiny HTML document** (about 2 KB) containing only the Open Graph tags.
- Any other user agent gets the normal React app.
- It sets `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400`.

The OG tags it returns:

```html
<meta property="og:title"  content="Live at Arusha — Full Set">
<meta property="og:description" content="WATCH FREE PREVIEW · Juma Kileo Live · MTONYO+">
<meta property="og:image"  content="https://video-monetization-platform-chi.vercel.app/og/card/live-at-arusha-full-set.jpg">
<meta property="og:image:width"  content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type"   content="image/jpeg">
<meta property="og:url"    content="https://video-monetization-platform-chi.vercel.app/watch/live-at-arusha-full-set">
<meta name="twitter:card" content="summary_large_image">
```

**2. `client/api/og.js`** — serves `/og/card/{slug}.jpg`. It proxies to the API and sets `Access-Control-Allow-Origin: *` and a 24-hour cache header.

**3. The API** (`/api/share/{slug}/card.jpg`) composes the actual JPEG with **sharp**: it fetches the signed Cloudflare thumbnail and burns on the title, the creator's name, MTONYO+ and a "WATCH FREE PREVIEW" pill.

**4. Card storage** — there is a Postgres table:

```sql
share_card_cache (slug text primary key, video_id uuid, jpeg bytea, built_at timestamptz, source_key text)
```

The API stores the composed JPEG as `bytea` and serves it from there on later requests. `source_key` is a fingerprint of what the card was built from (id, title, creator, updated_at, poster URL) so a changed video rebuilds it.

## What I have measured (today, against production)

```
Crawler HTML  (User-Agent: WhatsApp)        HTTP 200   1.07 s    2,036 bytes
OG image      /og/card/{slug}.jpg           HTTP 200   0.37 s   34,833 bytes   X-Vercel-Cache: HIT
API card      /api/share/{slug}/card.jpg    HTTP 200   0.37 s                  X-Og-Cache: MISS  ← every time
Share payload /api/share/{slug}             HTTP 500                           ← currently broken
```

Two known faults, both found today:

**a) The card cache never hits.** All eight videos have a stored JPEG in `share_card_cache`, but `X-Og-Cache` reports `miss` on **every** request, so the JPEG is re-composed with sharp on every single request. Cause: the `source_key` was built by joining an array that contained a JavaScript `Date`, and joining a Date renders it in the running process's **locale and timezone** — `"Fri Aug 21 2026 22:11:45 GMT+0000 (Coordinated Universal Time)"` where it was written versus `"Sat Aug 22 2026 03:11:45 GMT+0500 (Pakistan Standard Time)"` where it was read. Same instant, two different strings, so the comparison could never succeed. A fix (use epoch milliseconds) is committed but **not yet deployed**.

**b) `/api/share/{slug}` returns HTTP 500 in production**, while the identical code returns 200 locally against the same database in both development and production mode. The backend Vercel project has not picked up a commit for about 45 minutes, so production is running an older build.

## What I think is going on, and what I want you to check

My understanding is that WhatsApp fetches the preview at the moment the URL enters the message box, and that:

- On the **phone app**, the fetch is done by **WhatsApp's own servers**, which retry and cache per URL.
- On **WhatsApp Web / Desktop**, the fetch is done **inside the browser**, subject to CORS and to a much shorter patience.

If that is right, it would explain all three symptoms: pasting and waiting gives the fetch time to finish; sending immediately does not; retrying eventually populates WhatsApp's cache; and the laptop behaves differently because the fetch happens somewhere else entirely.

**Please confirm or correct that model.**

## The questions

1. **Is my model of how WhatsApp scrapes right?** What is the actual timeout, and does it differ between the phone app, WhatsApp Web and WhatsApp Desktop? Does WhatsApp fetch the `og:image` bytes, or only reference the URL?

2. **Our crawler HTML takes 1.07 s.** Is that inside or outside WhatsApp's window? What should we be aiming for? Would serving it from the edge (Vercel Edge Middleware / a CDN) instead of a serverless function materially change the outcome?

3. **Should the JPEG be pre-generated at upload time rather than on demand?** I am already storing it in Postgres as `bytea`. Would it be better to write it to object storage (Supabase Storage / S3 / R2) and serve a plain static URL, so WhatsApp never touches our application at all? Does serving an image from `bytea` through a serverless function meaningfully hurt here?

4. **Is the 1200×630 / 34 KB JPEG right for WhatsApp?** Are there size, dimension or aspect-ratio limits where WhatsApp silently drops the image and shows a bare link?

5. **Is there anything that makes the first scrape of a brand-new URL reliable?** Can we usefully pre-warm WhatsApp's cache, or is that entirely on their side? Is there a documented way to validate what WhatsApp will see, the way Facebook's Sharing Debugger does?

6. **The desktop case specifically.** If WhatsApp Web scrapes from the browser, what exactly does our response need — CORS headers, a redirect-free URL, a particular content type? We already send `Access-Control-Allow-Origin: *` on both the HTML and the image. Is something else missing?

7. **Is `whatsapp://send?text={url}` versus `https://web.whatsapp.com/send?text={url}` relevant to whether a card is produced?** Does a URL arriving pre-filled through `?text=` get scraped the same way as one a person types or pastes? This matters a lot to us, because our button uses exactly that.

8. **What is the most reliable architecture overall?** If you were building this so that a share from any device always produces the card, what would you do — and what would you accept as a residual limitation?

## Constraints

- We are on Vercel (both projects) and Supabase. Changing hosting is possible but I would rather not.
- We do not yet have a custom domain; everything is on `*.vercel.app`. **Tell me if that itself is part of the problem** — whether WhatsApp treats `vercel.app` subdomains differently, rate-limits them, or has ever blocked them.
- The video files are on Cloudflare Stream and the thumbnails are signed URLs that expire.
- Please do not propose sending the video file itself to WhatsApp. The link and its card are what we want.
