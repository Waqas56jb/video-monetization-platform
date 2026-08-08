import 'dotenv/config'

const bool = (v, dflt = false) => {
  if (v === undefined || v === '') return dflt
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())
}
const int = (v, dflt) => {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : dflt
}
const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 4000),
  corsOrigins: list(process.env.CORS_ORIGINS),
  publicWebUrl: (process.env.PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/$/, ''),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  databaseUrl: process.env.DATABASE_URL || '',

  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
    streamKeyId: process.env.CLOUDFLARE_STREAM_KEY_ID || '',
    streamKeyPem: process.env.CLOUDFLARE_STREAM_KEY_PEM || '',
    webhookSecret: process.env.CLOUDFLARE_WEBHOOK_SECRET || '',
  },

  payments: {
    provider: process.env.PAYMENT_PROVIDER || 'sandbox',
    sandboxDelayMs: int(process.env.SANDBOX_CONFIRM_DELAY_MS, 4000),
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
    airpay: {
      baseUrl: process.env.AIRPAY_BASE_URL || '',
      merchantId: process.env.AIRPAY_MERCHANT_ID || '',
      apiKey: process.env.AIRPAY_API_KEY || '',
      apiSecret: process.env.AIRPAY_API_SECRET || '',
    },
  },

  cronSecret: process.env.CRON_SECRET || '',
  verboseSql: bool(process.env.VERBOSE_SQL, false),
}

/**
 * Which capabilities are actually usable with the current environment.
 * The API boots regardless and reports this at /health, so a missing
 * Cloudflare token degrades one feature instead of taking the server down.
 */
export const capabilities = {
  database: Boolean(env.databaseUrl && !/:@/.test(env.databaseUrl)),
  supabaseAuth: Boolean(env.supabase.url && env.supabase.serviceRoleKey),
  cloudflareStream: Boolean(env.cloudflare.accountId && env.cloudflare.apiToken),
  signedPlayback: Boolean(env.cloudflare.streamKeyId && env.cloudflare.streamKeyPem),
}

/** Human-readable list of what still needs configuring. */
export function missingConfig() {
  const missing = []
  if (!capabilities.database) missing.push('DATABASE_URL (password missing — reset it in Supabase → Settings → Database)')
  if (!capabilities.supabaseAuth) missing.push('SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API)')
  if (!capabilities.cloudflareStream) missing.push('CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (Stream: Edit)')
  if (!capabilities.signedPlayback) missing.push('CLOUDFLARE_STREAM_KEY_ID + PEM (run: npm run db:check to generate)')
  return missing
}
