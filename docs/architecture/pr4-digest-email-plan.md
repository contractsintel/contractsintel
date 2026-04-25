# PR 4 — Daily Digest Email — Implementation Plan

**Status:** Draft. Awaiting Raphael's review.
**Branch (when approved):** `pr4-digest-email`
**Depends on:** `health_checks` (PR #31), `cron_alerts` (2026-04-18), `scraper_runs` (preexisting), `cert_queue_state` (PR #11), `leads` (PR #22+).
**Author context:** Drafted 2026-04-26 after PR #32 merge.

---

## 0. Critical findings before planning

Three repo realities materially change the plan vs. the prompt:

1. **`/api/cron/send-digests` already exists** (`app/api/cron/send-digests/route.ts`, 184 LOC) — it is the **customer-facing** digest that emails opportunity matches to each org's users at `0 12 * * *`. It is not the ops digest. **The new ops digest must NOT reuse this path.** Recommend new path **`/api/cron/ops-digest`** (alternative considered: `/api/cron/morning-digest`; chose `ops-digest` because it disambiguates by audience, not time-of-day).
2. **`RESEND_FROM_EMAIL` is not in `lib/env.ts` or any `.env`** — only `RESEND_API_KEY` is registered (`lib/env.ts:36`). Existing routes hardcode `from:` strings: `system@contractsintel.com` (owner-report:125), `digest@contractsintel.com` (send-digests:140). Plan will hardcode `ContractsIntel Ops <ops@contractsintel.com>` matching the existing pattern, and add `RESEND_FROM_EMAIL` as an *optional* override in `lib/env.ts` (default = the hardcoded string). Sender genuinely does not exist in env, so we follow precedent.
3. **`cert_queue_state` does NOT have `last_run_at`** — it has `last_tick_at` (migration 20260418160000:34). It does have `stage_started_at` (migration 20260422120000:37). Plan uses `last_tick_at`.

`docs/architecture/pipeline-v2.md` does not exist. Plan style modeled on `pr1b-implementation-plan.md`.

## 1. Schema changes

### 1.1 New table — `digest_runs` (recommended: yes)

Reasons: (a) idempotency guard so a manual rerun and a cron rerun on the same UTC day don't double-send; (b) audit trail for "did the digest fire today?" (PR 6 heartbeat will read this); (c) traceability — every email body footer carries `run_id`, this table closes the loop.

New migration: `supabase/migrations/20260427000000_digest_runs.sql`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.digest_runs (
  id              bigserial PRIMARY KEY,
  run_id          text NOT NULL UNIQUE,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  recipient       text NOT NULL,
  subject         text NOT NULL,
  rollup_status   text NOT NULL CHECK (rollup_status IN ('green','yellow','red','error','stale')),
  health_run_id   text,
  body_excerpt    text,
  resend_id       text,
  dry             boolean NOT NULL DEFAULT false,
  test_recipient  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS digest_runs_recent_idx
  ON public.digest_runs (sent_at DESC);

CREATE INDEX IF NOT EXISTS digest_runs_status_idx
  ON public.digest_runs (rollup_status, sent_at DESC);

COMMENT ON TABLE public.digest_runs IS
  'One row per /api/cron/ops-digest send attempt. Read by PR 6 heartbeat. Retention: 90d, enforced inline by the route (mirrors health_checks).';

COMMIT;
```

### 1.2 Idempotency

Inside the route, before sending: check `SELECT 1 FROM digest_runs WHERE date_trunc('day', sent_at AT TIME ZONE 'UTC') = current_date AND dry = false AND test_recipient = false`. If a row exists, return `{skipped: true, reason: "already_sent_today"}` unless `?force=1` is set.

## 2. Schedule decision

`vercel.json` already uses day-of-week alternation (`0 13 * * 1` for `owner-report`). Day-of-week IS honored on Vercel. **Pick option (a):**

```json
{ "path": "/api/cron/ops-digest", "schedule": "7 12 * * 1-5" }
```

This is **08:07 EDT / 07:07 EST Mon-Fri**. DST posture matches PR #31 — fixed UTC, no in-route compensation.

## 3. File-by-file change plan

| File | Action | Approx LOC | Purpose |
|------|--------|-----------:|---------|
| `supabase/migrations/20260427000000_digest_runs.sql` | new | 30 | §1 schema |
| `app/api/cron/ops-digest/route.ts` | new | ~210 | Cron handler, auth, dry/test/force, idempotency, retention, retry, alert escalation |
| `lib/digest/render.ts` | new | ~280 | Pure `(data) → {html, text, subject}` renderer; no DB/IO |
| `lib/digest/fetch.ts` | new | ~220 | Pure-data layer: 7 query helpers (one per section); each returns typed shape consumed by render |
| `lib/digest/sparkline.ts` | new | ~40 | `statusToSparkChar(status)` and `renderSparkline(rows)` |
| `lib/digest/types.ts` | new | ~60 | `DigestData`, `SectionData`, `HealthRollup`, `RenderResult` |
| `lib/env.ts` | edit | +1 | Optional `RESEND_FROM_EMAIL` |
| `vercel.json` | edit | +1 | New cron line |
| `__tests__/digest/render.test.ts` | new | ~180 | Unit tests for renderer |
| `__tests__/digest/sparkline.test.ts` | new | ~40 | sparkline char mapping |
| `__tests__/digest/fetch.test.ts` | new | ~120 | Mocked supabase, query shape assertions |
| `__tests__/digest/route.test.ts` | new | ~140 | Integration: dry, test-recipient, idempotency, auth |
| `docs/architecture/pr4-digest-email-plan.md` | new | this doc | — |

Total: **~1,320 LOC** (~720 production + ~480 tests).

### Module boundaries

- `fetch.ts` exports `fetchDigestData(supabase, opts) → Promise<DigestData>`. Composes 7 queries; each is its own exported helper for testability.
- `render.ts` exports `renderDigest(data: DigestData) → {html, text, subject}`. No async, no IO. Pure.
- `route.ts` is thin: auth → fetch → render → send → persist → return.

## 4. Email template structure

### 4.1 Subject

```
[ContractsIntel] Daily Digest — 2026-04-27 — green
```

Date is `YYYY-MM-DD` for the **digest fire date** (today UTC). Color word = the rollup banner color.

### 4.2 HTML

Inline-CSS only. Gmail strips `<style>` and `<head>`. Mobile-readable: single 640px column, no media queries. No external images — sparkline is text. Color via `style="background:#xxx"` on banner div.

Section markup (sketch):

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a;">
  <!-- Banner -->
  <div style="background:#16a34a;color:white;padding:16px 20px;border-radius:8px;font-weight:600;font-size:18px;">
    System Health: GREEN — 2026-04-27
    <div style="font-size:12px;font-weight:400;opacity:0.9;margin-top:4px;">7/7 checks green · run_id abc-123</div>
  </div>

  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin:24px 0 8px;">Action items</h2>
  <ul>...</ul>

  <h2 style="...">Yesterday's scraping</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="background:#f1f5f9;"><th>Source</th><th>Runs</th><th>OK</th><th>Fail</th><th>Opps</th><th>Matches</th></tr></thead>
    <tbody>...</tbody>
  </table>

  <pre style="font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.6;background:#f8fafc;padding:12px 16px;border-radius:6px;">
cron_coverage         ▁▁▁▁▁▁▁
p_route_timeouts      ▁▁▄▁▁▁▁
sam_sbs_failures      ▁▁▁▁▁▁▁
supabase_health       ▁▁▁▁▁▁▁
unacked_cron_alerts   ▁▁▁▁▄▁▁
neverbounce_credits   ▄▄▁▁▁▁▁
pipeline_stalls       ▁▁▁█▁▁▁
  </pre>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
    <a href="...">Vercel</a> · <a href="...">Supabase</a> · <a href="...">Instantly</a> · <a href="...">/api/audit</a>
    <br>run_id: abc-123-def
  </div>
</div>
```

Colors: green `#16a34a`, yellow `#d97706`, red `#dc2626`, stale `#64748b`.

### 4.3 Text

Plain-text counterpart, same section order, ASCII-only. Sparklines render the same. Resend's `text` field used so non-HTML clients still parse.

## 5. Data-fetching plan (per section)

All queries via `pipelineSupabase()` (`lib/pipeline/supabase.ts`). 24h window = `[startOfYesterdayUTC, startOfTodayUTC)` for "yesterday" sections.

### §1 Health header
```ts
// today's run if available, else yesterday's, else null → "stale" rollup
const today = await s.from('health_checks')
  .select('run_id, check_name, status, metric, threshold, details, created_at')
  .gte('created_at', startOfTodayUTC).order('created_at', { ascending: false });
// pick latest run_id; if zero rows → fallback gte yesterday
// rollup = same logic as lib/health/runner.ts rollup() — import and reuse
```
Mark `stale: true` if fallback used; banner shows "(stale data)".

### §2 Critical items
```ts
const alerts = await s.from('cron_alerts')
  .select('id, severity, source, message, created_at, run_id')
  .in('severity', ['error','critical'])
  .is('acked_at', null)
  .gte('created_at', sevenDaysAgoUTC)
  .order('created_at', { ascending: false }).limit(50);

const reds = healthChecks.filter(c => c.status === 'red' || c.status === 'error');
```

### §3 Scraping summary
```ts
const runs = await s.from('scraper_runs')
  .select('source, status, opportunities_found, matches_created, started_at')
  .gte('started_at', startOfYesterdayUTC).lt('started_at', startOfTodayUTC);
// Aggregate in JS by source; sort failures-desc, total-desc.
```

### §4 Pipeline progress
```ts
const certs = await s.from('cert_queue_state')
  .select('cert, stage, stage_started_at, last_tick_at, mode, rows_this_stage, last_error');

const verifiedYesterday = await s.from('leads')
  .select('primary_cert', { count: 'exact', head: true })
  .eq('email_verification_status', 'valid')
  .gte('updated_at', startOfYesterdayUTC).lt('updated_at', startOfTodayUTC);

const cumulative = await s.from('leads')
  .select('primary_cert', { count: 'exact', head: true })
  .eq('email_verification_status', 'valid');

const universe = await s.from('leads')
  .select('primary_cert', { count: 'exact', head: true });
```
Empty-universe edge case: if `universe[cert] === 0`, render `"No leads yet"` instead of dividing by zero.

### §5 Resources
```ts
import { nbCredits } from '@/lib/pipeline/verify-submit';
const nb = await nbCredits();

const sb = await s.from('health_checks')
  .select('status, metric, created_at, details')
  .eq('check_name', 'supabase_health')
  .order('created_at', { ascending: false }).limit(1).single();

const samProxy = await s.from('health_checks')
  .select('status, metric, details, created_at')
  .eq('check_name', 'sam_sbs_failures')
  .order('created_at', { ascending: false }).limit(1).single();
```

### §6 Sparkline (7-day, 7 checks)
```ts
const last7 = await s.from('health_checks')
  .select('check_name, status, created_at')
  .gte('created_at', sevenDaysAgoUTC)
  .order('created_at', { ascending: true });
// Group by (check_name, day_bucket_UTC). For each (check, day) pair, pick
// latest status. Map: green→▁ yellow→▄ red→█ error→? missing→' '.
```

### §7 Footer links
Constants in `lib/digest/render.ts`:
- Vercel: `https://vercel.com/<org>/<project>` — derive from `VERCEL_URL`, fallback literal
- Supabase: `https://supabase.com/dashboard/project/<ref>` — derive ref from `NEXT_PUBLIC_SUPABASE_URL`
- Instantly: `https://app.instantly.ai/app/campaigns`
- Audit: `${siteUrl}/api/audit`
- Healthchecks.io: only if `HEALTHCHECKS_PING_URL` set; show its dashboard URL by stripping `/ping/...`

## 6. Resend integration

- SDK: `resend@^6.10.0` already in `package.json:dependencies`. **No install needed.**
- Env: `RESEND_API_KEY` already required (`lib/env.ts:36`). Add `RESEND_FROM_EMAIL` as optional with default `"ContractsIntel Ops <ops@contractsintel.com>"`.
- Send call mirrors `app/api/cron/owner-report/route.ts:124-129`.
- **Retry policy**: try once. On thrown error or `error` field in result, sleep 2s, try again. On second failure: `alert(supabase, runId, 'error', 'digest-email', 'Resend send failed twice', { error })`. Persist a `digest_runs` row with `resend_id=null, rollup_status='error'`. Return `200` (not 500) so Vercel doesn't double-fire.
- Capture `result.data.id` into `digest_runs.resend_id`.

## 7. Edge cases

| Case | Handling |
|------|----------|
| Mid-render error | `try { … } catch (e) { console.error; alert(); persist digest_runs with rollup_status='error'; return 200 }`. PR 6 heartbeat will catch missing-fire. |
| Empty `health_checks` today | Fallback to yesterday's most-recent; mark banner "(stale data)" via `rollup_status='stale'`. |
| Resend send fails | 1 retry with 2s delay; on 2nd fail → cron_alerts row + persist failure to digest_runs; return 200. |
| Holidays | Out of scope. Documented. Operator may manually `?dry=1` on a holiday or just delete the email. |
| Empty universe (no leads for a cert) | Render "No verified leads yet"; never divide by zero. |
| `cron_alerts` flood (>50 critical) | Cap at 20 with `…and N more`. |
| Section data missing entirely | Per-section `try/catch` in `fetch.ts`; renderer shows `"(unavailable: <error>)"` for that section only. |

## 8. Test send / dry mode

Route accepts:
- `?dry=1` — fetch + render, returns `{html, text, subject, data}` JSON, **does not send**, **does not persist**. Bypasses idempotency.
- `?to=<email>&test_token=<token>` — only honored if `dry` NOT set AND `process.env.DIGEST_TEST_TOKEN === req.query.test_token`. Sends to override `to`. Persists with `test_recipient=true`.
- `?force=1` — bypasses idempotency.

Auth: `Authorization: Bearer ${CRON_SECRET}` for ALL modes (matches `app/api/cron/health-check/route.ts:67-69`).

## 9. Testing strategy

- **Unit (`render.test.ts`)** — feed `DigestData` fixtures (green/yellow/red/stale, empty-actions, empty-universe, all-sections-populated). Assert: subject string, section headers present, color codes match status, sparkline mapping.
- **Unit (`sparkline.test.ts`)** — 7-day window with day gaps, all-green, all-red, mixed; verify char mapping table.
- **Unit (`fetch.test.ts`)** — mock supabase, assert exact `.from().select().gte()` calls per query.
- **Integration (`route.test.ts`)** — dry returns 200 + JSON; `?dry=1&to=x@y.z` ignores `to`; `?to=...` without token returns 400; idempotency: second call same day returns `{skipped: true}`; auth: missing bearer returns 401.

Manual rehearsal: deploy → `?dry=1` → eyeball JSON → `?to=raphael@example.com&test_token=...&force=1` → check inbox.

## 10. LOC / time

- Production: ~720 LOC
- Tests: ~480 LOC
- Migration + plan: ~120 LOC
- **Total: ~1,320 LOC**
- **Time: ~6-8 focused hours** (1h schema + cron wiring, 2h fetch.ts + queries, 2h render.ts including HTML/text twin, 1h sparkline + edge cases, 2h tests)

## 11. OPEN QUESTIONS

1. **Is `ops@contractsintel.com` a verified Resend sender?** If not, fall back to `system@contractsintel.com` (already used by owner-report). Need confirmation before deploy or sends bounce.
2. **Idempotency window — UTC day or ET day?** Cron fires 12:07 UTC = 08:07 ET. UTC day boundary (00:00 UTC = 20:00 ET prev day) means a manual `?force=1` resend at 23:00 ET wouldn't collide with next morning's cron. UTC day is simpler; recommend UTC unless objection.
3. **PR 6 heartbeat coupling — is `digest_runs` the right place to read from?** Or should we additionally write a row to `health_checks` with `check_name='digest_email'` (would require expanding the CHECK constraint)? Recommend `digest_runs` only; PR 6 plan can decide.
