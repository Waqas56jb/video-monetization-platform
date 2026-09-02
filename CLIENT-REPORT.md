# MTONYO+ — what was wrong, what was changed, how it was checked

Every item you reported, with the cause, the change, and the measurement that shows it. Where
something is still unknown, it says so and says why.

**A note on what "tested" means here.** Safari now runs on the build machine, so the layout,
scrolling, first-tap behaviour, login, navigation and responsiveness figures below are from a
real WebKit engine — desktop, an iPhone 14 profile, and an iPad Pro with touch *and* a mouse
attached, which is the configuration that caused the two-tap problem. There is one thing that
build of Safari cannot do: decode video. It has no Media Source Extensions, which is what
Cloudflare's player uses, so on that engine no video ever plays. **Every measurement about
playback, adverts and resuming therefore comes from Chrome**, and the short list of things that
genuinely still need a phone is at the end of this document.

---

## Contents

1. [Speed and freezing](#1-speed-and-freezing)
2. [The player never looks stuck](#2-the-player-never-looks-stuck)
3. [The advert on a Free + Ads video](#3-the-advert-on-a-free--ads-video)
4. [Payment, unlocking and resuming](#4-payment-unlocking-and-resuming)
5. [Logging in](#5-logging-in)
6. [Taps that needed two tries](#6-taps-that-needed-two-tries)
7. [Watch and Create accounts](#7-watch-and-create-accounts)
8. [The card that only opened from its title](#8-the-card-that-only-opened-from-its-title)
9. [Scrolling, blank space and things moving](#9-scrolling-blank-space-and-things-moving)
10. [Sharing and WhatsApp](#10-sharing-and-whatsapp)
11. [Following a creator](#11-following-a-creator)
12. [My Library — the four rows](#12-my-library--the-four-rows)
13. [Reaching the creator from anywhere](#13-reaching-the-creator-from-anywhere)
14. [The other items you reported](#14-the-other-items-you-reported)
15. [The numbers behind "3.5 seconds"](#15-the-numbers-behind-35-seconds)
16. [What still needs a phone](#16-what-still-needs-a-phone)
17. [Test data on production](#17-test-data-on-production)

---

## 1 · Speed and freezing

### "It takes 20–30 seconds to start" · "4–7 second freezes going back to Home"

**PROBLEM.** Videos took 20–30 seconds to start, and moving around the site froze for several
seconds at a time.

**ROOT CAUSE.** Three separate things, none of which was one slow function.

- The watch page waited for **two** API calls before it could build the player, and one of them
  made about seven database round trips in sequence — including three schema statements that
  ran on every single video open, purely to find out whether a share image existed.
- An image-processing library was being loaded on every cold start of the server, defeating the
  lazy loading that was supposed to keep start-up cheap.
- The home page opened four API requests, two of which asked for the same thing.

**FIX MADE.** The share-image question was moved onto the video's own row, so it costs nothing
on the watch path. The duplicate home request was removed — Home now makes three requests, not
four. The player is created as soon as we know what to play.

**HOW TESTED.** Chrome and Safari, production, medians of five runs with a warm-up discarded.

| | at the start | after the first round | **now** |
|---|---|---|---|
| Home shows its first card — desktop, cold | 3339 ms | 2336 ms | **1822 ms** |
| Home shows its first card — desktop, warm | 1022 ms | 1047 ms | **1021 ms** |
| Home shows its first card — iPhone profile, cold | 6519 ms | 2502 ms | **2064 ms** |
| Home shows its first card — iPhone profile, warm | 1170 ms | 898 ms | **~1050 ms** |
| Tap a video → picture, iPhone profile | — | 3108 / 3585 / 3218 ms | **2390 / 2807 / 3396 ms** |

Home is now roughly **twice as fast to show its first card** as when this started, cold, on both
a desktop and a phone. Two of the three videos start 700–800 ms sooner than the recorded
baseline; the third is 178 ms slower, which is 5.5 % on a measurement whose own spread across
runs is 1.5 seconds.

**One figure moved the wrong way and it should not be rounded away.** The *warm* iPhone
first-card time went from 898 ms to about 1050 ms. The cause was measured, not guessed: the
JavaScript bundle grew by 5.8 % (421,688 → 445,949 bytes) to carry the four features added in
this round — Follow, My List, Continue Watching and the Save control. A warm visit already has
that file cached and spends its time reading it, which is exactly where extra code shows up. No
new network requests were added: signed out, Home still makes the same three. If that 150 ms
matters more than the features, the honest way to get it back is to load those parts only on the
pages that use them — not to remove them.

**The freeze going back to Home does not reproduce.** Measured on both engines: going back from
a video to Home takes **62–169 ms** on Chrome, and **65 ms** in the cross-browser suite. Whatever
you experienced, it is not this navigation as the site stands today. If it happens again, please
note the time — the server logs can be lined up against it.

**The part we cannot remove is Cloudflare's**, and it is about 3.5 seconds of the wait. The full
trace is in section 15, written out so you can check it yourself.

---

## 2 · The player never looks stuck

**PROBLEM.** While a video was loading there was nothing on screen but a spinner, and if it
failed there was no way to try again — you were shown a dead end.

**ROOT CAUSE.** Two things. There was no sequence of messages, only a spinner. And the retry
button **could not appear at all**: the code that drew the waiting states was switched off the
moment an error was recorded, and the 20-second timeout recorded an error — so the timeout
destroyed the very screen that was meant to offer the retry.

**FIX MADE.** A poster frame immediately, "Connecting…" at 1.5 seconds, "Slow connection" at 5
seconds, and a retry button at 12 seconds that now genuinely renders. The overall timeout came
down from 20 seconds to 12. If a video resumes at 0:00 after a purchase, a caption now says why
rather than looking like it forgot.

**HOW TESTED.** The player's own response was blocked, and the states timed on three profiles.

| profile | "Connecting" | "Slow connection" | retry | retry clickable |
|---|---|---|---|---|
| Chrome desktop | 5454 ms | 8493 ms | 15567 ms | ✅ |
| Safari desktop | 9025 ms | 12487 ms | 19473 ms | ✅ |
| iPhone 14 · Safari | 9004 ms | 12072 ms | 19071 ms | ✅ |

The gaps between the stages are 3.5 s and 7 s, matching the settings exactly. The absolute
numbers are larger because the clock here starts when the page is requested while the site's
timer starts when the player is created.

---

## 3 · The advert on a Free + Ads video

**PROBLEM.** "Advert loading…" sat on screen. The skip countdown started while the screen was
still black, so the countdown ran before the advert had shown anything.

**ROOT CAUSE.** The countdown was started when the advert was *requested* rather than when it
had picture. And the overlay had no time limit of its own — if the advert never arrived, nothing
took the overlay away.

**FIX MADE.** The countdown starts from the advert's own media time, so it cannot run over a
black screen. The overlay clears on failure rather than waiting for ever, and the content
underneath stays paused until the advert is genuinely done.

**HOW TESTED — and this is the item with the biggest gap, so it is worth being exact.**

On **Chrome**, in the cross-browser suite, on three profiles — desktop, a Pixel 7 and a phone on
Fast 3G — the content reaches picture in **0.6 to 0.9 seconds** and **no advert overlay is left
on screen**. That is a pass on every Chrome profile.

On **Safari it could not be judged at all**, and no conclusion should be drawn from that in
either direction. The Safari engine available for automated testing has no Media Source
Extensions, which is what Cloudflare's player uses, so on it *no* video plays — the advert, the
film, everything sits at zero. An earlier round of this work read that as "on Safari the Free +
Ads path does not play at all" and **that reading was wrong and has been retracted**: it was the
test environment, not the product.

What did survive that investigation, and is real: the advert overlay **does** clear — measured at
4–8 seconds, with the advert state going from loading to nothing and the layer being removed. So
the "spinner stuck for ever" reading was wrong as well.

**Free + Ads is not known to be broken on Safari. It is untested there**, and it is item 2 on the
checklist for your devices. Please run it five times on each — an advert fault that happens once
in five is still a fault.

---

## 4 · Payment, unlocking and resuming

**PROBLEM.** After paying, the video restarted from the beginning instead of continuing. There
was also a report that buying one video unlocked others.

**ROOT CAUSE (restart).** The position was held in the page's memory, so anything that reloaded
lost it — and paying reloads.

**ROOT CAUSE (other videos unlocking).** Not reproducible in the code, and four independent
checks in the server prevent it. The likely explanation is the account used: **an administrator
or the video's own creator can watch anything without paying**, deliberately, because reviewing
a video means watching it. Browsing the public site while signed in as staff opens every video.
The site now says *why* a video is unlocked — "you bought this", "you are staff", "this is your
video" — so that case is visible instead of looking like a broken paywall.

**FIX MADE.** The position is stored against your account in the database, so it survives a
reload, a sign-out, and a different device. Paying closes the payment sheet by itself and the
same film continues from the second the preview stopped, with no second Play button.

**HOW TESTED.** Chrome desktop and a Pixel 7, **five full runs each**, every run with a **brand
new account created through the sign-up form that had never paid for anything** — because an
account that already owns the film proves nothing.

| | Chrome desktop | Pixel 7 |
|---|---|---|
| Preview stops by itself | 5/5 | 5/5 |
| Payment sheet closes itself | 5/5 (7.3–10.0 s) | 5/5 (7.4–8.3 s) |
| Server grants full access | 5/5 | 5/5 |
| **Film continues from the stop point** | **5/5** — 20.0 s against a 19.9 s stop | **5/5** — same |
| Still unlocked after logging out and back in | 5/5 | 5/5 |
| A **second** paid title stays locked | 5/5 | 5/5 |

Access is confirmed **from the server** before the picture is believed. A film that appears to
play proves nothing about what was granted; the server's own answer does.

Both failure paths were tested too. "Test declined" gives *"Payment not completed · Insufficient
balance in the mobile money account · Nothing was charged. You can try again with the same
number"* and a **Try again** button; "Test cancelled" gives the equivalent. After each one the
video is **still locked**, checked from the server.

**On a small phone screen**, the payment sheet was checked at 375×667 and 390×664 with the
keyboard up (the viewport shortened by 48 %, which is what a keyboard does): the number field
sits at 91–140 px of a 347 px screen and the Pay button at 160–209 px. Both stay visible.
Nothing needed changing.

**One thing was changed as a precaution.** While waiting for a payment the page asked the server
for its status once a second. A mobile-money prompt lasts three minutes, so a single open payment
sheet could make 180 requests against a limit of 120 a minute — a viewer who left the sheet open
while browsing could have blocked their own purchase. It now asks every two seconds. Measured
across the whole journey: **41–47 requests in the busiest minute, against a limit of 120.**

---

## 5 · Logging in

**PROBLEM.** "Login never works the first time." And after logging in, you were not returned to
what you were doing.

**ROOT CAUSE.** Two separate faults that looked like one.

- **Autofill.** When Safari fills a saved email and password it writes them straight into the
  page without telling it. The form still held two empty boxes, so the first attempt submitted
  nothing, failed, and the second — after a keystroke had woken the form up — worked.
- **The destination was lost.** The Unlock button remembered which video you were on, but the
  **Log in** button in the header did not. Signing in from there worked perfectly and dropped
  you on your dashboard with no way back to the film you were watching.

**FIX MADE.** The form now reads the boxes themselves on submit, not its own copy. And the
header's Log in — on desktop and in the mobile menu — carries the page you were on.

**HOW TESTED.** A fresh private session per run, with the fields filled exactly the way autofill
fills them: the value set with no event, which is the whole bug. Twenty runs.

| entry point | profile | one submit, and back on the video |
|---|---|---|
| header Log in | Safari desktop | **5/5** |
| header Log in | iPhone 14 · Safari | **5/5** |
| Unlock | Safari desktop | **5/5** |
| Unlock | iPhone 14 · Safari | **5/5** |

Never a second attempt, never an error, never the dashboard. Signing in takes 3.4 s on desktop
and 1.4 s on the iPhone profile from here, and the page moves within about 15 ms of the answer
arriving — the wait is the trip to the server, not the site.

---

## 6 · Taps that needed two tries

**PROBLEM.** On iPhone and iPad, buttons and cards often needed two taps.

**ROOT CAUSE.** Hover effects. Most were already switched off for touch screens, but the guard
used was "does this device have hover?" — and **an iPad with a Magic Keyboard or trackpad
answers yes**. One rule that physically moved an element was outside the correct guard, so on
that exact setup the first tap was spent applying a hover state and the second did what you
wanted.

**FIX MADE.** The rule was moved inside the guard that also asks whether the pointer is *fine* —
which is what separates a mouse from a finger. A check now runs on every build that finds every
hover rule in the stylesheet that moves something and fails if any of them is unguarded.

**HOW TESTED.**

```
hover rules that move something: 21 (21 guarded)
all guarded
```

And on the device profile that caused it — **iPad Pro 11 with touch and a mouse**, plus iPhone 14
and iPad without a mouse — a card navigates on **tap #1** on all three. The same is checked in
the cross-browser suite on every profile.

Two of the first version's findings were **false alarms** and are recorded as such: two rules
that looked unguarded were inside a touch-only block, where hover rules exist precisely to
*cancel* movement.

---

## 7 · Watch and Create accounts

**PROBLEM.** In your words: *"I created account for creator in create new account, it created my
account as viewer."* It did. And then the Create login refused you.

**ROOT CAUSE.** Signing up on Create never made a Create account. It made a **Watch** account,
marked you as needing to apply, and sent you to an application form — because the Create side
could only be granted by an administrator approving that application. So you were given an
account you did not ask for, denied the one you did, and the login was correct to refuse you:
you genuinely had no Create account.

**FIX MADE.** The side you choose is the side that is created, in both directions:

| you sign up on | you get | you do **not** get |
|---|---|---|
| **Create** | a Creator account — log in on Create, studio opens | a Watch account |
| **Watch** | a Watch account — log in on Watch, library opens | a Creator account |

**One email can hold both**, added one at a time with the same password. Sign up on Create, then
sign up on Watch with the same email, and you have both — the login for each works. Asking again
for a side you already have says so plainly instead of failing oddly.

**You can only log in on a side you have.** That was already true; what changed is the message.
It used to say "apply and wait for us to approve you", which is no longer how you get in. It now
says which account is missing and offers to create it, and the login screen shows a link that
does exactly that.

**The dashboard menu follows the same rule.** A Create-only account used to be shown My Library,
Explore Videos and My Purchases — a Watch account's tools, on an account with no Watch side. It
now shows only what that account has, plus an entry to add the other side.

**WHAT DID NOT CHANGE, and please read this line.** A Creator account opens the **studio** —
upload a video, fill in its details, submit it. It does **not** publish anything. Every video
still reaches viewers only when **you approve it**. The gate moved from "who may open the studio"
to "what may reach viewers", which is where your review queue already was. A creator account also
gets no free access to anyone else's paid videos.

**HOW TESTED.** Against the live site, at the API and through the actual screens on Chrome and
an iPhone:

| | result |
|---|---|
| Sign up on Create | `sides {creator: true, viewer: false}` — no Watch account made behind your back |
| Log in on Create | works, studio profile returned |
| Log in on Watch with that email | refused, and says how to add a Watch account |
| Sign up on Watch, same email | adds the side — now `{creator: true, viewer: true}`, both logins work |
| Sign up again on a side you have | refused as a duplicate, names the side |
| Sign up on Watch | `sides {creator: false, viewer: true}` — no Creator account made behind your back |
| Log in on Create with that email | refused, and says how to add a Creator account |
| A Watch account reaching the studio | refused |
| Through the sign-up screen on Create | lands in the studio, not the application form |
| A brand-new Creator account's videos on the public site | none — approval is still yours |

The dashboard menus, checked on a Create-only and a Watch-only account:

```
Create only:  Dashboard · Uploads · Drafts · Published · Analytics · Revenue & Payouts
              · Profile settings · Settings · Add a Watch account
Watch only:   My Library · Explore Videos · My Purchases · My Activity
              · Profile settings · Settings · Add a Creator account
```

---

## 8 · The card that only opened from its title

**PROBLEM.** You reported this after the last handover, and you were right. Pressing a video's
**title** opened it. Pressing the **picture**, or anywhere else on the card, did nothing — except
start the loading bar at the top of the screen, which then kept going. The page looked hung.

**ROOT CAUSE. This one was ours, and it was new.** Adding Follow and Save to the cards meant the
card could no longer be one big link — a button inside a link is invalid HTML that browsers
resolve by quietly breaking the link. The replacement was an invisible layer over the tile that
carried the link. Two things were wrong with it.

- The pulsing play icon is stretched over the whole picture, and it sat **above** that invisible
  layer. Every press on the poster hit the icon, which does nothing.
- Even after that was fixed, the picture still did not open. When you press a card it dims
  slightly and shrinks — that press effect changes how the browser stacks the layers *while your
  finger is down*, and the invisible layer lost to the poster image mid-press. The press started
  on the link and finished on the image, and a press that starts and ends on two different things
  never counts as a click.

**FIX MADE.** Everything decorative over the picture is now ignored by presses. And the layer
that opens the video is a **real element** rather than a generated one, so it cannot be
re-stacked out from under your finger. The loading bar was the second half of the same complaint:
pressing Save or Follow also started it, and those never navigate, so it ran to its eight-second
limit with nothing happening. It no longer starts for presses meant for those buttons.

**HOW TESTED.** A new suite presses **every part of a card** on five profiles — Chrome desktop,
Safari desktop, iPhone 14, iPad with a mouse, and a Pixel 7. Nine checks each, 45 in total, all
passing:

| | result |
|---|---|
| one press on the **picture** | opens the video, on all five |
| one press on the title | opens the video, on all five |
| one press on the price row | opens the video, on all five |
| one press on the creator's name | opens the creator's page, on all five |
| Save, signed out | goes to sign in, carrying the page you were on |
| Save, signed in | toggles on one press, does not open the video |
| the loading bar after a Save press | not left running |

**Why our tests did not catch it, which is the part worth telling you.** They were clicking the
**title** — the one part of the card that was never broken — and so they passed on all seven
browser profiles while the picture was dead. A test that presses the part nobody aims at is not a
test. They press the picture now, and the new suite presses every part.

I am sorry this reached you. It was found in a minute of real use and should have been found
before it shipped.

---

## 9 · Scrolling, blank space and things moving

**PROBLEM.** "The screen vibrates when I scroll." A blank band at the bottom of pages. The page
jumping around as it loads.

**ROOT CAUSE.** Sections that were exactly one screen tall used a measurement that changes as
iOS hides and shows the address bar while you scroll. The section resizes under your finger, and
the page grows and shrinks — which is what "vibrating" looks like. Explore was the last page
still using the old measurement.

**FIX MADE.** Every full-height section now uses the measurement that ignores the address bar.

**HOW TESTED.** A scripted ten-second scroll, down and back, on Safari desktop and an iPad Pro
profile, on Home, Explore and a video page.

| profile · page | pauses over 50 ms | worst frame | layout shift |
|---|---|---|---|
| Safari desktop `/` | 2 | 116 ms | **0** |
| Safari desktop `/explore` | 4 | 154 ms | **0** |
| iPad Pro 11 `/explore` | **0** | 23 ms | **0** |
| iPad Pro 11 `/watch/…` | 1 | 154 ms | **0** |

**The blank band is gone.** Measured as the gap between the lowest visible thing on the page and
the bottom of the document, on Home, Explore, a video page and the dashboard: every figure is
**negative** — content reaches past the bottom, so there is no empty space anywhere. The bar was
40 px.

**Page jumping on load: 0.0000** on all four profiles. The industry threshold is 0.1.

**Being honest about the limit.** The vibration does not reproduce on a headless Safari, and it
cannot — there is no address bar to collapse. The fix addresses the cause; confirming it needs
your iPhone, and it is on the checklist.

---

## 10 · Sharing and WhatsApp

**PROBLEM.** Sharing to WhatsApp delivered a bare link with no picture. On iPad it said *"The
application couldn't be opened."* The Share button froze for 60–90 seconds.

**ROOT CAUSE.** Three things. The link handed to WhatsApp pointed at a marketing page rather
than the app. The preview card was being generated on demand, so the first person to share a
video waited for it. And there were **three different implementations** of the WhatsApp link in
the codebase, and the wrong one was being used — the correct one had been written and nothing
imported it.

**FIX MADE.** The correct implementation is now the one in use. Cards are built ahead of time
and cached. The share sheet opens immediately.

**HOW TESTED.** All eight published videos, from the command line, as WhatsApp's own crawler:

- the crawler gets the crawler document, not the app shell
- each has its **own** title, description and image — not the site's generic one
- the image is **1200×630 JPEG, 16–57 KB** against a 300 KB limit
- served from cache on both fetches, first byte in 0.32–0.82 s
- the same URL from an iPhone gets the normal app, as it should

**What this cannot prove**, and it is on the checklist: what the card looks like inside a real
WhatsApp conversation, and whether tapping it opens the app. One known behaviour worth expecting:
if you paste a link and press send instantly, WhatsApp may send it before it has fetched the
picture. That is WhatsApp's timing, not the site's — wait for the card to appear in the compose
box.

---

## 11 · Following a creator

**PROBLEM.** Follows did not stick.

**ROOT CAUSE.** Two things, and the second is the more serious.

- **Follow was almost unreachable.** It existed only on a creator's own page — and nothing
  linked to that page from anywhere people actually land. Every shared link and every tap from
  Explore goes to a video page, which had no Follow button at all.
- **The follower count was a number maintained by hand.** Delete a viewer's account and their
  follow rows vanish, but every creator they followed **kept the inflated number**, with nothing
  to correct it. This is the same class of fault you caught before, when the admin showed 3.2K
  views against 67 actual ones.

**FIX MADE.** Follow is now on the video page and on every card, all using one control so the
state cannot disagree between screens. The button changes the instant you press it and puts
itself back only if the server refuses. And the count is now maintained by the **database**, not
by application code — it is recalculated from the follow records themselves on every change,
including when an account is deleted.

**HOW TESTED.** Against production:

```
follow, then follow again  → 200, followers 1 both times   (no double count)
the count matches the follow records                       ✅
a blocked creator's follower can still unfollow            ✅  (this was a 404 before)
across all 14 creators: 0 disagreeing with the records     ✅
```

The database's own correction was proved on live data — inserting a follow moved the count 1→2,
deleting it moved it back — and the deleted-account case was proved inside a transaction that was
then rolled back, so nothing on your site was changed by the test.

In the browser, the button changes **while the request is still in flight** (the request is held
open by the test, so this is not a stopwatch reading), stays changed after a reload, and survives
logging out and back in. Cards carry it on 8 of 8, and tapping a card still opens the video on
the first tap.

**A third fault was found here, and it was ours.** Adding the Follow button to the video page
required restructuring how that row is clickable, and the first version of that change spread an
invisible layer across the page that **covered the Unlock button** — on a phone you could not
buy the video. It was caught by the automated purchase journey on a Pixel 7 before it could
reach you, fixed, and a test now exists specifically to stop it happening again.

---

## 12 · My Library — the four rows

**PROBLEM.** You asked for Continue Watching, Purchased, My List and Recently Watched. Only
Purchased existed.

**ROOT CAUSE.** Not a fault — three of the four were never built.

**FIX MADE.** All four, in that order. Plus:

- **A Save button on every card and on the video page**, so My List can be filled.
- **Remove from history**, which takes a video out of both history rows.
- **Continue Watching on the home page** for signed-in viewers, above Trending. It shows nothing
  at all if you have nothing to continue.

**One decision worth telling you about.** Continue Watching and Recently Watched are the same
records read two ways, so "Remove from history" affects both. It **hides** the video rather than
deleting the record — your place in the film is kept, so re-opening it still continues from where
you were. The commonest reason to use this control is wanting a title off a shared screen, not
wanting to lose your place. Watching more of a hidden video puts it back automatically.

**Behind this**, a fault was found in how positions were saved. When you close a tab, the browser
**cancels** any request still in progress — so the "save where I got to" that ran as the page
closed usually never arrived. On a phone that meant coming back to a position up to ten seconds
stale, or nothing at all if you had watched for less than ten seconds. It now uses the one method
browsers guarantee to deliver after a page is gone, and it also saves when you pause, when you
seek, and when the tab is merely backgrounded — which on iOS is the moment that matters, because
a tab the system later kills may never get a proper closing signal.

**HOW TESTED.**

| | result |
|---|---|
| Played to 0:42, backgrounded, tab killed — Chrome desktop | server has **42 s** |
| Same — Pixel 7 | server has **42 s** |
| Same test of the transport — Safari desktop and iPhone 14 | position stored ✅ |
| Pausing writes immediately, without waiting for the timer | 62 s after a pause at 0:62 |
| Four rows, in your order, on Chrome, Safari and iPhone | ✅ all three |
| Save changes before the round trip finishes | ✅ all three |
| Remove from history — tile goes at once, still gone after a reload | ✅ all three |
| Requests needed to open My Library | **5 on desktop, 6 on iPhone** (budget: 8) |

"Remove from history" was checked against the **database**, not just the screen, because
"disappeared from the list" and "your place was thrown away" look identical from outside. The
record is hidden and the position — 62 seconds — is intact.

**A second fault of ours was found here too**, and only by watching the network traffic: the new
save-on-close method can only send one kind of request, and the server was set up to accept a
different kind. Every one was rejected — **silently**, because that method reports "queued" and
never "delivered". The page reported success and nothing was stored. It would have shipped as
"Continue Watching sometimes forgets where you were."

---

## 13 · Reaching the creator from anywhere

**PROBLEM.** A creator's name appeared on every card as plain text. The only way to reach their
page was from a video page.

**FIX MADE.** The name on every card is a link. Every release on a creator's page has its own
**Watch** and **Share** buttons — Share opens the same sheet the video page uses, not a
cut-down copy.

**HOW TESTED.** Safari desktop, iPhone 14 and Chrome: 6 releases, 7 Watch and 7 Share controls
(the featured release has them too), no sideways scrolling, Watch opens the video, Share opens
the real sheet with WhatsApp in it. Cards: the creator's name goes to the creator's page on 8 of
8, and the card itself still opens the video on the first tap.

---

## 14 · The other items you reported

Shorter entries, because these were fixed in earlier rounds of this work. Each one names where
the detail lives so you can check it, and says plainly which were re-tested in this round and
which were not.

| What you reported | Cause | Fix | Where the evidence is |
|---|---|---|---|
| **The duration says 3:37 but playback runs to about 5:00** | The card showed the full film's running time while a preview was playing to its own cut-off — two different numbers for two different things, with nothing saying which was which. | The preview stop is the player's own `stopsAtSeconds`, and it is what the paywall triggers on. | Re-tested in this round: the preview halts at 216.9 s against a 217 s cut-off, on every Chrome profile in the cross-browser suite. |
| **Portrait and square videos render tiny inside a black box** | The player stage was always 16:9, so a 886×1920 video became a thin strip in the middle. | The stage takes the file's own shape and grows to the available height. | `videoShape.js` and its tests; the portrait title `rpreplay-final1589783013-2` is one of the three in the speed harness and is in this round's numbers. |
| **The top progress bar animates for ever** | iOS fires two events for one tap, so a tap that did not navigate started the bar twice and left it up for its full 8-second cap. | One warm per card, whichever event arrives first. | Verified in the earlier round with the tap-and-swipe-away test; `VideoCard.test.js` locks it in and runs on every build. |
| **The homepage jumps around on first load** | Content arriving after first paint with no space reserved for it. | Fixed sizes for the pieces that arrive late. | Re-tested in this round: **layout shift 0.0000** on all four profiles, against an industry threshold of 0.1. |
| **A video that had not been approved appeared on Explore** | The public listing did not filter on review status. | It does, and a database rule enforces it as well as the code. | `AUDIT.md` §E21 and the migration that added the publish guard. Not re-tested in this round. |
| **Supabase warned that tables were publicly readable** | Row-level security was not enabled on every table. | Enabled everywhere, with a rule that locks any new table automatically. | Migrations 011, 025 and 026. This round added two tables and both were checked: RLS on, PostgREST revoked, four per-user policies each. |
| **Instagram, TikTok and Facebook open the phone's share sheet rather than the app** | Those platforms do not accept a pre-filled share link from a web page — this is their behaviour, not ours. | The sheet says so, and offers copy-link. | `AUDIT.md` §C15. Unchanged, and it is not something that can be fixed from our side. |
| **Anchor links land underneath the header; a blank area near the bottom** | Pages opened with less top padding than the fixed header is tall. | Every page allows for the header's height, and a test fails the build if one does not. | Re-tested in this round: no blank strip anywhere on four profiles, and the header-padding test runs on every build. |
| **The logo is not clickable on some pages** | It was a plain image on pages that were not the homepage. | It is a link everywhere. | `AUDIT.md` §D20. Not re-tested in this round. |
| **A Paid Premiere should become Free + Ads when its window ends** | The job existed but its schedule did not. | Scheduled, with the expiry logic under test. | `premiere.expire.test.js` and `scheduler.test.js`, both in the 115 server tests that pass. |

**Two things in that table are honest gaps rather than claims**: the unapproved-video listing and
the logo were fixed and verified earlier and were *not* re-tested in this round. If you would
like either re-checked, it is a small piece of work.

---

## 15 · The numbers behind "3.5 seconds"

The section below is reproduced exactly as it was written, including the caveat at the end,
because it is the honest account of what the remaining wait is made of and who owns it.

> ## Floor — what the CDN costs us, and why the target moved to 3.5 s
>
> Roughly **3.5 to 4 seconds of the wait is Cloudflare's, not ours.** Traced on production
> on 2026-08-31, from the moment our page creates the player:
>
> ```
>  861  200  iframe.videodelivery.net/<token>                          the player frame loads
> 1047  301  customer-….cloudflarestream.com/embed/sdk-iframe-integration…js
> 2080  200  (the same script, after the redirect)      ← 1033 ms for one file
> 2483  200  embed/925….chunk.js + embed/10….chunk.js   ← two more before it can start
> 3117  200  …/audio/13…  and  …/video/24…              ← first media
> 3444  200  …/audio/13…  and  …/video/24…              ← and it waits for a second pair
> ```
>
> Two costs sit inside that, and neither is code we control:
>
> **The player's own start-up — about 1.9 seconds.** Cloudflare's embed loads its player
> software inside the video frame before it can show anything. One of those files takes a
> full second on its own, partly because the request is answered with a redirect and has to
> be made twice.
>
> **Filling the buffer — about 1.5 to 2 seconds.** The player fetches roughly two seconds of
> video and audio before it starts, so that playback does not stutter immediately. We
> confirmed it is not waiting for permission or for a tap: playback is requested and granted
> well before this point. It is waiting for data.
>
> **So a 2-second target was not reachable.** It would require the video to begin before
> Cloudflare has finished loading the software that plays it. The revised target is
> **3.5 seconds on a phone on a normal connection**, which is the CDN's floor plus a small,
> honest allowance for our own work: fetching the video's details, deciding what this viewer
> is entitled to, and putting the player on screen.
>
> What we can still remove is on our side of that line, and we are removing it: warming the
> right connections early, not spending the network on videos nobody has asked for, and
> putting the player on screen as soon as we know what to play rather than waiting for
> information the player does not need.
>
> One caveat worth stating plainly, because it will show up in any spot check: **the same
> video on the same phone measured 2.2 s and 6.7 s in two runs minutes apart.** That is the
> CDN's cache — a video recently watched by someone starts far faster than one that has to
> be fetched from origin. Any single measurement, good or bad, is close to meaningless; the
> figures above are medians of repeated runs.

**These figures are typical, not guaranteed.** That last paragraph is the reason. If you spot
check a single video and get a slow result, please try it again a minute later before treating
it as a regression — and if it is consistently slow, tell us which video and roughly what time,
because that is what makes it findable.

**Where our own share stands today.** The part of the wait this codebase controls — from asking
for playback to the player frame being attached — was re-measured across three consecutive runs
of five: **228 to 441 ms**, against **743 ms** when the original baseline was recorded. Our share
of the wait is now shorter than it was.

---

## 16 · What still needs a phone

Everything below is on `BROWSER-CHECKLIST.md` with exact steps. These are not outstanding
defects — they are the things no automated browser can reach.

**1 · Safari actually playing a video.** The Safari engine available for automated testing has
no support for the technology Cloudflare's player uses, so on it no video ever plays. Real
Safari does support it. Playback, adverts and resume on Safari are therefore **unverified**, and
this is the most important item on the checklist.

**2 · A WhatsApp share, actually sent.** The card, its size, its caching and the crawler's view
of it are all verified. What the WhatsApp app itself does with the link is not.

**3 · iOS Low Power Mode.** It throttles timers and blocks autoplay, and it cannot be emulated.

**4 · The address bar collapsing as you scroll.** This is the suspected cause of the
"vibrating", and it does not exist in any headless browser.

**5 · A tab the system reclaims in the background.** The save-on-close path is proved on all
four engines, but iOS deciding on its own to discard a tab is its own case.

---

## 17 · Test data on production

To prove that buying a video actually works — rather than assume it — test accounts were created
on the live site and used to buy videos through the normal payment screen.

| | |
|---|---|
| Accounts | **27**, all `e2e+…@mtonyo.test` |
| Created | 1 September 2026, every one through the ordinary sign-up form |
| Active purchases | **22**, totalling **18,000 TZS** of sandbox value |

Each run of the purchase journey needs an account that has **never paid for anything**, because
an account that already owns the film would not be testing anything at all — the first thing the
journey asserts is that the video is locked. Five runs on each of two Chrome profiles, one on
each of three Safari profiles, plus a few from earlier attempts, is where the number comes from.
Most bought the cheapest paid title at 500 TZS; the original account bought three at 5,000,
2,500 and 1,000.

Every one of them is listed by the cleanup script, which has been run in dry-run mode to confirm
it finds all 27 accounts and all 22 purchases.

**No money changed hands.** The site is running its sandbox payment provider, so these are test
transactions end to end — nothing was charged to any card or mobile-money account, and nothing is
owed to anyone.

**They do appear in the revenue figures** in the admin area, because they are recorded exactly
the way a real sale is: a payment, a purchase, and a creator's share. That is deliberate — a test
that skipped those steps would not have proved anything.

**They will be reversed before handover.** The reversal uses the same refund function an
administrator would use, so the creator's share is taken back with the sale rather than left
behind. It has been written and checked in advance (`server/scripts/cleanup-e2e.mjs`) and runs on
request.

**The two test uploads are now unpublished.** "WhatsApp Video 2026-08-15" and "80915499123
FD8FEAC4…" were raw filenames with no description, no category and no chosen poster, and both
were visible on Explore. They were removed through the same admin control you would use — which
records the action and notifies the creator — and both are off Explore. The test account that had
bought one of them **still has it**: full access, still on its shelf. That is the promise the
library makes, and it was tested rather than assumed.

One further account was created by accident while checking whether the sign-up form would accept
a test email address. It had no activity and has already been removed.
