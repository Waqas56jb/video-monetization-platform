# Custom domain move — runbook (Milestone 3)

Every address in the code now comes from configuration. The move is all settings plus one line in `client/vercel.json`. Replace `mtonyo.co.tz` below with the client's real domain.

| What | New address (example) |
|---|---|
| Public site | `https://mtonyo.co.tz` (and `www.` redirecting to it) |
| Admin | `https://admin.mtonyo.co.tz` |
| API (optional, recommended) | `https://api.mtonyo.co.tz` |

## 1. DNS and hosts (the client or whoever holds the domain)
1. **Vercel, client project:** Settings → Domains → add `mtonyo.co.tz` and `www.mtonyo.co.tz`. Vercel shows the DNS records (A `76.76.21.21`, or a CNAME `cname.vercel-dns.com`). Add them at the registrar.
2. **Vercel, admin project:** add `admin.mtonyo.co.tz` (CNAME).
3. **Railway, API service:** Settings → Networking → Custom Domain `api.mtonyo.co.tz`, then add the CNAME Railway gives you.
4. Wait until all three show a valid certificate.

## 2. Environment (no secrets here, only addresses)
**Railway (API):**
```
PUBLIC_WEB_URL=https://mtonyo.co.tz
ADMIN_WEB_URL=https://admin.mtonyo.co.tz
SERVER_PUBLIC_URL=https://api.mtonyo.co.tz
CORS_ORIGINS=https://mtonyo.co.tz,https://www.mtonyo.co.tz,https://admin.mtonyo.co.tz
```
**Vercel, client project:** `PUBLIC_WEB_URL=https://mtonyo.co.tz`, `VITE_PUBLIC_WEB_URL=https://mtonyo.co.tz`, and `VITE_API_URL=https://api.mtonyo.co.tz` if the API moved.
**Vercel, admin project:** `VITE_PUBLIC_WEB_URL=https://mtonyo.co.tz`, and `VITE_API_URL` the same as above.

Redeploy all three. Vercel deploys count against the shared 100-a-day quota.

## 3. Things that store the old address
- **Cloudflare Stream:** each video keeps its own list of sites allowed to embed it. From `server/`, run `npm run cf:origins -- --fix`. Without this the player is blank on the new domain.
- **Share cards:** from `server/`, run `npm run share:warm` so cached cards are rebuilt with the new links.
- **AirPay merchant panel:** set the Return URL to `https://api.mtonyo.co.tz/api/payments/return/airpay` and the IPN/Callback URL to `https://api.mtonyo.co.tz/api/payments/webhook/airpay`. AirPay may also need the new domain whitelisted.

## 4. Leave nothing on vercel.app
Add this redirect to `client/vercel.json`, at the top of a `"redirects"` array, with the real domain:
```json
{ "source": "/(.*)", "has": [{ "type": "host", "value": "video-monetization-platform-chi.vercel.app" }],
  "destination": "https://mtonyo.co.tz/$1", "permanent": true }
```
Links already shared on WhatsApp keep working: they land on the same video at the new address. Add the same rule to the admin project for its vercel.app host.

## 5. Verify
```
node scripts/domain-check.mjs --site https://mtonyo.co.tz --api https://api.mtonyo.co.tz --admin https://admin.mtonyo.co.tz
```
It must print **ALL PASS**. It checks HTTPS, share tags, CORS, share links, the payment return and the old-address redirect. Then share a fresh link on WhatsApp and confirm the poster card shows the new domain.
