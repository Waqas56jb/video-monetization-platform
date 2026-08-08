# video-monetization-platform

**Mtonyo + Creator Platform**

A mobile-first video monetization platform for creators to upload, sell, and share premium videos. Supports PPV, paid premieres, M-Pesa/Airtel Money payments, video previews, and automatic access unlocking. Built with Next.js, FastAPI, Supabase, and Cloudflare Stream for a scalable and low-cost MVP.

## Repository layout

| Folder                | What it is                                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| [`client/`](client/)  | Creator & viewer frontend (React + Vite) — landing, auth, dashboard, watch/paywall |
| [`admin/`](admin/)    | Super Admin control center (React + Vite) — users, creators, videos, moderation, finance |
| [`server/`](server/)  | Backend API (not yet implemented)                                           |

Each frontend has its own README with setup instructions, route table and notes:

- [client/README.md](client/README.md)
- [admin/README.md](admin/README.md)

## Quick start

```bash
# creator / viewer app  → http://localhost:5173
cd client && npm install && npm run dev

# admin control center  → http://localhost:5174
cd admin && npm install && npm run dev
```

Both dev servers bind to your LAN address as well, so the apps can be opened on a
real Android or iOS device on the same Wi-Fi for responsive testing.
