# CreatorTZ — Client (React)

Tanzania's premium creator video platform frontend. This is the React (Vite) port of the
original single-file `index.html` prototype — same design, same animations, now as components.

## Run it

```bash
cd client
npm install
npm run dev          # http://localhost:5173  (also served on your LAN IP for phone testing)
npm run build        # production bundle → dist/
npm run preview      # serve the built bundle
```

`vite.config.js` sets `server.host = true`, so `npm run dev` prints a Network URL you can open
on a real Android/iOS device on the same Wi-Fi.

## Routes

| Route        | Screen                                                     |
| ------------ | ---------------------------------------------------------- |
| `/`          | Landing (hero, trending, how it works, features, stories)  |
| `/login`     | Log in (Viewer / Creator toggle)                           |
| `/signup`    | Create account                                             |
| `/reset`     | Password reset (send code → set new password)               |
| `/dashboard` | Creator dashboard — Overview, Library, Upload, Videos, Earnings |
| `/watch`     | Watch page with preview → paywall → mobile-money checkout   |

Unknown paths redirect to `/`.

## Structure

```
src/
  main.jsx                 React root + BrowserRouter
  App.jsx                  routes, preloader, background FX, toast provider
  styles/global.css         the complete design system (see "Styling" below)
  data/content.js           every string / image / stat, in one place
  hooks/
    useInView.js            IntersectionObserver → one-shot scroll reveal
    useScrolled.js          frosted-glass header past 40px
    useLockBodyScroll.js    freezes the page behind overlays
    usePrefersReducedMotion.js
  context/ToastContext.jsx  useToast() → showToast('…')
  components/
    ui/        Reveal, CountUp, Icon (lucide registry), Logo, Field, VideoCard
    layout/    Preloader, BackgroundFX, Header, MobileMenu, Footer, ScrollToTop
    landing/   Hero, PhoneMockup, Marquee, Trending, HowItWorks, Features,
               ForCreators, Testimonials, CallToAction
    auth/      AuthLayout, RoleToggle
    dashboard/ Sidebar, Panel, StatCard, RevenueChart, DonutChart,
               tabs/{Overview,Library,Upload,MyVideos,Earnings}Tab
    watch/     Player, Paywall, PaymentModal
  pages/       Landing, Login, Signup, Reset, Dashboard, Watch
```

## Styling

One global stylesheet (`src/styles/global.css`) carries the whole design system —
CSS custom properties, the aurora/grain background, and every keyframe animation
(`shine`, `pulse`, `load`, `float1-3`, `heroZoom`, `phoneFloat`, `prog`, `wheel`,
`marquee`, `grow`, `donut`, `spin`, `popIn`, `fadeIn`, `modalUp`, `confetti`, `wheel`).

Keeping it global (rather than per-component modules) is deliberate: the original design
relies on descendant selectors across component boundaries (`.vid-card:hover .vid-thumb img`,
`.donut .seg1 { stroke: url(#dgrad) }`, `.hstat + .hstat::before`), and those keep working
unchanged.

### Responsive coverage

Breakpoints: `1700` (ultra-wide), `1280`, `1080`, `1024` (tablet), `900` (nav/sidebar
collapse), `768`, `600` (phone), `380` (small phone), plus a landscape-phone rule
(`max-height: 540px and orientation: landscape`).

On top of the original breakpoints this build adds:

- **Safe areas** — `env(safe-area-inset-*)` on the header, mobile menu, sidebar, player bar
  and toast, so nothing hides under an iPhone notch or Android gesture bar.
- **`100dvh`** for the hero, auth split, dashboard and sidebar — no iOS address-bar jump.
- **No iOS focus zoom** — inputs go to 16px under 768px.
- **Touch devices** (`@media (hover: none)`) — hover-only affordances (the play button on a
  video card) are always visible, hover transforms are dropped, and `:active` press states
  take over.
- **`prefers-reduced-motion`** — reveals resolve instantly and looping animations stop.
- **Scrollable tables** — `.table-scroll` keeps wide tables inside their panel; the page
  body never scrolls sideways.
- **Sidebar scrim** — tapping outside the mobile dashboard drawer closes it.

## Notes on behaviour

- Icons come from `lucide-react`; `components/ui/Icon.jsx` maps the original
  `data-lucide="…"` names so data-driven sections still reference icons by string.
- The watch page simulates playback (200ms ticks, +0.55%/tick). A locked video cannot be
  scrubbed past the free-preview marker — seeking into paid territory trips the paywall.
- Checkout is a 3-step simulation: pick M-Pesa/Airtel → 2.6s "check your phone" → success
  with a confetti burst. Wire steps 2 and 3 to your real STK-push callback when the API lands.
- All buttons that were placeholders in the prototype still surface the same toast copy.
