# Real-device checklist — for Waqas

**This is deliberately short.** WebKit now runs on the build machine, so Safari's layout,
scrolling, first-tap behaviour, login, navigation, overflow and responsiveness are already
tested and recorded in `M2-VERIFY.md` on WebKit desktop, an iPhone 14 profile and an iPad Pro 11
profile with touch **and** a mouse. Re-doing those by hand would tell us nothing new.

What is left is only what a headless browser genuinely cannot do. There are three kinds:

1. **Anything that has to decode video.** Playwright's WebKit has no Media Source Extensions
   and no native HLS, so Cloudflare's player never produces a frame there. Real Safari has
   both. Everything about playback, adverts and resume on Safari is therefore untested.
2. **Anything that leaves the browser** — handing a link to WhatsApp, the iOS share sheet.
3. **Anything the operating system does to the browser** — Low Power Mode, the URL bar
   collapsing as you scroll, a tab being reclaimed in the background.

Test on the **client's own devices if possible**: a MacBook with Safari, and an iPad. Otherwise
any iPhone and any iPad.

**Section 2 note:** the final regression (`REGRESSION-FINAL.md`, 2026-09-06) found the one live
advertising campaign was failing to show on *every* engine tested, Chrome included — not a
Safari-only gap. This was root-caused and fixed 2026-09-07 (the pre-roll's own "never started"
timeout was too short for a cold connection) and re-confirmed live. Section 2 below is worth its
full five repeats again — it is no longer a known-broken item, and a real phone is genuinely the
one thing left this fix hasn't been checked against.

---

## Before you start

- Sign in as a normal viewer, not as an administrator or a creator. Staff and creators can watch
  everything without paying, so a paywall test on a staff account proves nothing.
- Use the e2e viewer in `E2E-ACCOUNTS.md`, or make a fresh account through the sign-up form.
- Note the device, the OS version and the browser version at the top of your results.

---

## 1 · Safari can actually play a video

The single most important item on this list. Everything else about playback is measured; this
is the one thing that is not.

| ☐ | Device | URL | Do this | Expect |
|---|---|---|---|---|
| ☐ | MacBook · Safari | `/watch/how-to-cook-pilau-properly` | Open it and wait | Picture and sound within about 4 seconds. Not a spinner that never ends. |
| ☐ | iPhone · Safari | same | Open it and wait | Same. |
| ☐ | iPad · Safari | same | Open it and wait | Same. |
| ☐ | iPhone · Safari | `/watch/live-at-arusha-full-set` | Let the preview run to its cut-off (3:37) | It stops by itself and the purple Unlock panel appears. |

**If any of these shows a spinner for more than about 15 seconds, stop and record it.** That is
the one outcome the automated tests could not have caught.

## 2 · Free + Ads — the advert, on Safari

**Updated 2026-09-11 (PROMPT B2).** Two more fixes landed since the note above: the loading
message used to go dark for a measured 4.4s between the player reporting "ready" and the advert
actually airing (report2.txt §4) — it now stays up the whole wait, changing from "Advert loading…"
to "Advert starting…" partway through. Separately, a pre-roll now has an admin-configurable target
length (`preroll_target_seconds`, default 10s) — a longer creative auto-completes there instead of
running to its own end. Both were verified with a Playwright DOM-timing trace (headless Chromium
can play this specific campaign's Cloudflare video, unlike the general Safari/MSE gap this document
is otherwise about) — see report2.txt §4's RESOLUTION for the measured before/after. **What still
needs real iOS specifically:** Safari's own autoplay policy is stricter than desktop Chrome's, and
Playwright's WebKit cannot produce a frame at all (this document's own opening note) — whether the
muted-autoplay kick that starts the pre-roll actually fires on a real iPhone without a tap is the
one thing no tool on this machine can confirm.

| ☐ | Device | URL | Do this | Expect |
|---|---|---|---|---|
| ☐ | MacBook · Safari | `/watch/how-to-cook-pilau-properly`, signed out | Open it | The advert starts playing on its own (muted), or shows a single tap-to-play prompt if the browser refuses autoplay — never a silent freeze with no advert and no prompt. |
| ☐ | iPhone · Safari | same | Open it | Same — this is the real autoplay-policy test no headless tool can run. |
| ☐ | iPad · Safari | same | Open it | Same. |
| ☐ | any | same | Watch the loading text as the advert loads | Something is always on screen — "Advert loading…" then "Advert starting…" — never a blank/frozen poster with no text at all. |
| ☐ | any | same | Watch the skip countdown | The countdown starts when the advert has picture, not while the screen is still black. |

Run each of these **five times**. An advert fault that happens once in five is still a fault.

## 3 · WhatsApp, actually sent

The card, the crawler, the image size and the cache are all verified from the command line —
what cannot be verified is what the WhatsApp app itself does with the link.

**Updated 2026-09-11 (PROMPT B2, report2.txt §6).** An exhaustive live header-shape matrix
(WhatsApp on every platform, Electron-based WhatsApp Desktop, a bare no-Sec-Fetch GET) all
correctly receive the right preview server-side — no server defect was found. The remaining "still
raw" cases most likely match a **WhatsApp-side compose/send race**: it builds the preview while
you're still typing, and pressing Send before that finishes goes out as a bare link on any working
site, not just this one — our own server answers in well under half a second either way. What was
built anyway: the moment a video goes live, the server now pre-warms its own preview cache, so the
very first share of a brand-new video no longer pays a cold-cache delay. **This does not make the
send-race disappear** — it only removes one contributor to it. This section is still the one
genuine test of the underlying race a real phone can run that nothing else here can.

| ☐ | Device | URL | Do this | Expect |
|---|---|---|---|---|
| ☐ | iPhone · Safari | any `/watch/…` | Share → WhatsApp | WhatsApp opens. Not a browser page saying "Something went wrong". |
| ☐ | iPhone | in the chat | Look at what was pasted | A picture card with the video's title, not a bare link. |
| ☐ | iPhone | in the chat | Wait a moment before sending | The card appears in the compose box before you press send. If you send instantly it may go as a plain link — that is WhatsApp fetching the preview, not our site. |
| ☐ | iPhone | in the chat | Tap the card | It opens the video's page, and the video plays. |
| ☐ | iPad · Safari | any `/watch/…` | Share → WhatsApp | WhatsApp opens. This is the exact case that used to say "the application couldn't be opened". |
| ☐ | any | Share → Copy link | Paste it into a new WhatsApp chat | Same card. |

## 4 · Low Power Mode, iOS

Cannot be emulated at all. Low Power Mode throttles timers and blocks autoplay.

| ☐ | Device | Do this | Expect |
|---|---|---|---|
| ☐ | iPhone | Settings → Battery → Low Power Mode **on**, then open any video | It still plays, even if it needs one tap on the play button. It must not sit on a spinner. |
| ☐ | iPhone | With Low Power Mode on, buy a video with the test payment | The sheet still closes by itself and the film continues. |

## 5 · The URL bar, while scrolling

The reported "screen vibrates" is consistent with iOS resizing a full-height section as the URL
bar collapses. That collapse does not exist in any headless browser, so this cannot be checked
here at all.

| ☐ | Device | URL | Do this | Expect |
|---|---|---|---|---|
| ☐ | iPhone · Safari | `/` | Scroll down slowly, then up, several times | Nothing jumps or shivers as the URL bar hides and returns. |
| ☐ | iPhone · Safari | `/explore` | Same | Same. This is the page that was missing the fix. |
| ☐ | iPad · Safari | `/explore` | Same | Same. |
| ☐ | iPhone · Safari | `/` | Scroll to the very bottom | The footer is the last thing. No empty band under it. |

## 6 · A backgrounded tab

| ☐ | Device | Do this | Expect |
|---|---|---|---|
| ☐ | iPhone · Safari | Play a video to about 0:42, swap to another app, wait a minute, come back — or let Safari discard the tab and reopen it | The video resumes at about 0:42, not at the start. |
| ☐ | iPhone · Safari | Then open My Library | The video is in **Continue Watching** with its progress bar at roughly the right place. |

## 7 · Anything that looks wrong

| ☐ | Device | Do this | Expect |
|---|---|---|---|
| ☐ | iPhone and iPad | Open `/`, `/explore`, a video, `/dashboard`, and a creator's page | Nothing is cut off at the right edge. No text sits on top of other text. |
| ☐ | iPad **with a keyboard or trackpad** | Tap a video card, Log in, Unlock, Share, the logo | Each one reacts to the **first** tap. This is the profile that used to need two. |

## 8 · Poster continuity, and the share buttons this pass touched

New from the Prompt B fix pass. The poster fix (Issue 2) and the share-button changes (Issue 5)
are confirmed correct by code reading and by the regression tests that guard the old bugs.

**Corrected 2026-09-08.** The "<400ms" figure below was written when no browser automation was
available in this environment and was always a design target, not a measured number — the
original text said so. Playwright is now available, and the real, desktop-Chromium figure has
been measured for the first time: **median 1123ms `[1083–2041]`** — dominated by the
`/api/videos/:slug` round trip itself (~700ms of it), which the poster fix never claimed to
shorten; it only ever changed what is on screen *during* that wait. What still needs a real
phone is whether that number feels different there — network, GPU and thermal state all differ
from this desktop measurement. See `FINAL-SIGNOFF.md` §5 for the full breakdown.

| ☐ | Device | URL | Do this | Expect |
|---|---|---|---|---|
| ☐ | iPhone · Safari | any `/watch/…`, tapped from a fresh Explore card | Time from the tap to the poster appearing | Roughly 1.1s on desktop Chromium, now measured — check whether a real phone feels notably different, not whether it clears 400ms (that figure was never a confirmed target). |
| ☐ | iPhone · Safari | same | Time from the tap to the film actually moving | No slower than before this pass (the recorded baseline: roughly 2.4–3.6s on a warm connection) **for a video with no ads**. A Free+Ads video now genuinely plays its advert first (fixed 2026-09-07), so it will visibly take longer to reach content than it used to — that is the ad working, not a regression. |
| ☐ | MacBook · Safari | any `/watch/…` | Share → Facebook | Opens Facebook (a browser tab to the sharer page on a laptop is correct — there is no better native option on desktop). |
| ☐ | Android phone | any `/watch/…` | Share → Facebook | The Facebook **app** opens, not just a browser tab — this is the one platform this pass's fix specifically changed. |
| ☐ | iPhone · Safari | any `/watch/…` | Share → Save 60s promo clip | Either a file actually saves, or the clip opens/plays in place (iOS Safari does not support saving from a plain link — this is expected, not a bug) — but never a silently blank tap with nothing visibly happening. |
| ☐ | iPad · Safari | same | Same | Same. |

---

## Recording what you find

For anything that fails, note: **device, OS version, browser version, the URL, what you did,
what happened, and the time**. A screen recording is worth more than a description. The time
matters because the server logs can be lined up against it.

Send it back as it is — a failure with detail is more useful than a tidy summary.
