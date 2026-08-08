# CreatorTZ Admin — Super Admin Control Center (React)

The React (Vite) port of the original single-file `index.html` control center —
same design, same animations, same behaviour, now as components.

## Run it

```bash
cd admin
npm install
npm run dev          # http://localhost:5174  (also served on your LAN IP for phone testing)
npm run build        # production bundle → dist/
npm run preview      # serve the built bundle
```

The client app runs on port 5173, this one on 5174, so both can run side by side.

## Access

The panel opens on the **Super Admin** gate (email + password + 2FA). Any submission
lets you in — wire it to your real auth + TOTP check when the API lands. Auth is
held in memory only, so a refresh returns to the gate, exactly like the original.

## Routes

| Route          | Tab                                                        |
| -------------- | ---------------------------------------------------------- |
| `/login`       | Super admin gate                                           |
| `/dashboard`   | Overview — KPIs, revenue chart, donut, pending withdrawals, live feed |
| `/analytics`   | Views/unlocks/conversion, payments-per-day bars, method meters, top videos |
| `/users`       | User table — view / block / unblock / delete               |
| `/creators`    | Creator table — verify / edit split / suspend              |
| `/videos`      | Video table — preview / status / clear flags / unpublish / remove |
| `/moderation`  | Deletion requests + flagged content                        |
| `/payments`    | Every transaction with split column                        |
| `/withdrawals` | Payout queue (mark paid / reject) + recent payouts         |
| `/revenue`     | Global split slider + per-creator overrides + platform earnings |
| `/ads`         | Pre-roll settings + active campaigns                       |
| `/audit`       | Admin audit log                                            |
| `/settings`    | Platform toggles, payment settings, database backups       |

Unknown paths redirect to `/dashboard` (or the gate when logged out).

## Structure

```
src/
  main.jsx                  React root + BrowserRouter
  App.jsx                   providers, auth gate, all 12 routes
  styles/global.css          the complete design system (see "Styling")
  data/adminData.js          every row, stat, toast string and confirm dialog
  hooks/
    useCollection.js         mutable table data + the 500ms fade-out on remove
    useLockBodyScroll.js     freezes the page behind the drawer / modal
    useMediaQuery.js         knows when the sidebar becomes a drawer
  context/
    ToastContext.jsx         useToast() → showToast('…')
    ConfirmContext.jsx       useConfirm() → the red danger dialog
    AdminDataContext.jsx     all mutable collections + the live activity feed
  components/
    ui/        Icon (lucide registry), Panel, StatCard, Switch, Field,
               Filters (search / select / export), Table (wrap, cells, icon button)
    layout/    Preloader, BackgroundFX, Sidebar, Topbar
    charts/    RevenueAreaChart, PaymentsBarChart, DonutChart, MeterList
    tabs/      Overview, Analytics, Users, Creators, Videos, Moderation,
               Payments, Withdrawals, Revenue, Ads, Audit, Settings
  pages/       Login, AdminShell
```

## What each original script function became

| Original | Now |
|---|---|
| `lucide.createIcons()` | `lucide-react` + `components/ui/Icon.jsx` name registry |
| `adminLogin()` / `logout()` | auth state in `App.jsx` + route redirect |
| `tab(name, btn)` | routes + `NavLink` active state + `PAGE_META` title/subtitle |
| `showToast()` | `ToastContext` (same 3400ms dismiss) |
| `confirmAct()` / `#cf-yes` | `ConfirmContext` — pass `{title, text, onConfirm}` |
| `fadeOut()` | `useCollection.remove()` + the `.row-exit` class (same 500ms) |
| `setStatus()` / `swapBlockToUnblock()` / `unblockUser()` | `patch(id, {status})`; the action buttons are derived from status |
| `verifyCreator()` | `patch(id, {status:'Verified'})` — the verify button disappears |
| `approveRow()` | `remove(id)` + the row's own toast message |
| `filterTable()` / `filterStatus()` | `useMemo` filters over the collection |
| `updateSplit()` | `creatorShare` state driving the bar width and the label |
| `startFeed()` | interval in `AdminDataContext` — new item every 5s, trimmed to 8 |
| `exportCSV()` | `ExportButton` → same toast |

State lives above the routes, so a user you block on `/users` is still blocked after
navigating away and back — matching the original, where all tabs shared one DOM.

## Styling

One global stylesheet (`src/styles/global.css`) carries the whole design system.
Every keyframe is preserved: `shine`, `pulse`, `fadeIn`, `slideUp`, `float1`, `float2`,
`load` and `donut`. It stays global on purpose — the design leans on descendant
selectors across component boundaries (`.donut .seg1 { stroke: url(#dg1) }`,
`.switch.on::after`, `.fselect::after`, `.tbl tbody tr:hover`).

### Responsive coverage

Breakpoints: `1800` (ultra-wide), `1400`, `1100`, `1024` (tablet), `900` (sidebar
becomes a drawer), `600` (phone), `380` (small phone), plus a landscape-phone rule
(`max-height: 540px and orientation: landscape`).

On top of the original breakpoints this build adds:

- **Safe areas** — `env(safe-area-inset-*)` on the sidebar, main column, login card
  and toast, so nothing hides under an iPhone notch or Android gesture bar.
- **`100dvh`** for the shell, sidebar, login and preloader — no iOS address-bar jump.
- **No iOS focus zoom** — every input, search box and select goes to 16px under 768px.
- **Touch devices** (`@media (hover: none)`) — hover transforms are dropped, `:active`
  states take over, and icon buttons / switches grow to comfortable tap targets.
- **`prefers-reduced-motion`** — animations and transitions collapse.
- **Sidebar scrim** — tapping outside the mobile drawer closes it.
- **Empty states** — filtering a table down to nothing shows a message instead of a
  blank body.
- **Phone layout for moderation cards** — full-width thumbnail and full-width action
  buttons instead of a cramped row; the confirm dialog stacks its buttons.
- **Print** — chrome hidden, tables unclamped.

Wide tables keep the original `min-width: 760px` inside `.tbl-wrap { overflow-x: auto }`,
so they scroll within their panel and the page body never scrolls sideways.

## Notes

- `WITHDRAWAL_QUEUE` row 3 has the number `0688 *** firm`. That is verbatim from the
  original mock data (it looks like a typo there) — kept as-is rather than silently
  changed. Fix it in `src/data/adminData.js` if you want.
- The live feed uses `dangerouslySetInnerHTML` because the activity strings carry
  inline `<b>` emphasis, as in the original. These strings are local constants, not
  user input — if you later feed this from an API, render the parts as JSX instead.
