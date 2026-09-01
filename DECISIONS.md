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
