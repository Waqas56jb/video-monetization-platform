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

| ☐ | Device | URL | Do this | Expect |
|---|---|---|---|---|
| ☐ | MacBook · Safari | `/watch/how-to-cook-pilau-properly`, signed out | Open it | The advert plays first, or is skipped cleanly. "Advert loading…" never stays for more than about 4 seconds. |
| ☐ | iPhone · Safari | same | Open it | Same. |
| ☐ | iPad · Safari | same | Open it | Same. |
| ☐ | any | same | Watch the skip countdown | The countdown starts when the advert has picture, not while the screen is still black. |

Run each of these **five times**. An advert fault that happens once in five is still a fault.

## 3 · WhatsApp, actually sent

The card, the crawler, the image size and the cache are all verified from the command line —
what cannot be verified is what the WhatsApp app itself does with the link.

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

---

## Recording what you find

For anything that fails, note: **device, OS version, browser version, the URL, what you did,
what happened, and the time**. A screen recording is worth more than a description. The time
matters because the server logs can be lined up against it.

Send it back as it is — a failure with detail is more useful than a tidy summary.
