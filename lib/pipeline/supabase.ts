import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for the cert-pipeline orchestrator.
 *
 * The orchestrator runs in a Vercel Cron handler (no user session) and needs
 * to bypass RLS on leads, cert_queue_state, cron_alerts, ingest_runs, and
 * storage buckets. Re-uses the env vars already wired for the other cron
 * routes (see app/api/cron/scrape-grants-full/route.ts).
 */
export function pipelineSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "pipelineSupabase: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
