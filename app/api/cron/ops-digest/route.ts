/**
 * /api/cron/ops-digest — daily ops digest email cron (PR 4).
 *
 * Schedule: 7 12 * * 1-5 UTC (08:07 EDT / 07:07 EST Mon-Fri).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Query params:
 *   ?dry=1                            — fetch + render, return JSON, no send/persist
 *   ?to=<email>&test_token=<token>    — override recipient (token must match
 *                                       process.env.DIGEST_TEST_TOKEN); persists
 *                                       with test_recipient=true
 *   ?force=1                          — bypass UTC-day idempotency
 *
 * Idempotency: per UTC day, refuses to double-send unless ?force=1, ?dry=1,
 * or test_recipient. Tracked in digest_runs.
 *
 * On Resend failure: 1 retry after 2s; on second failure → cron_alerts +
 * persist digest_runs row with rollup_status='error'. Always returns 200 so
 * Vercel does not double-fire.
 *
 * See docs/architecture/pr4-digest-email-plan.md.
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { pipelineSupabase } from "@/lib/pipeline/supabase";
import { alert } from "@/lib/pipeline/alerts";
import { fetchDigestData } from "@/lib/digest/fetch";
import { renderDigest } from "@/lib/digest/render";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;
const PRODUCTION_RECIPIENT = "willitfreez@gmail.com";
const DEFAULT_FROM = "ContractsIntel Ops <system@contractsintel.com>";

interface RouteOpts {
  dry: boolean;
  force: boolean;
  testRecipient: string | null;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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
    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const toParam = url.searchParams.get("to");
  const testToken = url.searchParams.get("test_token");

  // Test-recipient guard: ?to= REQUIRES a matching test_token, regardless of dry.
  let testRecipient: string | null = null;
  if (toParam) {
    const expected = process.env.DIGEST_TEST_TOKEN;
    if (!expected || testToken !== expected) {
      return NextResponse.json(
        { error: "Invalid or missing test_token for ?to= override" },
        { status: 400 },
      );
    }
    testRecipient = toParam;
  }

  const opts: RouteOpts = { dry, force, testRecipient };
  const runId = crypto.randomUUID();
  const supabase = pipelineSupabase();
  const now = new Date();

  // Idempotency check: skip when prod-mode and not forced.
  if (!opts.dry && !opts.testRecipient && !opts.force) {
    const startToday = startOfUtcDay(now);
    const startTomorrow = new Date(startToday.getTime() + DAY_MS);
    const { data } = await supabase
      .from("digest_runs")
      .select("id")
      .gte("sent_at", startToday.toISOString())
      .lt("sent_at", startTomorrow.toISOString())
      .eq("dry", false)
      .eq("test_recipient", false)
      .limit(1);
    if (data && data.length) {
      return NextResponse.json({
        skipped: true,
        reason: "already_sent_today",
        run_id: runId,
      });
    }
  }

  // Fetch + render. Wrapped in try/catch so we still write a digest_runs row
  // on a render error (and return 200).
  let data;
  let rendered;
  try {
    data = await fetchDigestData(supabase, runId, { now });
    rendered = renderDigest(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[${runId}] ops-digest fetch/render failed: ${msg}`);
    await alert(supabase, runId, "error", "ops-digest", "Fetch/render failed", { error: msg });
    if (!opts.dry) {
      await supabase.from("digest_runs").insert({
        run_id: runId,
        recipient: opts.testRecipient ?? PRODUCTION_RECIPIENT,
        subject: "(render failed)",
        rollup_status: "error",
        health_run_id: null,
        body_excerpt: msg.slice(0, 500),
        resend_id: null,
        dry: false,
        test_recipient: !!opts.testRecipient,
      });
    }
    return NextResponse.json({ error: "render_failed", run_id: runId, message: msg });
  }

  if (opts.dry) {
    return NextResponse.json({
      run_id: runId,
      dry: true,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      data,
    });
  }

  // Send via Resend, with one retry.
  const recipient = opts.testRecipient ?? PRODUCTION_RECIPIENT;
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const resend = new Resend(process.env.RESEND_API_KEY);

  let result = await sendOnce(resend, from, recipient, rendered.subject, rendered.html, rendered.text);
  if (!result.ok) {
    console.log(`[${runId}] ops-digest send #1 failed: ${result.error}`);
    await sleep(2000);
    result = await sendOnce(resend, from, recipient, rendered.subject, rendered.html, rendered.text);
  }

  let resendId: string | null = null;
  let rollupStatus: string;
  if (!result.ok) {
    console.log(`[${runId}] ops-digest send #2 failed: ${result.error}`);
    await alert(
      supabase,
      runId,
      "error",
      "ops-digest",
      "Resend send failed twice",
      { error: result.error },
    );
    rollupStatus = "error";
  } else {
    resendId = result.id;
    rollupStatus = data.health.rollup;
  }

  const insertRes = await supabase.from("digest_runs").insert({
    run_id: runId,
    recipient,
    subject: rendered.subject,
    rollup_status: rollupStatus,
    health_run_id: data.health.runId,
    body_excerpt: rendered.text.slice(0, 500),
    resend_id: resendId,
    dry: false,
    test_recipient: !!opts.testRecipient,
  });
  if (insertRes.error) {
    console.log(`[${runId}] digest_runs insert failed: ${insertRes.error.message}`);
  }

  // Retention cleanup — mirrors PR 3.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString();
  const delRes = await supabase
    .from("digest_runs")
    .delete()
    .lt("created_at", cutoff);
  if (delRes.error) {
    console.log(`[${runId}] digest_runs retention delete failed: ${delRes.error.message}`);
  }

  return NextResponse.json({
    run_id: runId,
    sent: result.ok,
    recipient,
    subject: rendered.subject,
    rollup_status: rollupStatus,
    resend_id: resendId,
    test_recipient: !!opts.testRecipient,
    error: result.ok ? null : result.error,
  });
}
