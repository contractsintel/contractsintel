import type { SupabaseClient } from "@supabase/supabase-js";

export type AlertSeverity = "info" | "warn" | "error" | "critical";

/**
 * Append a row to cron_alerts. Mirrors the alert() helper in the legacy
 * workers/jobs/daily-pipeline.js. Never throws — alert insert failures are
 * logged to stdout and swallowed so they can't mask the underlying error.
 */
export async function alert(
  supabase: SupabaseClient,
  runId: string,
  severity: AlertSeverity,
  source: string,
  message: string,
  context: Record<string, unknown> | null = null,
): Promise<void> {
  console.log(`[${runId}] ALERT ${severity}/${source}: ${message}`);
  try {
    await supabase.from("cron_alerts").insert({
      severity,
      source,
      message,
      context,
      run_id: runId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[${runId}] (cron_alerts insert failed: ${msg})`);
  }
}
