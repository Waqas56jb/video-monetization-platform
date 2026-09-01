# A7 — responsiveness grid

Each image is one page at 320, 375, 390, 414, 768, 834, 1024, 1280, 1440, 1920 px, left to right, on the engine named in the
filename. The caption above each shot is its width; it turns red and shows the excess if that
combination scrolls sideways.

The strips are JPEG at quality 72. The same grid as PNG was 11.8 MB, which is a lot of
repository for photographs of a dark web page, and the difference is invisible.

Also note what a strip shows and what it does not: each shot is the top 900 px of the page at
that width, so it catches the header, the fold and the first row of content. Anything below that
is covered by the overflow measurement, not by the picture.

**Read the WebKit watch-page strip carefully.** It shows *"This video could not be played. Check
your connection and try again"* with a Try again button at every width. That is not a fault in the
site: Playwright's WebKit has no Media Source Extensions, so Cloudflare's player can never decode
there, and what the strip is actually showing is the failure state doing its job — a message and a
working retry rather than a spinner that never ends. The Chromium strip of the same page shows the
player. Real Safari has MSE; see BROWSER-CHECKLIST.md item 1.

Captured 2026-09-01 against https://video-monetization-platform-chi.vercel.app.

- `e2e/screens/webkit-home.jpg` — / on webkit
- `e2e/screens/webkit-explore.jpg` — /explore on webkit
- `e2e/screens/webkit-watch-how-to-cook-pilau-properly.jpg` — /watch/how-to-cook-pilau-properly on webkit
- `e2e/screens/webkit-login.jpg` — /login on webkit
- `e2e/screens/webkit-signup.jpg` — /signup on webkit
- `e2e/screens/webkit-creator.jpg` — /creator on webkit
- `e2e/screens/webkit-legal-terms.jpg` — /legal/terms on webkit
- `e2e/screens/chromium-home.jpg` — / on chromium
- `e2e/screens/chromium-explore.jpg` — /explore on chromium
- `e2e/screens/chromium-watch-how-to-cook-pilau-properly.jpg` — /watch/how-to-cook-pilau-properly on chromium
- `e2e/screens/chromium-login.jpg` — /login on chromium
- `e2e/screens/chromium-signup.jpg` — /signup on chromium
- `e2e/screens/chromium-creator.jpg` — /creator on chromium
- `e2e/screens/chromium-legal-terms.jpg` — /legal/terms on chromium

**Horizontal overflow: 0.** Not one combination scrolls sideways.
