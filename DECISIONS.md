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
