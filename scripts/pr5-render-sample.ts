/**
 * Local rehearsal renderer for PR 5 — reads cron_alerts id=41 (the live
 * `scrape-states` alert) and renders the single-alert email so a reviewer
 * can eyeball the HTML/text twin without deploying.
 *
 * Usage: ./node_modules/.bin/tsx scripts/pr5-render-sample.ts
 *
 * Reads creds from /Users/raphaelhertz/ContractsIntel/.env. Writes to /tmp.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

import { renderSingle } from "../lib/alerts/render";
import type { PendingAlert } from "../lib/alerts/types";

const envText = readFileSync("/Users/raphaelhertz/ContractsIntel/.env", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
process.env.ALERT_ACK_SECRET = process.env.ALERT_ACK_SECRET || "rehearsal-secret-not-real";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase creds");
  process.exit(1);
}

async function main(): Promise<void> {
  const sb = createClient(url!, key!, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("cron_alerts")
    .select("id, created_at, severity, source, message, context, run_id, acked_at")
    .eq("id", 41)
    .maybeSingle();

  if (error || !data) {
    console.error("fetch failed:", error?.message ?? "no row");
    process.exit(1);
  }
  const alert = data as PendingAlert;
  console.log("Fetched id=41:", {
    severity: alert.severity,
    source: alert.source,
    message: alert.message?.slice(0, 100),
  });

  const dispatcherRunId = "11111111-2222-3333-4444-555555555555";
  const ts = Math.floor(Date.now() / 1000);
  const out = renderSingle({
    alerts: [alert],
    dispatcherRunId,
    baseUrl: "https://contractsintel.com",
    ts,
  });

  writeFileSync("/tmp/alert_sample.html", out.html);
  writeFileSync("/tmp/alert_sample.txt", out.text);
  writeFileSync("/tmp/alert_sample_subject.txt", out.subject);
  console.log("\nSubject:", out.subject);
  console.log(`Wrote /tmp/alert_sample.html (${out.html.length} bytes)`);
  console.log(`Wrote /tmp/alert_sample.txt (${out.text.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
