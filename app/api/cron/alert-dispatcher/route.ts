/**
 * /api/cron/alert-dispatcher — critical alert dispatcher cron (PR 5).
 *
 * Schedule: every 5 minutes (cron: star-slash-5 * * * *) UTC.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Query params:
 *   ?dry=1   — fetch + render, return JSON, no send/persist
 *
 * Idempotency: cursor query in lib/alerts/dispatch.ts:fetchPending() — no
 * separate state table. Reads from alert_dispatches WHERE status='sent'.
 *
 * Anti-loop: SELECT filters source <> 'alert-dispatcher'; meta-alert on
 * send-failed-twice uses source='alert-dispatcher'. Both halves use the
 * DISPATCHER_SOURCE constant from lib/alerts/dispatch.ts.
 *
 * Fail-closed: if ALERT_ACK_SECRET is missing, the route returns 500 + a
 * machine-readable error and writes NOTHING to alert_dispatches and calls
 * NO Resend. Plan §7.
 *
 * On send failure (twice): persist alert_dispatches row status='failed',
 * raise a meta-alert via lib/pipeline/alerts.ts, return 200.
 *
 * Retention: 90d on alert_dispatches, deleted inline at end of route.
 *
 * See docs/architecture/pr5-alert-dispatcher-plan.md.
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { pipelineSupabase } from "@/lib/pipeline/supabase";
import { alert } from "@/lib/pipeline/alerts";
import {
  DISPATCHER_SOURCE,
  fetchPending,
  groupForSend,
  persistDispatch,
  renderForMode,
  sendWithRetry,
} from "@/lib/alerts/dispatch";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;
const PRODUCTION_RECIPIENT = "willitfreez@gmail.com";
const DEFAULT_FROM = "ContractsIntel Ops <system@contractsintel.com>";

function inferBaseUrl(req: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (explicit) {
    return explicit.startsWith("http") ? explicit : `https://${explicit}`;
  }
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://contractsintel.com";
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const runId = crypto.randomUUID();

  // Fail-closed when secret missing — covers both dry and live so we never
  // produce links the ack endpoint cannot verify.
  if (!process.env.ALERT_ACK_SECRET) {
    return NextResponse.json(
      { error: "ALERT_ACK_SECRET not configured", run_id: runId },
      { status: 500 },
    );
  }

  const supabase = pipelineSupabase();
  const baseUrl = inferBaseUrl(request);
  const ts = Math.floor(Date.now() / 1000);

  // 1. Fetch pending. Errors here surface as 200 + meta-alert (don't double-fire cron).
  let pending;
  try {
    pending = await fetchPending(supabase);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[${runId}] alert-dispatcher fetch failed: ${msg}`);
    await alert(supabase, runId, "error", DISPATCHER_SOURCE, "fetchPending failed", { error: msg });
    return NextResponse.json({ run_id: runId, dispatched: 0, error: "fetch_failed", message: msg });
  }

  const mode = groupForSend(pending);

  // 2. Nothing to do.
  if (!mode) {
    return NextResponse.json({ run_id: runId, dispatched: 0, mode: null, dry });
  }

  // 3. Render.
  let rendered;
  try {
    rendered = renderForMode({ alerts: pending, dispatcherRunId: runId, baseUrl, ts });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[${runId}] alert-dispatcher render failed: ${msg}`);
    await alert(supabase, runId, "error", DISPATCHER_SOURCE, "Render failed", { error: msg });
    return NextResponse.json({ run_id: runId, dispatched: 0, error: "render_failed", message: msg });
  }

  // 4. Dry mode: return the render, no DB writes, no Resend.
  if (dry) {
    return NextResponse.json({
      run_id: runId,
      dry: true,
      would_dispatch: pending.length,
      mode: rendered.mode,
      subject: rendered.subject,
      alert_ids: rendered.alertIds,
      ack_url: rendered.ackUrl,
      html: rendered.html,
      text: rendered.text,
    });
  }

  // 5. Send via Resend (one retry).
  const recipient = PRODUCTION_RECIPIENT;
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const send = await sendWithRetry(resend, from, recipient, rendered);

  // 6. Persist + on-failure meta-alert.
  if (!send.ok) {
    console.log(`[${runId}] alert-dispatcher send failed twice: ${send.error}`);
    await persistDispatch(supabase, {
      runId,
      rendered,
      recipient,
      status: "failed",
      resendId: null,
      errorMessage: send.error,
      attempt: send.attempt,
    });
    await alert(supabase, runId, "error", DISPATCHER_SOURCE, "Resend send failed twice", {
      error: send.error,
      mode: rendered.mode,
      alert_ids: rendered.alertIds,
    });
  } else {
    await persistDispatch(supabase, {
      runId,
      rendered,
      recipient,
      status: "sent",
      resendId: send.resendId,
      errorMessage: null,
      attempt: send.attempt,
    });
  }

  // 7. Retention — mirrors PR 3/PR 4.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString();
  const delRes = await supabase.from("alert_dispatches").delete().lt("created_at", cutoff);
  if (delRes.error) {
    console.log(`[${runId}] alert_dispatches retention delete failed: ${delRes.error.message}`);
  }

  // Always 200 — never throw, never let Vercel re-fire.
  return NextResponse.json({
    run_id: runId,
    dispatched: send.ok ? rendered.alertIds.length : 0,
    mode: rendered.mode,
    subject: rendered.subject,
    alert_ids: rendered.alertIds,
    recipient,
    resend_id: send.resendId,
    sent: send.ok,
    error: send.ok ? null : send.error,
  });
}
