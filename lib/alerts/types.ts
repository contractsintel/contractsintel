/**
 * Shared types for the alert dispatcher (PR 5).
 *
 * See docs/architecture/pr5-alert-dispatcher-plan.md.
 */

export type AlertSeverity = "info" | "warn" | "error" | "critical";

export type DispatchMode = "single" | "batched" | "storm-summary";

export type DispatchStatus = "sent" | "failed" | "dry";

/**
 * One pending alert pulled from cron_alerts that the dispatcher considers
 * for sending. Mirrors the columns selected in the cursor query (§1.3).
 */
export interface PendingAlert {
  id: number;
  created_at: string;
  severity: AlertSeverity;
  source: string;
  message: string;
  context: Record<string, unknown> | null;
  run_id: string | null;
  acked_at: string | null;
}

/**
 * Output of a render function. Inline-CSS HTML, plain-text twin, subject,
 * and the canonical ack URL embedded in the email.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  ackUrl: string;
  alertIds: number[];
  mode: DispatchMode;
}

/**
 * Inputs for the renderers. `dispatcherRunId` is the run_id of the
 * dispatcher tick that is sending this email; it is embedded in the
 * ack URL so the ack endpoint can record the originating dispatch run.
 */
export interface RenderInput {
  alerts: PendingAlert[];
  dispatcherRunId: string;
  baseUrl: string;
  ts: number; // unix seconds — used for HMAC + 7d expiry
}
