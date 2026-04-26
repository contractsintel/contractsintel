// Centralized environment variable validation.
// Import this module early (e.g., in middleware or layout) to fail fast
// on missing configuration instead of crashing at runtime.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string = ""): string {
  return process.env[name] ?? fallback;
}

// Validate on first import — throws immediately if any required var is missing.
// Only validate server-side vars (NEXT_PUBLIC_* are handled by Next.js build).
export const env = {
  // Supabase (required for all functionality)
  NEXT_PUBLIC_SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),

  // Anthropic AI (required for AI features)
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),

  // Stripe (required for billing)
  STRIPE_SECRET_KEY: required("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: required("STRIPE_WEBHOOK_SECRET"),

  // Cron authentication
  CRON_SECRET: required("CRON_SECRET"),

  // Optional services — degrade gracefully if missing
  RESEND_API_KEY: optional("RESEND_API_KEY"),
  RESEND_FROM_EMAIL: optional("RESEND_FROM_EMAIL", "ContractsIntel Ops <system@contractsintel.com>"),
  DIGEST_TEST_TOKEN: optional("DIGEST_TEST_TOKEN"),
  ALERT_ACK_SECRET: optional("ALERT_ACK_SECRET"),
  SAM_API_KEY: optional("SAM_API_KEY"),
  GOOGLE_CALENDAR_CLIENT_ID: optional("GOOGLE_CALENDAR_CLIENT_ID"),
  GOOGLE_CALENDAR_CLIENT_SECRET: optional("GOOGLE_CALENDAR_CLIENT_SECRET"),
  PUPPETEER_SERVER_URL: optional("PUPPETEER_SERVER_URL"),
  PUPPETEER_AUTH_TOKEN: optional("PUPPETEER_AUTH_TOKEN"),
} as const;
