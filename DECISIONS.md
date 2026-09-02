# Decisions made without asking

One entry per decision taken alone, bug fixed off-list, or migration run. Newest last.

---

## 2026-09-01 · Playwright's WebKit cannot verify video playback — and it nearly cost a false report

**What happened.** WebKit reported that no video plays: `currentTime` 0, `readyState` 0, no
error code, on all three titles, on both WebKit desktop and an iPhone 14 profile, for 30
seconds — while Chromium played all three. Read at face value that is "Safari plays nothing",
which would be the most serious defect in the product.

**It is not true.** Playwright's WebKit build has no Media Source Extensions:

```
webkit    {"h264":"probably","aac":"probably","hls":"no","webm":"probably","mse":false}
chromium  {"h264":"probably","aac":"probably","hls":"maybe","webm":"probably","mse":true}
```

Cloudflare Stream's player appends segments through MSE. With no `MediaSource` there is
nothing to append to, so the element sits at `readyState 0` for ever and reports no error —
exactly the signature observed. This build also has no native HLS, so Safari's usual fallback
is absent too. **Real Safari has both.**

**Consequence, and it shapes the rest of the run.** WebKit here can verify layout, scroll,
CLS, hover and tap behaviour, login, navigation, overflow and responsiveness. It cannot verify
anything that requires media to decode: whether an advert plays, whether content resumes,
whether a purchase unlocks the full film. Those stay on Chromium plus the browser checklist.

**The earlier C2 report is retracted.** "On WebKit the Free + Ads path does not play at all"
was this limitation, not a fault in the product. What survives from that investigation, and is
real, is smaller: the advert overlay does clear — measured at 4–8 s, `adState` going
`loading → null` and the layer unmounting — so the "spinner stuck for ever" reading was wrong
as well. Whether the advert plays on the client's actual MacBook is still unknown and needs a
real device.

**Alternative considered:** running headed WebKit, or Safari via a driver. Neither is available
on this machine, and the codec build is the same either way.


---

## 2026-09-01 · Log in returns you to where you were — except from the front door

Found while verifying A6, not on the list: the header's **Log in** and the mobile menu's
**Log in** both navigated to a bare `/login`. Unlock had carried the destination since the
payment work, so the bug only bit viewers who reached for the header — and it looked exactly
like the client's "it forgets where I was", which had been assumed to be the autofill problem
alone. It was two problems wearing one description.

`client/src/lib/loginReturn.js` builds the login URL from the current location; `safeNext`
keeps it internal, as before.

**The landing page keeps the dashboard.** There is nothing on `/` to return to, and Log in from
the front door has always meant "take me to my account".

**Alternative considered:** carry the destination from every page with no exception — a shorter
rule, one sentence, easier to explain. Rejected because it changes a behaviour nobody has
complained about on the single page where the current one is right. If that ever needs
revisiting it is a one-line change in `loginHref`.

**Also fixed, in the instrument rather than the product:** the A6 harness polled for the error
banner with Playwright's 30-second default timeout, so every clean iteration charged 30 s to the
login and the first run reported 41-second sign-ins. Real figure, measured against the API
response: 3.4 s desktop, 1.4 s iPhone, redirect within 15 ms of the token.

---

## 2026-09-01 · "Remove from history" hides the row; it does not delete it

M2-GAP left this open as a product decision. Continue Watching and Recently Watched are one
table read two ways, so removing from one removes from the other — and if the row is deleted,
the resume position goes with it and reopening the film starts it again from zero.

**Decided: hide.** `watch_progress.hidden_at` (migration 033) takes the video out of both rows
and keeps the seconds. The commonest reason to reach for this control is wanting a title off a
shared screen, not wanting to lose your place in it.

**And watching more of a hidden video clears the flag.** Somebody who removed a film and then
went back to it plainly wants it in their list again; making them find a second control to undo
the first is the kind of thing this client has already had to point out.

**Alternative considered:** delete the row. One fewer column, no clearing rule, simpler in every
respect — rejected because it conflates "stop showing me this" with "forget where I was", and
there is no way back from it.

---

## 2026-09-01 · My Library answers all four rows in one request

`GET /api/library` returns Purchased, Continue Watching, My List and Recently Watched together,
plus the ids of what the viewer has saved. Four endpoints would have been four requests every
time the tab is opened, on top of what the dashboard already asks for, against a limiter of 120
a minute that a checkout also has to fit inside. Measured: **5 requests to open My Library on
desktop, 6 on an iPhone, against a bar of 8.**

`videos` is kept in the response and still means Purchased. Renaming it would have broken the
Library tab and the purchase journey's assertions for no gain.

**Home does not use it.** The batched response carries a viewer's entire purchase history, and
Home draws at most four tiles, so it has its own `GET /api/library/continue?limit=4`.

---

## 2026-09-01 · Two bugs this run's own changes introduced, both caught by the harnesses

Recorded because they are the argument for running these journeys at all.

**The stretched link that ate the Unlock button.** Adding Follow to the watch page's creator row
meant the row could no longer be one big anchor — a button inside an anchor is invalid and
browsers resolve it by closing the anchor early. The replacement is a link stretched over the
row with `position:absolute;inset:0`, which resolves against the nearest POSITIONED ancestor —
and `.creator-row`, unlike `.vid-card`, never declared `position:relative`. The overlay escaped
across the watch column and on a phone the viewer could not press Buy. Invisible in review;
found as a click timeout on Pixel 7. Fixed in `18eb81c` with a test that asserts every stretched
link in the sheet is contained by a positioned card.

**The beacon that could only be a POST.** The Continue Watching write path was rebuilt on
`navigator.sendBeacon`, which has no way to choose a verb — and the progress route was
registered for `PUT` alone, so every beacon was answered 404. Silently: sendBeacon returns true
for "queued" and never for "delivered", so the page reported success and nothing was stored. It
was found by watching the network, not by reading the code, and it would have shipped as
"Continue Watching sometimes forgets where you were". Fixed in `6045653`.

---

## 2026-09-01 · The staff account used to unpublish the two test uploads

C7 needed an administrator. Rather than change a real administrator's password on production, it
used the seeded demo moderator (`demo.moderator@mtonyo.demo`), a sub-admin whose password is
published in `src/cli/demo.js` for exactly this purpose. No real staff credentials were touched,
and the unpublish went through `POST /api/admin/videos/:id/unpublish` — the route an
administrator will use at handover — so it wrote an audit row and notified the creator, which a
direct database write would have skipped.

---

## 2026-09-01 · Migrations run against production in this session

| migration | applied |
|---|---|
| `031_follows_counter_trigger.sql` | 2026-09-01 18:56:45 |
| `032_saved_videos.sql` | 2026-09-01 19:37:58 |
| `033_watch_progress_hidden_at.sql` | 2026-09-01 19:37:59 |

Each was run immediately after the commit that added it, and `db:status` printed afterwards.

---

## 2026-09-01 · The cross-browser matrix's journey numbering is reconstructed

PROMPT-7's Part E is not in this repository — it was a brief, not a file — so journeys 1-10 and
13 in `scripts/e2e/matrix.mjs` are reconstructed from the client's reported faults and the work
done against them. Each journey states in its own title what it actually checks, so the number
is a label rather than a claim. 11 and 12 are named and skipped as instructed, because "skipped"
and "does not exist" are different things and the real-device checklist depends on knowing which.

If the original list turns up and the numbering disagrees, the journeys are what matter and the
numbers can be moved.

---

## 2026-09-01 · CI runs the read-only journeys only, and against production

`.github/workflows/journeys.yml`. Two decisions in one.

**Read-only.** The full matrix signs in and buys things, and those are real rows on a live
system — payments, purchases, a creator's share. Running them on every push would fill the
client's revenue figures with test data. The paid journeys stay a deliberate local act with a
documented, reversible account.

**Against production, not a preview.** A preview deployment cannot be driven end to end at all:
`CORS_ORIGINS` names only the two production hostnames, and Cloudflare Stream's allowed-domains
list excludes preview hostnames. A suite pointed at a preview would fail almost every journey for
reasons unrelated to the change, and a job that is always red is a job nobody reads. The workflow
polls `X-Build` until the pushed commit is live before it looks, so it tests what was pushed
rather than what was there a minute ago.

**Alternative considered:** unblocking previews by adding a wildcard to `CORS_ORIGINS` and to
Cloudflare's allowed domains. Rejected for this run — both are production settings with a
security dimension, and neither is a code change this brief authorises.

---

## 2026-09-01 · Home's warm first-card figure moved from 898 ms to about 1050 ms, and why

Recorded because it is the one measurement in E1 that did not improve, and rounding it away would
be the wrong kind of report.

Three of the four Home figures improved — desktop cold 2336 → 1822, iPhone cold 2502 → 2064,
desktop warm 1047 → 1021. The iPhone **warm** figure moved the other way, to roughly 1050 ms.

**The cause is measured.** The bundle grew from 421,688 to 445,949 bytes (+5.8 %), built from
`71bd206` and from the current commit in a throwaway worktree so the two are comparable. That is
the Follow context, the saved-videos context, the two new controls and the home Continue Watching
row — the features this run added. A warm visit has the bundle in cache and spends its time
parsing and mounting it, which is exactly where a larger bundle shows up.

Signed out, Home still makes exactly three API requests and the Continue Watching section renders
nothing, so no network cost was added to the signed-out path. The figure sits inside the recorded
baseline's own range of `[875-1416]`.

**Not treated as a regression to fix**, and the reasoning should be visible: it is 5.8 % more code
for four features the client asked for, on the warm path only, on a throttled phone profile. If
it needs to come back, the honest lever is code-splitting the two contexts behind the routes that
use them, not removing the features.

---

## 2026-09-01 · A7's screenshot grid did not exist, and the item was recorded as done

Found while assembling the final artefacts. A7's measurements were real and recorded — 70
page/width combinations, zero horizontal overflow, four small tap targets named — but the
screenshot grid the item calls for had never been produced, and `e2e/screens/` did not exist. An
item is not finished because its numbers are.

`scripts/e2e/screens.mjs` now produces it: 7 public pages x 10 widths x 2 engines, composed into
14 strips rather than 140 loose files, each width captioned and the caption turning red with the
excess if that combination scrolls sideways. None do.

**JPEG at quality 72, not PNG.** The first run wrote 11.8 MB of PNG. That is a lot of repository
for photographs of a dark web page, and the difference at quality 72 is invisible. 1.36 MB after.

**The WebKit watch strip needed a note.** It shows "This video could not be played… Try again" at
every width — which is the Step 2 failure state working correctly on an engine with no Media
Source Extensions, not a defect. `e2e/screens/README.md` says so, because an artefact that can be
misread is worse than no artefact.

**Not covered by the grid:** `/dashboard` and the admin screens, which need a session. Their
widths were measured in A7's original pass; only the pictures are missing.

---

## 2026-09-01 · Four test accounts per purchase-journey profile, and why there are so many

`scripts/e2e/purchase-journey.mjs` creates a **fresh viewer for every run**, not one shared
account. The first assertion of the journey is that the film is locked; a shared account would
own it after the first run, and every later run would be testing a video it had already bought —
which is the one thing that journey must not do.

Five runs on each of two Chromium profiles plus one on each of three WebKit profiles is thirteen
accounts, each with one 500 TZS sandbox purchase. They are all `e2e+…@mtonyo.test` and all
reversed by `server/scripts/cleanup-e2e.mjs`, which refunds through the admin path so the
creator's share goes back with the sale rather than being left behind.

**Alternative considered:** reusing one account and buying a different title each run. Rejected —
there are only four paid titles, two of which are the test uploads now unpublished, so it does
not reach five runs and it makes each run test a different video.

---

## 2026-09-02 · The card only opened from its title — the worst bug of this run, and it shipped

The client found it within minutes of the handover: pressing a video's **picture** did nothing
except leave the top progress bar spinning; only the title worked. It was mine, from the card
restructure that made room for Follow and Save, and the suite had passed it seven times over.

**Two faults, one symptom.** `.vid-play` is `position:absolute;inset:0;z-index:2` and covered the
whole poster above the overlay — fixed by making every decorative layer `pointer-events:none`.
And the overlay was a `::after` pseudo-element that lost the press outright: `.vid-card:active`
applies `opacity:.92` and a transform, the card becomes a stacking context mid-press, and the
pseudo-element then lost to the poster image. mousedown landed on the anchor, mouseup on the
`<img>`, so `click` fired on their common ancestor and the link never activated.

**Decided: a real element, not a tuned pseudo-element.** The opener is the last child of the card,
absolutely positioned over it, title drawn separately and carried as the accessible name,
controls at z-index 4. I could not explain the pseudo-element's behaviour from first principles
even after finding it, and code whose correctness rests on that is not code to keep. Verified by
injecting a real anchor into the live page before writing any of it.

**Alternative considered:** raising the pseudo-element's z-index. Rejected — it treats the symptom
and leaves the same fragility, and the arrangement had already surprised me twice.

**The test failure is the more important half.** Journey 3 and the follow suite clicked
`.vid-open` — the title — so both passed on seven profiles while the target anyone actually aims
at was dead. A test that presses the one part of a control nobody uses is not a test of that
control. Both press the poster now, and `scripts/e2e/card-press.mjs` presses every part of a card
on five profiles: 45 checks.

**They press coordinates, not elements**, and that is not incidental. `locator.click()` refuses
when a different element would receive the event — precisely what a correct overlay causes — so
element-based clicking reported the *fixed* site as broken on all seven profiles. Any future test
of a covered control has to press the point.

---

## 2026-09-02 · Three harness faults that each reported the site as broken when it was not

Recorded together because the pattern is the point: during this fix, more of my time went on
false failures than on the real one, and each looked exactly like a product defect.

- **The price row sat at y 888-931 in a 900 px window.** "Press its centre" pressed a point below
  the window. Reported as "the price row does not navigate". Fixed by scrolling in and clamping.
- **Signed out, pressing Save navigates to sign in**, carrying the page. The pin disappearing is
  correct behaviour; the probe read it as the pin being broken and timed out looking for it. Now
  asserted in both states.
- **Playwright refuses to click an element when another would receive the event.** That refusal is
  a correct overlay working, and it read as seven profiles failing.

The lesson worth keeping: when a harness and a browser disagree, find out which one is lying
before touching the product. Every one of these would have led to a change that made the site
worse.
