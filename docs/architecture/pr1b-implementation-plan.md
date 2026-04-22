# PR 1b — Implementation Plan

**Status:** APPROVED 2026-04-22 by Raphael with 4 additions (see §12). Coding in progress.
**Target branch:** `pr1b-cursor-aware-stages`
**Build window:** 2026-04-22 afternoon → 2026-04-24 EOD
**Dependencies merged:** PR #8 (index drops), PR #11 (schema + types.ts + ingest signature + orchestrator ingest-only drain block)
**Depends on (time-gated for LIVE TEST only):** SAM probe 00:05 UTC 2026-04-23 green. Code-only build can proceed regardless (PIPELINE_LIVE=0 keeps all paths dry).

### PR #11 actual state (correction from draft)
The draft assumed PR #11 was schema-only. On re-inspection of `main` after merge, PR #11 also landed:
- `lib/pipeline/types.ts` (PipelineMode, StageCursor, DrainResult)
- `lib/pipeline/ingest.ts` accepting optional `cursor` (accepted but ignored; always returns `{done:true}`)
- `lib/pipeline/orchestrator.ts` drain-decision block for the **ingest** stage only; cursor clearing on stage advance for ingest/enrich/crawl; `stage_started_at` stamping; `rows_this_stage` reset.

PR 1b's remaining work is therefore:
1. Make `ingest()` actually USE the cursor (delta page resume, Extract token resume)
2. Extend DrainResult return shape + cursor-aware behavior to enrich/crawl/verify-*/sync
3. Extend orchestrator drain-block from ingest-only to ALL stages
4. Mode transitions (backfill→delta on done, weekly_sweep trigger/exit)
5. R3 hubzone delta guard + R4 concurrency guard
6. Tests + dry-run script

Revised LOC estimate: ~750 (down from 970).

---

## 1. Scope recap — what PR 1b unlocks that PR 1a didn't

**PR 1a (shipped as PR #11) delivered ONLY the schema.** It added the seven cursor/mode columns to `cert_queue_state` and promoted `hubzone` to `mode='delta'`. No code consumes those columns yet. Orchestrator and stage modules are still single-pass.

**PR 1b makes the pipeline actually cursor-aware.** After this ships:

| Capability | Before PR 1b | After PR 1b |
|---|---|---|
| Ingest a 10k-entity cert in ≤ 300s ticks | ❌ one tick holds entire universe | ✅ paginates across ticks via `ingest_cursor` |
| Resume a stage mid-flight after a crash/timeout | ❌ stage restarts from scratch | ✅ resumes from persisted cursor |
| Honor `mode` column (backfill/delta/weekly_sweep) | ❌ ingest receives hard-coded mode | ✅ orchestrator reads `row.mode` and routes |
| Auto-transition backfill → delta on completion | ❌ never sets mode=delta | ✅ on `sync→done`, sets `mode=delta`, `weekly_refresh_due_at=+7d` |
| Weekly sweep replay | ❌ no trigger | ✅ when `weekly_refresh_due_at <= now()`, rewind stage to ingest with `mode='weekly_sweep'` |
| Stall detection signal for PR 3 | ❌ no `stage_started_at` update | ✅ stamped on every stage-advance |
| Per-tick row visibility for digest | ❌ no counter | ✅ `rows_this_stage` incremented per drain |

**What PR 1b does NOT do:** no SAM cache (deferred to a later PR), no per-page fetch persistence of Extract tokens across ticks (see §6 edge case E3 — Extract tokens are single-use per job, not resumable the way opportunity pagination is), no changes to scrape-grants or scrape-usa (PR 2).

---

## 2. File-by-file change plan

### 2.1 New files

**`lib/pipeline/types.ts`** (new, ~30 LOC)
Single source of truth for shared pipeline types.
```ts
export type PipelineMode = "backfill" | "delta" | "weekly_sweep";
export type StageCursor = Record<string, unknown> | null;

export interface DrainResult {
  done: boolean;                    // true = stage complete, advance; false = persist cursor, stay
  next_cursor?: StageCursor;        // required when done=false
  requests?: number;                // HTTP requests this tick (for quota accounting)
  inserted?: number;                // rows written this tick
  rows_this_stage?: number;         // cumulative across ticks (caller increments)
  skipped?: boolean;                // legacy pass-through
  reason?: string;                  // legacy pass-through
  error?: string;                   // legacy pass-through
  // verify_poll-specific legacy field (kept for compat):
  waiting?: boolean;
  // verify_submit-specific legacy fields (kept for compat):
  jobId?: string;
  batchSize?: number;
}
```

### 2.2 Modified files

| File | LOC est. | Summary |
|---|---|---|
| `lib/pipeline/ingest.ts` | ~120 changed, ~60 added | Accept `cursor` + `mode`. Return `DrainResult`. Split delta path to yield page-by-page. Backfill path stays "run extract to completion in one tick" but returns `{done:true}` (see §3). |
| `lib/pipeline/enrich.ts` | ~40 changed | Accept optional `cursor`. Process ≤ 500 leads per tick via `id > cursor.last_lead_id`. Return DrainResult. |
| `lib/pipeline/crawl.ts` | ~40 changed | Same pattern as enrich, 200 leads/tick (slower per-row due to HTTP). |
| `lib/pipeline/verify-submit.ts` | ~20 changed | Return DrainResult (shape-only; behavior unchanged — still submits one batch per tick). |
| `lib/pipeline/verify-poll.ts` | ~20 changed | Return DrainResult. `done: false` when NB job still running. |
| `lib/pipeline/sync.ts` | ~30 changed | Accept optional cursor. Process ≤ 100 leads per tick. Return DrainResult. |
| `lib/pipeline/orchestrator.ts` | ~180 changed | Drain-decision block after each stage call. Read `mode`, `ingest_cursor`, etc. from QueueRow. Persist cursor or advance. On sync→done, promote to delta. On weekly_sweep trigger, rewind. |

### 2.3 Migration

**None.** All columns needed already exist (PR #11). If during build we discover a missing column we'll add a follow-up migration, but nothing is currently known to be needed.

### 2.4 Config / env

No new env vars. Optional tunables via existing env:
- `PIPELINE_DRAIN_ENRICH_CHUNK` (default 500)
- `PIPELINE_DRAIN_CRAWL_CHUNK` (default 200)
- `PIPELINE_DRAIN_SYNC_CHUNK` (default 100)

---

## 3. ingest.ts drain logic (the hardest piece)

### 3.1 Three modes, two code paths

| Mode | Code path | Cursor use | Done criteria |
|---|---|---|---|
| `delta` | paginated `/entities` | none (lookback window is implicit) | page returns `< PAGE_SIZE` rows |
| `backfill` | Extract API (start → poll → download → parse → upsert) | `{extract_token, started_at}` (optional, see 3.3) | extract parsed + upserted |
| `weekly_sweep` | identical to backfill | same | same |

### 3.2 Backfill single-tick behavior (what we're NOT changing)

Key insight: **SAM's Extract API is not a pagination primitive.** It's a bulk-dump primitive. You call `startExtract`, get a token, poll until ready, download the entire compressed file. There is no "page 2 of the extract."

So for backfill, **one call drains the entire cert universe in a single tick**. The existing `ingest.ts` already does this and generally fits inside 300s:

- HUBZone: ~30-60s (already verified by prior probe runs)
- 8a: ~60-90s
- SDVOSB / WOSB: ~90-180s (larger pools, closer to budget)

The drain behavior for backfill therefore is: **run the full extract, return `{done: true, next_cursor: null}`**. No cursor pagination needed. What PR 1b adds is the *option* to bail mid-flight and persist `{extract_token, started_at}` so the next tick can resume the poll (see 3.3).

### 3.3 Extract cursor — when it saves us

There are two failure modes the cursor handles:

**A. Poll timeout mid-flight.** `startExtract` returned a token, but after 240s of polling the file still isn't ready. Current behavior: throw, next tick starts a NEW extract (wasteful — the first one is still processing on SAM's side).

New behavior:
- Before starting an extract, check `cursor.extract_token`. If present and `cursor.started_at` is < 60 min old, resume polling the existing token instead of starting a new extract.
- If poll times out this tick: return `{done: false, next_cursor: {extract_token, started_at}}`.
- If poll succeeds: parse, upsert, return `{done: true, next_cursor: null}`.

**B. Parse/upsert crash.** The extract downloaded fine but the Supabase upsert failed (network glitch, timeout). Current behavior: throw, next tick re-runs the whole extract.

New behavior:
- Persist the downloaded raw file to Supabase Storage (`persistRawFile` already does this). Cursor stores `{raw_file_path}`.
- If cursor has `raw_file_path` and no `extract_token`: download from Storage, parse, upsert. Skip SAM round-trip entirely.
- After successful upsert: return `{done: true, next_cursor: null}`.

### 3.4 Pagination inside a delta tick

Delta already paginates (up to `DELTA_MAX_PAGES=50`). PR 1b changes two things:

1. **Cap at 10 pages per tick** (down from 50) to stay well under 300s. Multiple ticks will drain the full delta window naturally.
2. **Persist cursor** as `{page: N, lastUpdateFrom: "MM/DD/YYYY"}`. On next tick resume from `page=N+1`.
3. `done: true` when a page returns `< PAGE_SIZE`. Else `done: false, next_cursor: {page: N+1, lastUpdateFrom}`.

For HUBZone daily delta (expected <5 pages total), this almost always completes in one tick.

### 3.5 300s budget accounting (backfill)

Worst case: 8a extract. Timing budget:
- `startExtract`: 1-3s
- `pollExtract`: up to 240s (ceiling)
- `persistRawFile`: 1-5s (storage upload)
- `parseExtractFile`: 1-3s (gunzip + JSON.parse of ~10-20MB)
- `upsertRows`: 10-30s for 10k rows in 50 batches of 200

Total ceiling: ~280s. Tight but fits. Mitigation if we blow through: reduce `UPSERT_BATCH` to 100 and parallelize 2-3 batches (Supabase handles concurrent upserts fine on `dedup_key` unique constraint).

### 3.6 New ingest signature

```ts
export async function ingest(opts: {
  cert: string;
  mode: PipelineMode;
  cursor?: StageCursor;
}): Promise<DrainResult>
```

---

## 4. Enrich / crawl / verify / sync drain modifications

### 4.1 Enrich (SBS lookup)

- Current: queries `leads` where `cert_types` contains `cert` AND `sbs_checked_at IS NULL`, processes all in one tick.
- New: `WHERE sbs_checked_at IS NULL AND id > cursor.last_lead_id ORDER BY id LIMIT 500`.
- Done criteria: fewer than 500 returned.
- Next cursor: `{last_lead_id: max(id) in this batch}`.
- 2.5s per lookup × 500 = 1250s — **too slow.** Must parallelize 5 concurrently → 250s. Already has `DELAY_MS=2500` which we'll change to `PER_WORKER_DELAY=2500 / CONCURRENCY=5`.

### 4.2 Crawl

- Similar cursor pattern, limit 200/tick (12s fetch timeout × 200 = 2400s worst case → parallelize 10 concurrently → 240s).
- `last_lead_id` cursor.
- Existing per-domain throttle preserved.

### 4.3 verify_submit

- Behavior unchanged (one batch per tick already). Just shape-change to DrainResult.
- Always returns `done: true` (batch submitted → advance to verify_poll).

### 4.4 verify_poll

- Already behaves drain-like (loops inside tick). Shape-change: `done: false` when NB status = running, `done: true` when finalized.
- `next_cursor` unused (job_id lives in cert_queue_state.nb_job_id, not in cursor jsonb).

### 4.5 sync

- Current: pushes all eligible leads to Instantly in one tick (50/batch).
- New: `WHERE synced_to_instantly_at IS NULL AND id > cursor.last_lead_id LIMIT 100`.
- 100 leads × 1 API call per batch-of-50 = 2 calls/tick. Fast.
- Done criteria: fewer than 100 returned.

---

## 5. Mode transitions

### 5.1 Backfill → delta (on completion)

In orchestrator, when advancing stage from `sync` to `done`:
```ts
const patch = {
  stage: "done",
  backfill_done_at: new Date().toISOString(),
  mode: row.mode === "backfill" ? "delta" : row.mode,  // don't overwrite weekly_sweep
  weekly_refresh_due_at: new Date(Date.now() + 7*86400_000).toISOString(),
  ingest_cursor: null,
  enrich_cursor: null,
  crawl_cursor: null,
  stage_started_at: new Date().toISOString(),
  rows_this_stage: 0,
};
```

### 5.2 Delta → weekly_sweep (on clock trigger)

In `pickActiveCert`, after the normal non-done query, add a second check:
```ts
// Find certs whose weekly refresh is overdue
const { data: weeklyDue } = await supabase
  .from("cert_queue_state")
  .select("*")
  .eq("stage", "done")
  .lt("weekly_refresh_due_at", new Date().toISOString())
  .order("weekly_refresh_due_at", { ascending: true })
  .limit(1);

if (weeklyDue?.length) {
  // Rewind this row to start weekly sweep
  await supabase.from("cert_queue_state").update({
    stage: "ingest",
    mode: "weekly_sweep",
    ingest_cursor: null,
    enrich_cursor: null,
    crawl_cursor: null,
    stage_started_at: new Date().toISOString(),
    rows_this_stage: 0,
    backfill_done_at: null,  // so it's not "done" anymore
  }).eq("cert", weeklyDue[0].cert);
  return weeklyDue[0];
}
```

### 5.3 Weekly_sweep → delta (on completion)

Same block as 5.1 but `mode: "delta"` is set regardless of prior mode (weekly_sweep always returns to delta after drain).

### 5.4 stage_started_at stamping

On every stage advance (whether normal, customAdvance, or mode transition), stamp `stage_started_at = now()` and reset `rows_this_stage = 0`. Also clear the just-completed stage's cursor.

On cursor-persist (stage NOT advancing), do NOT touch `stage_started_at` — that's what lets PR 3's stall detector work.

---

## 6. Edge cases

### E1. Extract token expires mid-drain
SAM Extract tokens are valid for ~24h. If cursor.started_at > 60 min old, treat token as stale, clear cursor, start fresh extract. Log `cron_alerts` severity='warn' source='ingest' dedup_key='extract_token_stale'.

### E2. Supabase write fails mid-cursor-save
Scenario: `upsertRows` succeeds for 200/500 enrich batch, then cursor update fails. Next tick reads old cursor → reprocesses the 200 just-written rows.

**Acceptable** because enrich/crawl/sync are all idempotent on `id`:
- Enrich: `UPDATE leads SET sbs_checked_at=..., sbs_result=... WHERE id=?` — reapplying is a no-op.
- Crawl: same pattern.
- Sync: `synced_to_instantly_at IS NULL` filter means a sync'd lead is skipped the second time.

Mitigation: write cursor FIRST (cheap single-row update), then the cursor points at the batch we're about to process. If the batch crashes, next tick re-runs from the same cursor. If the batch succeeds, we advance the cursor.

Actually on reflection: **write cursor AFTER successful batch**, because the current code pattern is `processBatch → updateCursor`. If we write cursor first, a crash leaves cursor ahead of actual progress → data gap. Writing after is correct — duplicates are safe (idempotent), gaps are not.

### E3. Orchestrator crashes between ingest and advance
Tick fails after `ingest` returned `{done:true}` but before orchestrator writes `{stage: "enrich", mode: ..., ingest_cursor: null}`.

Next tick: reads row with `stage='ingest'`, `ingest_cursor` still null (since we only clear on successful stage advance). Runs ingest AGAIN from scratch.

For delta: re-running is cheap (idempotent on `dedup_key`). Acceptable.
For backfill: re-running means another Extract round-trip (~60-180s of wasted SAM quota). **Mitigation:** orchestrator writes the "about to advance" update as the LAST step of the tick. If it fails, log critical `cron_alerts dedup_key='ingest_double_run_risk'`.

### E4. Multiple ticks overlap (cron runs while prior tick is still executing)
Vercel cron does NOT de-duplicate. If tick A is at 290s and tick B starts, both read the same `cert_queue_state` row.

Both could advance the cert. Or one could advance, one could write a cursor that the other overwrites.

**Mitigation:** add `last_tick_at > now() - 240s` guard in `pickActiveCert`. If another tick is active, skip the active cert path this tick (HUBZone delta still runs — different code path, different write targets).

This is a NEW behavior. Adds ~5 LOC. Low risk.

### E5. Cursor JSON corruption
A malformed `ingest_cursor` value (e.g. hand-edited in Supabase UI) breaks the stage reader. Wrap cursor read in try/catch; on parse error, log critical alert with `dedup_key='cursor_corrupt:{cert}:{stage}'`, set cursor to null, treat as fresh start.

### E6. `weekly_refresh_due_at` fires during active backfill
Current-ingesting cert has `stage='ingest'` (not 'done'), so the weekly-due query (which filters `stage='done'`) won't match. No-op. Correct.

### E7. Enrich batch all-skipped (every lead's `sbs_checked_at` already set)
Cursor advances but `inserted=0`. If the WHERE clause `sbs_checked_at IS NULL` returns zero, we correctly mark `done=true`. If it returns < LIMIT but > 0, also correctly `done=true`. Only corner case: exactly LIMIT rows returned but all fail mid-processing — cursor still advances to max(id). Acceptable (retry on next pass during weekly_sweep).

---

## 7. Testing strategy

### 7.1 Unit tests (new)

**`__tests__/pipeline/drain-result.test.ts`** — shape assertions (does every stage return valid DrainResult?)

**`__tests__/pipeline/cursor-persistence.test.ts`** — with a mock Supabase:
- Given mode='backfill', cursor=null → ingest called with cursor=null
- Given done=false, next_cursor={page:3} → cursor written, stage unchanged
- Given done=true → cursor cleared, stage advanced, stage_started_at stamped

**`__tests__/pipeline/mode-transitions.test.ts`**:
- On sync→done from backfill → mode='delta', weekly_refresh_due_at set
- On weekly_refresh_due_at < now() → picked, rewound to ingest with mode='weekly_sweep'
- On sync→done from weekly_sweep → mode='delta', refresh bumped

### 7.2 Mock-SAM integration test

**`scripts/pr1b-dryrun.ts`** — new throwaway script:
- Monkey-patches `global.fetch` to return canned SAM responses (a 1k-entity mini extract, a 5-page delta)
- Runs `runTick()` repeatedly until all certs reach `done`
- Asserts: cursor progresses, stage advances, `rows_this_stage` non-zero, no duplicate upserts
- Runs against a scratch Supabase project (NOT prod). Schema mirrored via `pnpm supabase db reset` on a local instance.

### 7.3 Prod smoke (after merge, before PIPELINE_LIVE=1)

1. Merge PR 1b. Keep `PIPELINE_LIVE=0` (default).
2. Manually trigger `/api/cron/cert-pipeline` via curl with Bearer CRON_SECRET. With PIPELINE_LIVE=0 every stage returns `{skipped:true}` — we only verify the orchestrator's mode-reading and weekly-due-scanning paths work without crashing.
3. Inspect Supabase: `cert_queue_state.last_tick_at` bumped, no cursor changes (correct, we were in dry-run).

### 7.4 Single-cert live canary

Once SAM probe is green AND PR 1b merged:
- Promote `sdvosb` (smallest universe, lowest-risk) to `stage='ingest', mode='backfill'`, set `PIPELINE_LIVE=1` but keep `SYNC_ALLOWED_CERTS=hubzone` (sync remains HUBZone-only).
- Let 4-6 ticks run. Watch `rows_this_stage`, `stage_started_at`, cron_alerts.
- Only after sdvosb reaches `done` with mode='delta' do we unlock 8a and wosb/edwosb.

---

## 8. Estimated LOC and time

| Area | LOC | Hours |
|---|---|---|
| `types.ts` (new) | 30 | 0.5 |
| `ingest.ts` cursor-aware | 180 | 4 |
| `enrich.ts` cursor-aware | 50 | 1.5 |
| `crawl.ts` cursor-aware | 50 | 1.5 |
| `verify-submit.ts` shape-only | 20 | 0.5 |
| `verify-poll.ts` shape-only | 20 | 0.5 |
| `sync.ts` cursor-aware | 40 | 1 |
| `orchestrator.ts` drain + mode transitions | 180 | 5 |
| Unit tests | 250 | 3 |
| Dry-run script | 150 | 2 |
| **Total** | **~970 LOC** | **~19.5 hours** |

Two full build days (Apr 23-24) with buffer. If SAM probe is red and triggers credential rotation, slips one day. Rotation takes ~2h, build can continue in parallel after rotation.

---

## 9. Risks

### R1. Per-tick time budget blows through 300s on 8a/wosb backfill
**Likelihood:** Medium. **Impact:** High (stage never advances, cert stalls).
**Mitigation:** Ship the Extract token cursor (§3.3). If poll times out at 240s, persist token, resume next tick. Adds one extra tick per backfill worst-case.

### R2. Cursor serialization bug corrupts state
**Likelihood:** Low. **Impact:** Medium (single cert stalls, caught by PR 3 stall detector within 6h).
**Mitigation:** E5 handler + unit tests for cursor round-trip. Canary on sdvosb first.

### R3. Orchestrator mode-transition logic interacts badly with existing HUBZone delta path
`runHubzoneDelta` at orchestrator.ts:59 is a SEPARATE path from `runActiveStep`. It hardcodes `mode:"delta"` and runs every tick regardless of `cert_queue_state.mode`.
**Issue:** After PR 1b, if hubzone's `cert_queue_state.mode='weekly_sweep'`, the hubzone delta task still fires in parallel with the active-step running hubzone weekly sweep.
**Mitigation:** Guard hubzone delta with `if cert_queue_state.mode === 'delta'` check. ~5 LOC.

### R4. Concurrency — two Vercel cron ticks overlap
See E4. **Mitigation:** `last_tick_at` guard. Small, low-risk change.

### R5. Enrich/crawl parallelization breaks existing politeness (per-domain throttle, SBS rate limits)
We're increasing concurrency from 1 to 5-10. SBS may 429. Upstream target sites may rate-limit crawl.
**Mitigation:** Keep per-domain throttle in crawl (already exists via `domainLastFetch` map — carry forward). For SBS, add a circuit breaker: if 3 consecutive 429s, sleep 60s. Write cron_alerts severity='warn'.

### R6. PR 1b lands but SAM probe still red
**Mitigation:** PR 1b is safe to merge regardless — PIPELINE_LIVE=0 keeps all paths dry. Merging unblocks the code side. Actual backfill only starts after probe green.

### R7. Dogfood window shrinks
If PR 1b slips by 1 day, PR 3 (health checks, starts Apr 25) slips, PR 4 (digest, starts Apr 27) slips, dogfood reduces from 7 days to 5-6.
**Mitigation:** Hold firm on the 2-day budget. If on Apr 24 EOD PR 1b is not feature-complete, cut scope: ship §3.3 Extract cursor in a follow-up PR 1c instead of bundling into 1b. Drain logic + mode transitions are the non-negotiable core.

---

## 10. Out of scope (deferred)

- SAM response cache (`sam_cache` table) — separate PR
- Grants/USA scraper cursor state — PR 2
- Health check cron — PR 3
- Per-cert quota tracking — no PR yet
- Dashboard surface of pipeline progress — no PR yet (digest covers it)

---

## 11. Greenlight checklist

Before starting PR 1b code:
- [ ] Raphael reviews this doc
- [ ] Agreement on §3 backfill single-tick approach (vs. forcing Extract into pagination)
- [ ] Agreement on §4 per-stage chunk sizes (500/200/100)
- [ ] Agreement on §5.2 weekly_sweep picker going ahead of normal picker
- [ ] Agreement on §7.4 sdvosb-first canary ordering
- [ ] SAM probe result known (green unlocks live testing path; red is fine for code-only merge)

On green: create branch `pr1b-cursor-aware-stages`, begin with `types.ts`, commit in this order:
1. types.ts (unblocks imports)
2. verify-submit.ts + verify-poll.ts (smallest shape changes, no behavior)
3. sync.ts (small, isolated)
4. enrich.ts + crawl.ts (medium)
5. ingest.ts (largest)
6. orchestrator.ts (integrates everything)
7. Unit tests alongside each
8. Dry-run script last

Each commit independently compilable (typecheck passes). Makes review + revert granular.

---

## 12. Approved additions (2026-04-22)

### A1. Env-tunable chunk sizes (implemented, not just documented)
Use `parseInt(process.env.PIPELINE_DRAIN_ENRICH_CHUNK ?? '500', 10)` pattern in each stage. Allows production tuning without redeploy if we see SBS 429s, NeverBounce throttling, or Instantly bounces.

### A2. Unit tests for hubzone delta mode guard (R3)
Add to §7.1 test matrix:
- Given `cert_queue_state.hubzone.mode='delta'` → `runHubzoneDelta` fires
- Given `cert_queue_state.hubzone.mode='weekly_sweep'` → `runHubzoneDelta` suppressed (returns `{task:'hubzone_delta', skipped:true, reason:'mode_not_delta'}`)
- Given `cert_queue_state.hubzone.mode='backfill'` → `runHubzoneDelta` suppressed (defensive; shouldn't happen in practice)

### A3. Code comments in `pickActiveCert` documenting pick priority
Canonical JSDoc block above the function:
```
/**
 * Pick the cert to work on this tick.
 *
 * Pick priority (highest to lowest):
 *   1. Active-step cert: stage != 'done' AND (last_tick_at IS NULL OR
 *      last_tick_at < now() - 240s). The 240s guard prevents overlapping
 *      ticks from double-processing the same cert (Vercel cron does NOT
 *      dedupe concurrent invocations — see E4/R4).
 *   2. Weekly-sweep due cert: stage = 'done' AND weekly_refresh_due_at < now().
 *      When matched, the row is REWOUND to stage='ingest', mode='weekly_sweep',
 *      cursors cleared, stage_started_at stamped, rows_this_stage=0.
 *   3. None → return null. Tick exits early after HUBZone delta.
 *
 * Only ONE cert advances per tick. Overlap between HUBZone delta (runs
 * independently in runHubzoneDelta) and this active-step picker is possible
 * when the active cert == 'hubzone' AND mode='weekly_sweep'. R3 guard in
 * runHubzoneDelta suppresses the delta task when hubzone.mode != 'delta'
 * to prevent cursor contention.
 */
```
This comment block is non-negotiable — it's the breadcrumb for whoever debugs pick-priority confusion in 6+ months.

### A4. Dry-run script coverage for R3 scenario
Extend §7.2 mock-SAM integration test to include:
- Test case: `cert_queue_state.hubzone.mode='weekly_sweep', stage='enrich'` (mid-sweep)
- Expected: `runHubzoneDelta` returns `{skipped:true, reason:'mode_not_delta'}`; active-step picks hubzone and drains enrich stage
- Assert: no duplicate ingest calls, no cursor contention, stage_started_at respected

