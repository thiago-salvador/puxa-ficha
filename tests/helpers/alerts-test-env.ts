/**
 * Pins the env read by the alerts routes so their tests behave the same with or
 * without `.env.local` loaded. The pin runs as a side effect of importing this
 * module, so import it before anything under `src/`: `alerts-shared` reads its
 * salts at module load. Call `restoreAlertsTestEnv()` in the suite teardown.
 */
const PINNED_ALERTS_ENV_KEYS = [
  // VERCEL=1 sends the IP rate limiter to the production Supabase RPC
  // (reserve_request_ip_quota); a spent window there turns expected statuses into 429.
  "VERCEL",
  "VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_ENV",
  "VERCEL_URL",
  // No test may reach a real backend, even if a dependency is left unmocked.
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "RESEND_API_KEY",
  // Hashing, token encryption and email content fall back to their dev defaults.
  "PF_ALERTS_TOKEN_SALT",
  "PF_ALERTS_IP_SALT",
  "PF_ALERTS_TOKEN_ENCRYPTION_KEY",
  "PF_ALERTS_FROM_EMAIL",
  "PF_ALERTS_REPLY_TO_EMAIL",
  "SMTP_FROM",
  "NEXT_PUBLIC_SITE_URL",
  "PF_CRON_CHAIN_ORIGIN",
  "CRON_SECRET",
] as const

const savedAlertsEnv = new Map<string, string | undefined>(
  PINNED_ALERTS_ENV_KEYS.map((key) => [key, process.env[key]]),
)

for (const key of PINNED_ALERTS_ENV_KEYS) {
  delete process.env[key]
}

export function restoreAlertsTestEnv(): void {
  for (const [key, value] of savedAlertsEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
