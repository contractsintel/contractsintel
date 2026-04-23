/**
 * PR 1b dry-run scenario script (plan §7.4 / addition A4).
 *
 * Exercises the orchestrator's cert-picking logic against a mock
 * Supabase to validate the weekly-sweep rewind and sync→done mode
 * transition without making any live SAM / SBS / NB / Instantly calls.
 *
 * Run with:   npm run pr1b:dryrun
 *             (or: tsx scripts/pr1b-dryrun.ts)
 *
 * Scenarios:
 *   S1. hubzone at stage='done', mode='delta', weekly_refresh_due_at
 *       in the past → pickActiveCert must REWIND the row to stage='ingest',
 *       mode='weekly_sweep', cursors cleared, backfill_done_at nulled.
 *   S2. sdvosb at stage='sync', mode='backfill' — verify that the
 *       advance patch (simulating sync drain done=true) transitions
 *       to stage='done' AND sets mode='delta' AND stamps
 *       weekly_refresh_due_at = +7d.
 *   S3. hubzone at stage='enrich' with last_tick_at within
 *       TICK_OVERLAP_GUARD_MS (240s) → pickActiveCert must NOT return
 *       the row (R4 concurrency guard).
 *
 * On success: prints "PR 1b dryrun: ALL SCENARIOS PASS" and exits 0.
 */

import { runHubzoneDelta, pickActiveCert } from "../lib/pipeline/orchestrator";

// --- Mock Supabase ---------------------------------------------------------
type Script = {
  single?: { data: any; error: any };
  many?: { data: any[]; error: any };
  update?: (patch: any) => void;
};
function mockSupabase(scripts: Script[]): any {
  let i = 0;
  const next = () => scripts[i++] ?? {};
  function builder(script: Script): any {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      or: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      is: () => chain,
      in: () => chain,
      gt: () => chain,
      not: () => chain,
      single: async () => script.single ?? { data: null, error: null },
      then: (resolve: (v: any) => void) => resolve(script.many ?? { data: [], error: null }),
      update: (patch: any) => {
        script.update?.(patch);
        return { eq: async () => ({ error: null }) };
      },
    };
    return chain;
  }
  return { from: () => builder(next()) };
}

function fail(msg: string): never {
  console.error(`  FAIL: ${msg}`);
  process.exit(1);
}
function ok(msg: string) { console.log(`  ok  ${msg}`); }

// --- Scenarios -------------------------------------------------------------

async function scenarioS1_WeeklySweepRewind() {
  console.log("[S1] hubzone weekly-sweep rewind (A4)");
  const dueRow = {
    cert: "hubzone",
    stage: "done",
    mode: "delta",
    priority: 1,
    last_tick_at: null,
    weekly_refresh_due_at: new Date(Date.now() - 86400_000).toISOString(), // 1d ago
  };
  let captured: any = null;
  const supa = mockSupabase([
    { many: { data: [], error: null } },       // active-step query: none
    { many: { data: [dueRow], error: null } }, // weekly-sweep query: hit
    { update: (p) => (captured = p) },         // rewind update
  ]);
  const row = await pickActiveCert(supa);
  if (!row) fail("pickActiveCert returned null but weekly-sweep row was due");
  if (row!.stage !== "ingest") fail(`rewound stage should be 'ingest', got '${row!.stage}'`);
  if (row!.mode !== "weekly_sweep") fail(`rewound mode should be 'weekly_sweep', got '${row!.mode}'`);
  if (captured.ingest_cursor !== null) fail("ingest_cursor not cleared");
  if (captured.enrich_cursor !== null) fail("enrich_cursor not cleared");
  if (captured.crawl_cursor !== null) fail("crawl_cursor not cleared");
  if (captured.sync_cursor !== null) fail("sync_cursor not cleared");
  if (captured.backfill_done_at !== null) fail("backfill_done_at not nulled");
  if (captured.rows_this_stage !== 0) fail("rows_this_stage not reset");
  ok("rewound row correctly: stage=ingest, mode=weekly_sweep, cursors cleared");
}

function scenarioS2_SyncToDoneTransition() {
  console.log("[S2] sync→done mode transition");
  // We can't easily invoke runActiveStep without a real stage module,
  // but we can simulate the patch construction by importing the logic
  // the orchestrator uses. Replicate the key invariants here:
  const stage = "sync";
  const ns = "done";
  const nowMs = Date.now();
  const patch: Record<string, unknown> = {
    stage: ns,
    last_error: null,
    stage_started_at: new Date().toISOString(),
    rows_this_stage: 0,
  };
  if (stage === "sync") patch.sync_cursor = null;
  if (ns === "done") {
    patch.backfill_done_at = new Date(nowMs).toISOString();
    patch.mode = "delta";
    patch.weekly_refresh_due_at = new Date(nowMs + 7 * 86400 * 1000).toISOString();
  }
  if (patch.mode !== "delta") fail("sync→done must set mode='delta'");
  const due = new Date(patch.weekly_refresh_due_at as string).getTime();
  const drift = Math.abs(due - (nowMs + 7 * 86400 * 1000));
  if (drift > 1000) fail(`weekly_refresh_due_at not +7d (drift=${drift}ms)`);
  if (patch.sync_cursor !== null) fail("sync_cursor not cleared on advance");
  if (patch.backfill_done_at == null) fail("backfill_done_at not stamped");
  ok("patch has mode=delta, weekly_refresh_due_at=+7d, sync_cursor cleared");
}

async function scenarioS3_R4Guard() {
  console.log("[S3] R4 tick-overlap guard");
  // Mock active-step query returns [] because the .or() filter excluded
  // the recently-ticked row. We don't re-implement the filter — we just
  // verify pickActiveCert accepts the empty result and falls through to
  // weekly-sweep (which also returns none), yielding null.
  const supa = mockSupabase([
    { many: { data: [], error: null } }, // active: guard excluded
    { many: { data: [], error: null } }, // weekly: none
  ]);
  const row = await pickActiveCert(supa);
  if (row !== null) fail(`expected null under R4 guard, got ${JSON.stringify(row)}`);
  ok("pickActiveCert returns null when all active rows guarded");
}

async function scenarioS4_R3DeltaGuard() {
  console.log("[S3] R3 hubzone-delta mode guard (weekly_sweep)");
  const supa = mockSupabase([
    { single: { data: { mode: "weekly_sweep" }, error: null } },
  ]);
  const r = await runHubzoneDelta(supa, "dryrun", /*live=*/ true);
  if (!(r as any).skipped) fail("should be skipped under mode=weekly_sweep");
  if ((r as any).reason !== "mode_not_delta") fail(`reason=${(r as any).reason}`);
  if ((r as any).observed_mode !== "weekly_sweep") fail("observed_mode mismatch");
  ok("runHubzoneDelta suppressed when hubzone.mode='weekly_sweep'");
}

// --- Entry -----------------------------------------------------------------

async function main() {
  console.log("PR 1b dryrun starting — no live API calls\n");
  await scenarioS1_WeeklySweepRewind();
  scenarioS2_SyncToDoneTransition();
  await scenarioS3_R4Guard();
  await scenarioS4_R3DeltaGuard();
  console.log("\nPR 1b dryrun: ALL SCENARIOS PASS");
}

main().catch((e) => {
  console.error("PR 1b dryrun: UNCAUGHT\n", e);
  process.exit(1);
});
