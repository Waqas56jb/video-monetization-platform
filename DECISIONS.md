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

