# Follow-up: we did the work, the laptop still sends a bare link

> Copy everything below this line into the same ChatGPT conversation.

---

Thank you — your correction was right and I have acted on it. Here is what changed, what I measured afterwards, and the one behaviour that has not moved. I would like you to look at the new numbers, because I think they contradict part of the model we were both working from.

## 1. What I accepted from your answer

**You were right that my model was backwards.** I had assumed WhatsApp Web scraped the page inside the browser and that CORS was the mechanism. I have stopped designing around that.

I verified your point directly against production, using the three crawler user agents Meta documents:

| Request as | Response | Size | OG tags | React shell |
|---|---|---|---|---|
| `WhatsApp/2.24.15.78 A` (Android) | 200 | 2,037 B | 7 | no |
| `WhatsApp/2.24.15.78 I` (iOS) | 200 | 2,037 B | 7 | no |
| `WhatsApp/2.24.15.78 N` (Web) | 200 | 2,037 B | 7 | no |
| WhatsApp in-app browser (a real person) | 200 | 3,744 B | 7 | yes |

So all three crawlers get the small Open Graph document, and a human who taps the card gets the real page. That part of our implementation is correct.

## 2. What I fixed since your answer

**a) `/api/share/{slug}` was returning HTTP 500 in production.** It now returns 200. The cause was that the backend Vercel project had not picked up a commit for about an hour while the frontend deployed normally — production was running an older build than the repository. This also fixed a separate user-visible bug: our Instagram and TikTok buttons depend on that endpoint for the promo-clip URL, so they had been spinning for 15 seconds and then giving up. They now complete in 5.1 seconds.

**b) The cache fingerprint bug you agreed was real.** The `source_key` was built by joining an array containing a JavaScript `Date`, which renders in the running process's locale and timezone. It is epoch milliseconds now.

## 3. Measurements after those fixes (production, today)

**The full chain, exactly as WhatsApp walks it:**

```
GET /watch/{slug}   as "WhatsApp/2.24.15.78 N"
    0.99 s   (first, cold function)
    0.36 s
    0.37 s          2,036 bytes

GET /og/card/{slug}.jpg
    0.35 s   X-Vercel-Cache: HIT
    0.36 s   X-Vercel-Cache: HIT
    0.36 s   X-Vercel-Cache: HIT        34,833 bytes
```

**A URL WhatsApp has never seen, cache-busted with a random query:**

```
0.77 s
0.70 s
```

So a complete crawl of a brand-new URL — HTML plus image — costs us roughly **0.7 to 1.4 seconds**, and the image is served from Vercel's edge, not from our application.

## 4. The behaviour that has not changed

Sharing from a **laptop** (WhatsApp Web / Desktop) still sends a bare link with no card.

And this is the precise observation, which I think matters:

> If I paste the URL into the WhatsApp message box and **wait 2 to 4 seconds**, the card appears in the compose box, and sending then delivers the card correctly.
> If I paste and send immediately, only the URL is delivered.

The card does get built. The sender simply beats it.

## 5. Why I think this contradicts part of our earlier model

We were both treating this as "our response is too slow for the crawler". The numbers do not support that any more:

- Our whole chain is **under 1.4 seconds**, and typically under 0.8 s.
- WhatsApp's documented patience is **10 seconds**.
- Yet a human still has to wait **2 to 4 seconds** before the preview appears in the compose box.

So the 2–4 seconds a person waits is **not** our server. Roughly one second of it is us; the rest is happening inside WhatsApp — queueing the fetch, downloading, decoding, generating its own thumbnail, rendering it into the compose box.

If that is right, then making our HTML faster — your suggestion of driving 1.07 s toward sub-500 ms — would shave perhaps half a second off a 2–4 second wait. Worth doing, but it would not change the outcome for someone who pastes and sends in under a second.

**Please tell me whether you agree with that reading.**

## 6. The sharper question I now have

Given that the preview is generated **into the compose box** before sending, and that the sender can send before it arrives:

1. **Is there anything a website can do to make WhatsApp attach the preview to a message that is sent immediately after pasting?** Or is this structurally a race the sender can always lose, no matter how fast we are?

2. **Does WhatsApp Web behave differently from the phone app here?** On a phone the same paste-and-send-fast pattern seems to produce the card more often. Is the phone app more willing to attach a preview that arrives after send, or to update a message in place?

3. **Does `?text=` prefilling change this?** Our button opens `https://web.whatsapp.com/send?text={url}`, so the URL is placed in the compose box by WhatsApp itself rather than typed or pasted by a person. Does a URL that arrives that way get crawled on the same schedule as a pasted one, later, or not at all until the field is touched?

4. **Is there a first-crawl penalty we are not seeing from the outside?** For a URL WhatsApp has never encountered, is the first fetch queued asynchronously — so that the first send is essentially guaranteed to go without a card, regardless of our speed?

5. **Given all of the above, what is the honest best case?** If our side is already ~1 s and edge-cached, is there any remaining engineering lever that changes the laptop outcome — or is the correct answer to tell the client that a preview needs a moment to appear before sending, and design our UI to say so?

## 7. One thing still unexplained on our side

Our poster JPEG is stored in Postgres and served from there, and it is being **rebuilt on every request** even though it should be served from storage. The diagnostic headers show the computed and stored fingerprints are now identical:

```
X-Og-Cache: miss
X-Og-Key:        sz1pzp
X-Og-Stored-Key: sz1pzp     ← the same
```

And reading that row by hand returns exactly what is expected — a Buffer, 34,833 bytes, beginning `ffd8ff`, fingerprint matching. So the comparison succeeds and the read still returns nothing. I have deployed a change that records the reason and reports it on the response, but the backend deployment is queued again.

This does not affect the timings above, because the image is served from Vercel's edge cache, not from our application. But it is wasted work on every cache-miss request and I intend to remove it.

I am already planning your Phase 2 — generate the card once at publish time, store it in object storage, take the signed Cloudflare thumbnail out of the preview path, and gate the Share button on the card existing. **Given the measurements above, do you still consider that the highest-value change, or does the 2–4 second WhatsApp-side delay make it a smaller win than it first appeared?**

## Stack, unchanged from before

React 18 + Vite frontend and Node 20 + Express 4 API, both on Vercel serverless, two separate projects. PostgreSQL on Supabase through the transaction pooler, raw SQL via `pg`. Video on Cloudflare Stream with signed playback and signed thumbnails. No custom domain yet — everything on `*.vercel.app`.
