/**
 * Pure HTML/text renderers for the alert dispatcher (PR 5).
 *
 * `renderSingle()`, `renderBatched()`, `renderStormSummary()`.
 *
 * No async, no IO. Inline CSS only (Gmail strips <style>). 640px max width.
 *
 * Subject prefix is `[CI-ALERT]` (user decision — tighter mobile lock-screen
 * rendering than the longer `[ContractsIntel ALERT]`).
 *
 * Both single and batched footers state ack-link 7-day expiry plus the SQL
 * fallback. See docs/architecture/pr5-alert-dispatcher-plan.md §4.
 */

import { signAck } from "./sign";
import type { PendingAlert, RenderInput, RenderedEmail } from "./types";

const SUBJECT_PREFIX = "[CI-ALERT]";
const SEVERITY_COLOR = "#dc2626"; // red for both critical and error
const STORM_SHOW = 10;
const SUBJECT_MSG_CHARS = 60;

/* ===================== helpers ===================== */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + "Z";
  } catch {
    return iso;
  }
}

function severityBadge(sev: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:3px;background:${SEVERITY_COLOR};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${esc(sev)}</span>`;
}

function shortRunId(runId: string): string {
  return runId.replace(/-/g, "").slice(0, 8);
}

function buildAckUrl(
  baseUrl: string,
  ids: number[],
  ts: number,
  dispatcherRunId: string,
): string {
  const r = shortRunId(dispatcherRunId);
  const sig = signAck(ids, ts, r);
  const param =
    ids.length === 1 ? `id=${ids[0]}` : `ids=${[...ids].sort((a, b) => a - b).join(",")}`;
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/alerts/ack?${param}&ts=${ts}&r=${r}&sig=${sig}`;
}

function ackButton(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:#dc2626;color:#ffffff;padding:10px 18px;border-radius:5px;text-decoration:none;font-weight:600;font-size:14px;">${esc(label)}</a>`;
}

const FOOTER_HTML = `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;color:#64748b;font-size:11px;line-height:1.5;">
  Ack links expire after 7 days. After expiry, ack via SQL:
  <div style="margin-top:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#334155;">UPDATE cron_alerts SET acked_at = now() WHERE id IN (...);</div>
</div>`;

const FOOTER_TEXT = `\n--\nAck links expire after 7 days. After expiry, ack via SQL:\nUPDATE cron_alerts SET acked_at = now() WHERE id IN (...);\n`;

function contextPreview(ctx: Record<string, unknown> | null): string {
  if (!ctx || typeof ctx !== "object") return "";
  const keys = Object.keys(ctx).slice(0, 6);
  if (!keys.length) return "";
  const rows = keys
    .map((k) => {
      const v = (ctx as Record<string, unknown>)[k];
      const valStr = typeof v === "string" ? v : JSON.stringify(v);
      return `<tr><td style="padding:2px 8px 2px 0;color:#64748b;vertical-align:top;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(k)}</td><td style="padding:2px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">${esc(truncate(String(valStr ?? ""), 200))}</td></tr>`;
    })
    .join("");
  let full = "";
  try {
    full = JSON.stringify(ctx, null, 2);
  } catch {
    full = String(ctx);
  }
  return `<table style="border-collapse:collapse;font-size:12px;margin-top:6px;">${rows}</table>
<details style="margin-top:6px;font-size:12px;color:#64748b;"><summary style="cursor:pointer;">Full context JSON</summary><pre style="background:#f1f5f9;padding:8px;border-radius:4px;overflow-x:auto;font-size:11px;">${esc(truncate(full, 4000))}</pre></details>`;
}

function contextPreviewText(ctx: Record<string, unknown> | null): string {
  if (!ctx || typeof ctx !== "object") return "";
  const keys = Object.keys(ctx).slice(0, 6);
  if (!keys.length) return "";
  const lines = keys.map((k) => {
    const v = (ctx as Record<string, unknown>)[k];
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return `  ${k}: ${truncate(String(s ?? ""), 200)}`;
  });
  return "\nContext preview:\n" + lines.join("\n");
}

function shell(bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
<div style="max-width:640px;margin:0 auto;padding:20px;">
${bodyHtml}
</div>
</body></html>`;
}

/* ===================== single ===================== */

export function renderSingle(input: RenderInput): RenderedEmail {
  if (input.alerts.length !== 1) {
    throw new Error(`renderSingle requires exactly 1 alert, got ${input.alerts.length}`);
  }
  const a = input.alerts[0];
  const subject = truncate(
    `${SUBJECT_PREFIX} ${a.severity} · ${a.source} · ${a.message.replace(/\s+/g, " ").slice(0, SUBJECT_MSG_CHARS)}`,
    78,
  );
  const ackUrl = buildAckUrl(input.baseUrl, [a.id], input.ts, input.dispatcherRunId);
  const dispatcherShort = shortRunId(input.dispatcherRunId);
  const fired = fmtTime(a.created_at);
  const sourceRunSegment = a.run_id
    ? `<div style="margin:2px 0;"><span style="color:#64748b;">Run:</span> <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(a.run_id)}</span></div>`
    : "";

  const body = `
<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
  <div style="margin-bottom:12px;">${severityBadge(a.severity)} <span style="margin-left:8px;font-weight:600;font-size:14px;color:#0f172a;">Alert #${a.id}</span></div>
  <div style="font-size:13px;line-height:1.6;">
    <div style="margin:2px 0;"><span style="color:#64748b;">Source:</span> <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(a.source)}</span></div>
    ${sourceRunSegment}
    <div style="margin:2px 0;"><span style="color:#64748b;">Fired:</span> ${esc(fired)}</div>
  </div>
  <div style="margin-top:12px;">
    <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Message:</div>
    <div style="background:#f1f5f9;padding:10px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;">${esc(a.message)}</div>
  </div>
  ${
    a.context
      ? `<div style="margin-top:12px;"><div style="font-size:12px;color:#64748b;margin-bottom:4px;">Context preview:</div>${contextPreview(a.context)}</div>`
      : ""
  }
  <div style="margin-top:20px;">
    ${ackButton(ackUrl, "Acknowledge")}
    <div style="margin-top:8px;font-size:11px;color:#64748b;word-break:break-all;">${esc(ackUrl)}</div>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#64748b;">Dispatcher run_id: <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(dispatcherShort)}</span> · The morning ops-digest will also surface this alert.</div>
  ${FOOTER_HTML}
</div>`;

  const text = `${subject}

Alert #${a.id} [${a.severity.toUpperCase()}]
Source:  ${a.source}${a.run_id ? `\nRun:     ${a.run_id}` : ""}
Fired:   ${fired}

Message:
${a.message}
${contextPreviewText(a.context)}

Acknowledge: ${ackUrl}

Dispatcher run_id: ${dispatcherShort}
The morning ops-digest will also surface this alert.
${FOOTER_TEXT}`;

  return {
    subject,
    html: shell(body),
    text,
    ackUrl,
    alertIds: [a.id],
    mode: "single",
  };
}

/* ===================== batched ===================== */

function batchedTableRow(a: PendingAlert, baseUrl: string, ts: number, dispatcherRunId: string): string {
  const ackUrl = buildAckUrl(baseUrl, [a.id], ts, dispatcherRunId);
  return `<tr>
    <td style="padding:6px 8px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">#${a.id}</td>
    <td style="padding:6px 8px;border-top:1px solid #e5e7eb;">${severityBadge(a.severity)}</td>
    <td style="padding:6px 8px;border-top:1px solid #e5e7eb;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(a.source)}</td>
    <td style="padding:6px 8px;border-top:1px solid #e5e7eb;font-size:12px;">${esc(truncate(a.message.replace(/\s+/g, " "), 60))}</td>
    <td style="padding:6px 8px;border-top:1px solid #e5e7eb;font-size:12px;"><a href="${esc(ackUrl)}" style="color:#dc2626;text-decoration:none;">Ack</a></td>
  </tr>`;
}

export function renderBatched(input: RenderInput): RenderedEmail {
  if (input.alerts.length < 2) {
    throw new Error(`renderBatched requires ≥2 alerts, got ${input.alerts.length}`);
  }
  const n = input.alerts.length;
  const ids = input.alerts.map((a) => a.id);
  const subject = `${SUBJECT_PREFIX} ${n} critical/error events in last 5 min`;
  const ackAll = buildAckUrl(input.baseUrl, ids, input.ts, input.dispatcherRunId);
  const dispatcherShort = shortRunId(input.dispatcherRunId);

  const rows = input.alerts
    .map((a) => batchedTableRow(a, input.baseUrl, input.ts, input.dispatcherRunId))
    .join("");

  const body = `
<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
  <div style="font-weight:700;font-size:16px;color:#0f172a;margin-bottom:4px;">${n} critical/error events in last 5 min</div>
  <div style="font-size:12px;color:#64748b;margin-bottom:14px;">Dispatcher run_id: <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(dispatcherShort)}</span></div>
  <div style="margin-bottom:14px;">${ackButton(ackAll, `Acknowledge all ${n}`)}</div>
  <table style="width:100%;border-collapse:collapse;background:#ffffff;">
    <thead>
      <tr style="background:#f8fafc;">
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">#</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Severity</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Source</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Message</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Ack</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:14px;font-size:11px;color:#64748b;word-break:break-all;">Ack-all URL: ${esc(ackAll)}</div>
  ${FOOTER_HTML}
</div>`;

  const textRows = input.alerts
    .map(
      (a) =>
        `  #${a.id}  [${a.severity.toUpperCase()}]  ${a.source}  ${truncate(a.message.replace(/\s+/g, " "), 60)}`,
    )
    .join("\n");
  const text = `${subject}

${textRows}

Acknowledge all ${n}: ${ackAll}

Dispatcher run_id: ${dispatcherShort}
${FOOTER_TEXT}`;

  return {
    subject,
    html: shell(body),
    text,
    ackUrl: ackAll,
    alertIds: ids,
    mode: "batched",
  };
}

/* ===================== storm summary ===================== */

export function renderStormSummary(input: RenderInput): RenderedEmail {
  if (input.alerts.length <= STORM_SHOW) {
    throw new Error(
      `renderStormSummary requires >${STORM_SHOW} alerts, got ${input.alerts.length}`,
    );
  }
  const n = input.alerts.length;
  const ids = input.alerts.map((a) => a.id);
  const subject = `${SUBJECT_PREFIX} STORM — ${n} events in last 5 min (showing top 10)`;
  const top = input.alerts.slice(0, STORM_SHOW);
  const remaining = n - STORM_SHOW;
  const ackAll = buildAckUrl(input.baseUrl, ids, input.ts, input.dispatcherRunId);
  const dispatcherShort = shortRunId(input.dispatcherRunId);

  const rows = top
    .map((a) => batchedTableRow(a, input.baseUrl, input.ts, input.dispatcherRunId))
    .join("");

  const body = `
<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
  <div style="font-weight:700;font-size:16px;color:#dc2626;margin-bottom:4px;">STORM — ${n} events in last 5 min</div>
  <div style="font-size:12px;color:#64748b;margin-bottom:14px;">Showing top ${STORM_SHOW}. Dispatcher run_id: <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(dispatcherShort)}</span></div>
  <div style="margin-bottom:14px;">${ackButton(ackAll, `Acknowledge all ${n}`)}</div>
  <table style="width:100%;border-collapse:collapse;background:#ffffff;">
    <thead>
      <tr style="background:#f8fafc;">
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">#</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Severity</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Source</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Message</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Ack</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:10px;font-size:12px;color:#64748b;">…and ${remaining} more — see /admin/alerts dashboard or query cron_alerts.</div>
  <div style="margin-top:10px;font-size:11px;color:#64748b;word-break:break-all;">Ack-all URL: ${esc(ackAll)}</div>
  ${FOOTER_HTML}
</div>`;

  const textRows = top
    .map(
      (a) =>
        `  #${a.id}  [${a.severity.toUpperCase()}]  ${a.source}  ${truncate(a.message.replace(/\s+/g, " "), 60)}`,
    )
    .join("\n");
  const text = `${subject}

${textRows}

…and ${remaining} more — see /admin/alerts dashboard or query cron_alerts.

Acknowledge all ${n}: ${ackAll}

Dispatcher run_id: ${dispatcherShort}
${FOOTER_TEXT}`;

  return {
    subject,
    html: shell(body),
    text,
    ackUrl: ackAll,
    alertIds: ids,
    mode: "storm-summary",
  };
}
