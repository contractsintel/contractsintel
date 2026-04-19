/**
 * Instantly sync — ported from workers/jobs/sync-leads-to-instantly.js.
 *
 * Dual safety gate kept as belt-and-suspenders (orchestrator already checks
 * both flags before advancing to 'sync' stage, but manual invocations of
 * this fn would miss that check without the inner gate). Campaign pause
 * precheck preserved: abort if any target campaign is RUNNING unless
 * ALLOW_RUNNING=1.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { pipelineSupabase } from "./supabase";

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";

const CAMPAIGN_MAP: Record<string, string> = {
  "8a": "90b29a94-8dff-40cb-8dbb-12d26a2d2d56",
  sdvosb: "c0e249a1-a7aa-4c65-8a85-c8b575810956",
  wosb: "c054a34d-5cbc-468b-aef7-677f9e5e61f5",
  edwosb: "c054a34d-5cbc-468b-aef7-677f9e5e61f5",
  hubzone: "2cb25064-8d05-4966-9a57-90058f68241d",
};
const VALID_SOURCES = ["sam_entity", "dsbs", "vetcert", "manual"];
const VALID_CERTS = Object.keys(CAMPAIGN_MAP);
const BATCH_SIZE = 50;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function instantlyRequest(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) throw new Error("INSTANTLY_API_KEY required");
  const res = await fetch(`${INSTANTLY_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "curl/8.7.1",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json ?? text };
}

function toInstantlyLead(row: any): any {
  const payload: any = { campaign: CAMPAIGN_MAP[row.primary_cert], email: row.email };
  const put = (k: string, v: unknown) => {
    if (v != null && v !== "") payload[k] = v;
  };
  put("first_name", row.first_name);
  put("last_name", row.last_name);
  put("company_name", row.company);
  put("phone", row.phone);

  const cv: Record<string, unknown> = {};
  const putCV = (k: string, v: unknown) => {
    if (v != null && v !== "") cv[k] = v;
  };
  putCV("uei", row.uei);
  putCV("primary_naics", (row.naics_codes || [])[0]);
  putCV("cert_type", row.primary_cert);
  putCV("sam_expiry_date", row.registration_expiration_date);
  putCV("city", row.city);
  putCV("state", row.state);
  putCV("email_quality", row.email_quality || "unknown");
  if (Object.keys(cv).length) payload.custom_variables = cv;
  return payload;
}

async function syncLead(
  supabase: SupabaseClient,
  row: any,
): Promise<{ status: string; code?: number }> {
  const payload = toInstantlyLead(row);
  if (!payload.campaign) return { status: "skip" };

  const { status, body } = await instantlyRequest("/leads", { method: "POST", body: payload });

  if (status >= 200 && status < 300) {
    const leadId = body?.id || body?.lead_id || null;
    await supabase.from("leads").update({
      synced_to_instantly_at: new Date().toISOString(),
      instantly_lead_id: leadId,
      instantly_campaign_id: payload.campaign,
    }).eq("id", row.id);
    return { status: "ok" };
  }
  if (status === 409) {
    const leadId = body?.id || body?.lead_id || body?.existing_id || null;
    await supabase.from("leads").update({
      synced_to_instantly_at: new Date().toISOString(),
      instantly_lead_id: leadId,
      instantly_campaign_id: payload.campaign,
    }).eq("id", row.id);
    return { status: "dup" };
  }
  if (status === 429) return { status: "ratelimit" };
  if (status >= 400 && status < 500) {
    await supabase
      .from("failed_emails")
      .insert({
        email: row.email,
        reason: `instantly_${status}`,
        details: typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500),
        created_at: new Date().toISOString(),
      })
      .then(
        () => {},
        () => {},
      );
    return { status: "fail_4xx", code: status };
  }
  return { status: "fail_5xx", code: status };
}

export async function sync(
  opts: { cert: string },
): Promise<{ synced: number; skipped?: boolean; reason?: string }> {
  const supabase = pipelineSupabase();
  const cert = opts.cert.toLowerCase();
  const SYNC_ALLOWED_CERTS = (process.env.SYNC_ALLOWED_CERTS || "hubzone")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ALLOW_RUNNING = process.env.ALLOW_RUNNING === "1";

  // Dual gate — DB flag AND env allow-list.
  const { data: qs, error: qerr } = await supabase
    .from("cert_queue_state")
    .select("cert, sync_enabled")
    .eq("cert", cert)
    .single();
  const dbOk = !qerr && qs?.sync_enabled === true;
  const envOk = SYNC_ALLOWED_CERTS.includes(cert);
  if (!dbOk || !envOk) {
    return { synced: 0, skipped: true, reason: `sync_gate(db=${dbOk},env=${envOk})` };
  }

  // Eligible leads for this cert.
  const { data: eligible, error } = await supabase
    .from("leads")
    .select(
      "id, email, first_name, last_name, company, phone, uei, naics_codes, " +
        "primary_cert, registration_expiration_date, city, state, email_quality, " +
        "email_verification_status, source, synced_to_instantly_at, registration_status, ingest_tier",
    )
    .eq("email_verification_status", "valid")
    .is("synced_to_instantly_at", null)
    .in("source", VALID_SOURCES)
    .in("primary_cert", VALID_CERTS)
    .eq("primary_cert", cert)
    .eq("ingest_tier", "primary")
    .not("email", "is", null)
    .limit(parseInt(process.env.SYNC_LIMIT || "800", 10));
  if (error) throw new Error(`supabase read: ${error.message}`);
  if (!eligible?.length) return { synced: 0, skipped: true, reason: "nothing_to_sync" };

  // Campaign pause precheck.
  const campaignId = CAMPAIGN_MAP[cert];
  const { status: cStatus, body: cBody } = await instantlyRequest(`/campaigns/${campaignId}`);
  const running = cStatus === 200 && cBody?.status === 1;
  if (running && !ALLOW_RUNNING) {
    return { synced: 0, skipped: true, reason: "campaign_running" };
  }

  let synced = 0;
  const rowsAll = eligible as unknown as any[];
  for (let i = 0; i < rowsAll.length; i += BATCH_SIZE) {
    const rows = rowsAll.slice(i, i + BATCH_SIZE);
    for (const row of rows) {
      if (row.registration_status && !/^(A|active)$/i.test(row.registration_status)) continue;
      const r = await syncLead(supabase, row);
      if (r.status === "ok" || r.status === "dup") synced += 1;
      if (r.status === "ratelimit") await sleep(60_000);
      else await sleep(250);
    }
  }
  return { synced };
}
