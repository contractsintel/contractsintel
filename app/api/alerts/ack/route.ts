/**
 * /api/alerts/ack — one-click HMAC-signed ack endpoint (PR 5).
 *
 * GET /api/alerts/ack?id=41&ts=<unix>&r=<runIdShort>&sig=<hex>
 * GET /api/alerts/ack?ids=41,42,43&ts=<unix>&r=<runIdShort>&sig=<hex>
 *
 * Verify steps (plan §5):
 *   1. parse → 400 on missing/malformed
 *   2. now - ts > 7d → 410 expired
 *   3. constant-time HMAC compare → 400 invalid
 *   4. UPDATE cron_alerts SET acked_at = now(),
 *        acked_by = 'email-ack-link:run_' || r_short
 *      WHERE id = ANY($1) AND acked_at IS NULL
 *   5. tiny inline-styled HTML success page
 *
 * Idempotency: WHERE acked_at IS NULL ⇒ second click is no-op; success
 * page still returns 200.
 *
 * acked_by audit format: `email-ack-link:run_<dispatcher_run_id_first_8>`
 * (user decision — links the ack click back to the dispatcher tick).
 */

import { NextRequest, NextResponse } from "next/server";
import { pipelineSupabase } from "@/lib/pipeline/supabase";
import { isFresh, verifyAck } from "@/lib/alerts/sign";

function htmlPage(title: string, body: string, status: number): NextResponse {
  const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:40px 20px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
${body}
</div>
</body></html>`;
  return new NextResponse(page, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function badRequest(msg: string): NextResponse {
  return htmlPage(
    "Ack — bad request",
    `<div style="font-weight:700;color:#dc2626;font-size:16px;">Invalid ack link</div>
     <div style="margin-top:8px;font-size:13px;color:#475569;">${msg}</div>`,
    400,
  );
}

function expired(): NextResponse {
  return htmlPage(
    "Ack — expired",
    `<div style="font-weight:700;color:#dc2626;font-size:16px;">Ack link expired</div>
     <div style="margin-top:8px;font-size:13px;color:#475569;">Ack links are valid for 7 days. Acknowledge directly via SQL:</div>
     <div style="margin-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:#f1f5f9;padding:8px;border-radius:4px;color:#334155;">UPDATE cron_alerts SET acked_at = now() WHERE id IN (...);</div>`,
    410,
  );
}

function parseIds(url: URL): number[] | null {
  const idStr = url.searchParams.get("id");
  const idsStr = url.searchParams.get("ids");
  if (idStr && idsStr) return null;
  const raw = idStr ? [idStr] : idsStr ? idsStr.split(",") : null;
  if (!raw || !raw.length) return null;
  const ids: number[] = [];
  for (const s of raw) {
    const t = s.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return null;
    ids.push(n);
  }
  // dedupe + sort
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Secret must be configured to verify; ack endpoint mirrors dispatcher's fail-closed.
  if (!process.env.ALERT_ACK_SECRET) {
    return badRequest("Server is not configured to verify ack links.");
  }

  const url = new URL(request.url);
  const ids = parseIds(url);
  const tsStr = url.searchParams.get("ts");
  const r = url.searchParams.get("r");
  const sig = url.searchParams.get("sig");

  if (!ids || !tsStr || !r || !sig) {
    return badRequest("Missing or malformed parameters.");
  }
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || ts <= 0) {
    return badRequest("Invalid timestamp.");
  }
  if (!/^[0-9a-f]{8}$/.test(r)) {
    return badRequest("Invalid run id.");
  }
  if (!/^[0-9a-f]+$/i.test(sig)) {
    return badRequest("Invalid signature.");
  }

  if (!isFresh(ts)) {
    return expired();
  }

  if (!verifyAck(ids, ts, r, sig)) {
    return badRequest("Signature does not match.");
  }

  // Update.
  const supabase = pipelineSupabase();
  const ackedBy = `email-ack-link:run_${r}`;
  const { data, error } = await supabase
    .from("cron_alerts")
    .update({ acked_at: new Date().toISOString(), acked_by: ackedBy })
    .in("id", ids)
    .is("acked_at", null)
    .select("id");

  if (error) {
    return htmlPage(
      "Ack — server error",
      `<div style="font-weight:700;color:#dc2626;font-size:16px;">Ack failed</div>
       <div style="margin-top:8px;font-size:13px;color:#475569;">${error.message}</div>`,
      500,
    );
  }

  // Even with no rows updated (already-acked / non-existent), we return 200.
  // Success page lists the ids the link covers.
  const idLabel = ids.map((n) => `#${n}`).join(",");
  const updatedCount = data?.length ?? 0;
  const stamp =
    new Date().toISOString().replace("T", " ").slice(11, 19) + " UTC";
  const note =
    updatedCount === ids.length
      ? ""
      : updatedCount === 0
      ? `<div style="margin-top:8px;font-size:12px;color:#64748b;">(Already acknowledged or no longer present.)</div>`
      : `<div style="margin-top:8px;font-size:12px;color:#64748b;">${updatedCount} of ${ids.length} updated; the rest were already acknowledged.</div>`;

  return htmlPage(
    "Ack — success",
    `<div style="font-weight:700;color:#16a34a;font-size:16px;">Alert(s) ${idLabel} acknowledged ✓ at ${stamp}.</div>
     <div style="margin-top:8px;font-size:13px;color:#475569;">You can close this tab.</div>
     ${note}`,
    200,
  );
}
