/** Canonical API origin — never the retired backend hostname. */
const SERVER = 'https://video-monetization-platform-server.vercel.app'

export function apiOrigin() {
  const raw = process.env.VITE_API_URL || process.env.API_URL || SERVER
  if (/video-monetization-platform-backend\.vercel\.app/i.test(String(raw))) return SERVER
  return String(raw || SERVER).replace(/\/$/, '')
}

export function publicWebOrigin() {
  const raw =
    process.env.PUBLIC_WEB_URL || 'https://video-monetization-platform-chi.vercel.app'
  return String(raw).replace(/\/$/, '')
}
