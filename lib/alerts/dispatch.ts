/**
 * Core dispatch logic for the alert dispatcher (PR 5).
 *
 * - `fetchPending()` — reads cron_alerts using the cursor in plan §1.3.
 * - `groupForSend()` — picks the render mode based on alert count.
 * - `dispatch()` — renders + sends + persists alert_dispatches row.
 *
 * The route handler at app/api/cron/alert-dispatcher/route.ts owns auth,
 * dry-mode, retention, and the meta-alert call. This module is pure logic
 * where possible (Supabase + Resend injected by the caller).
 *
 * Anti-loop guard: source=alert-dispatcher is filtered out of the SELECT
 * AND used as the source for the meta-alert on send failure. Both halves
 * use the DISPATCHER_SOURCE constant — non-negotiable per plan §7.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resend } from "resend";

import { renderBatched, renderSingle, renderStormSummary } from "./render";
import type {
  DispatchMode,
  DispatchStatus,
  PendingAlert,
  RenderedEmail,
} from "./types";

export const DISPATCHER_SOURCE = "alert-dispatcher";
const STORM_THRESHOLD = 10;
const FETCH_LIMIT = 50;

/**
 * Cursor query from plan §1.3. Returns up to 50 unacked critical/error alerts
 * created after the most-recent successful dispatch. Anti-loop guard applied.
 */
export async function fetchPending(supabase: SupabaseClient): Promise<PendingAlert[]> {
  // 1. Resolve cursor: max(created_at) where status='sent'.
  const { data: cursorRow, error: cursorErr } = await supabase
    .from("alert_dispatches")
    .select("created_at")
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1);
  if (cursorErr) throw new Error(`fetchPending cursor query failed: ${cursorErr.message}`);
  const cursor = cursorRow && cursorRow.length ? cursorRow[0].created_at : "1970-01-01T00:00:00Z";

  // 2. Pull pending alerts.
  const { data, error } = await supabase
    .from("cron_alerts")
    .select("id, created_at, severity, source, message, context, run_id, acked_at")
    .in("severity", ["error", "critical"])
    .neq("source", DISPATCHER_SOURCE)
    .is("acked_at", null)
    .gt("created_at", cursor)
    .order("created_at", { ascending: true })
    .limit(FETCH_LIMIT);
  if (error) throw new Error(`fetchPending select failed: ${error.message}`);
  return (data ?? []) as PendingAlert[];
}

export function groupForSend(alerts: PendingAlert[]): DispatchMode | null {
  if (alerts.length === 0) return null;
  if (alerts.length === 1) return "single";
  if (alerts.length <= STORM_THRESHOLD) return "batched";
  return "storm-summary";
}

export interface DispatchInput {
  alerts: PendingAlert[];
  dispatcherRunId: string;
  baseUrl: string;
  ts: number;
}

export function renderForMode(input: DispatchInput): RenderedEmail {
  const mode = groupForSend(input.alerts);
  if (!mode) throw new Error("renderForMode called with 0 alerts");
  const renderInput = {
    alerts: input.alerts,
    dispatcherRunId: input.dispatcherRunId,
    baseUrl: input.baseUrl,
    ts: input.ts,
  };
  if (mode === "single") return renderSingle(renderInput);
  if (mode === "batched") return renderBatched(renderInput);
  return renderStormSummary(renderInput);
}

export interface SendResult {
  ok: boolean;
  resendId: string | null;
  error: string | null;
  attempt: number;
}

async function sendOnce(
  resend: Resend,
  from: string,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  try {
    const result = await resend.emails.send({ from, to, subject, html, text });
    if ((result as { error?: unknown }).error) {
      const e = (result as { error: { message?: string } }).error;
      return { ok: false, error: e?.message ?? JSON.stringify(e) };
    }
    const id =
      (result as { data?: { id?: string } }).data?.id ??
      (result as { id?: string }).id ??
      null;
    return { ok: true, id };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Send via Resend with one retry. Mirrors ops-digest sendOnce idiom.
 */
export async function sendWithRetry(
  resend: Resend,
  from: string,
  to: string,
  rendered: RenderedEmail,
): Promise<SendResult> {
  let r = await sendOnce(resend, from, to, rendered.subject, rendered.html, rendered.text);
  if (r.ok) return { ok: true, resendId: r.id, error: null, attempt: 1 };
  await sleep(2000);
  r = await sendOnce(resend, from, to, rendered.subject, rendered.html, rendered.text);
  if (r.ok) return { ok: true, resendId: r.id, error: null, attempt: 2 };
  return { ok: false, resendId: null, error: r.error, attempt: 2 };
}

export async function persistDispatch(
  supabase: SupabaseClient,
  args: {
    runId: string;
    rendered: RenderedEmail;
    recipient: string;
    status: DispatchStatus;
    resendId: string | null;
    errorMessage: string | null;
    attempt: number;
  },
): Promise<void> {
  const ins = await supabase.from("alert_dispatches").insert({
    run_id: args.runId,
    alert_ids: args.rendered.alertIds,
    alert_count: args.rendered.alertIds.length,
    mode: args.rendered.mode,
    recipient: args.recipient,
    subject: args.rendered.subject,
    resend_id: args.resendId,
    status: args.status,
    error_message: args.errorMessage,
    attempt: args.attempt,
  });
  if (ins.error) {
    console.log(`[${args.runId}] alert_dispatches insert failed: ${ins.error.message}`);
  }
}
