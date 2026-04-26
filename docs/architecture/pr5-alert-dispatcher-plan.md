# PR 5 — Critical Alert Dispatcher — Implementation Plan

**Status:** Draft. Awaiting Raphael's review.
**Branch (when approved):** `pr5-alert-dispatcher`
**Depends on:** `cron_alerts` (migration `20260418160000_cert_queue_and_alerts.sql`), Resend SDK (already in deps), `lib/pipeline/alerts.ts`, ops-digest sender pattern (PR #33).
**Author context:** Drafted 2026-04-26. Main HEAD `6eda4daa` (post-PR-#33).

---

## 0. Critical findings before planning

Three repo realities materially shape this plan:

1. **Vercel cron cadence.** Sub-hourly cron (every 5–10 min) requires Vercel Pro. The repo already uses minute-precision schedules (`2 * * * *`, `30 * * * *`, etc.) on hourly granularity — confirming Pro is in use. A `*/5 * * * *` schedule is therefore feasible. Plan picks **`*/5 * * * *`** (every 5 min). Justification in §3.
2. **`cron_alerts` actual column is `acked_at`/`acked_by`** (migration `20260418160000_cert_queue_and_alerts.sql:90-91`), not `acknowledged_at` as the spec hinted. Plan uses `acked_at`. Existing partial index `cron_alerts_unacked_idx` on `(created_at DESC) WHERE acked_at IS NULL` is the read path.
3. **`RESEND_FROM_EMAIL` is now wired** (`lib/env.ts:37`, default `ContractsIntel Ops <system@contractsintel.com>`). PR 4 pattern: `sendOnce()` helper with one retry + meta-alert on second failure (`app/api/cron/ops-digest/route.ts:47-75, 175-198`). **Reuse this idiom verbatim** — do not invent a new sender abstraction.

`vercel.json` cron count: **65 entries**. One new entry inserted near `health-check` and `ops-digest`.

---

## 1. Schema changes

### 1.1 Decision: new `alert_dispatches` table (NOT a column on `cron_alerts`)

**Picked:** separate table.

Trade-off:
- **Column on `cron_alerts.dispatched_at`** — simpler. But forces 1 alert = 1 dispatch. Storms (10 alerts in 5 min → 1 batched email) lose the link from email back to row, and a retry/failed-send has nowhere to live.
- **`alert_dispatches` table** — supports (a) batched emails (one dispatch row referencing N alert IDs), (b) retry rows, (c) audit trail per Resend message ID, (d) trivial idempotency via "max(created_at) where success" cursor.

The cost of the second table is small and matches the `digest_runs` precedent established in PR 4.

### 1.2 New migration

**File:** `supabase/migrations/20260428000000_alert_dispatches.sql` (~45 LOC)

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.alert_dispatches (
  id            bigserial PRIMARY KEY,
  run_id        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  alert_ids     bigint[] NOT NULL,
  alert_count   smallint NOT NULL,
  mode          text NOT NULL CHECK (mode IN ('single','batched','storm-summary')),
  recipient     text NOT NULL,
  subject       text NOT NULL,
  resend_id     text,
  status        text NOT NULL CHECK (status IN ('sent','failed','dry')),
  error_message text,
  attempt       smallint NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS alert_dispatches_recent_idx
  ON public.alert_dispatches (created_at DESC);

CREATE INDEX IF NOT EXISTS alert_dispatches_status_idx
  ON public.alert_dispatches (status, created_at DESC);

CREATE INDEX IF NOT EXISTS alert_dispatches_alert_ids_idx
  ON public.alert_dispatches USING gin (alert_ids);

COMMENT ON TABLE public.alert_dispatches IS
  'One row per alert-dispatcher send attempt. Cursor for next-tick query: max(created_at) where status=''sent''. 90d retention enforced inline.';

COMMIT;
```

### 1.3 Cursor query (no separate state table)

```sql
SELECT id, created_at, severity, source, message, context, run_id, acked_at
FROM cron_alerts
WHERE severity IN ('error','critical')
  AND source <> 'alert-dispatcher'              -- ANTI-LOOP
  AND acked_at IS NULL
  AND created_at > (
    SELECT COALESCE(MAX(created_at), 'epoch'::timestamptz)
    FROM alert_dispatches
    WHERE status = 'sent'
  )
ORDER BY created_at ASC
LIMIT 50;                                       -- storm cap
```

Piggybacks on existing `cron_alerts_unacked_idx`.

---

## 2. Schedule decision

**Picked:** `*/5 * * * *` — every 5 minutes, 24/7.

10 min doubles worst-case latency (operator sees critical at 14:09:50 instead of 14:04:50). Cost of 10→5 is 144 extra ticks/day — free on Pro; the dispatcher does at most one cheap SELECT per tick when nothing's new.

`vercel.json` insertion:

```json
{ "path": "/api/cron/alert-dispatcher", "schedule": "*/5 * * * *" }
```

DST: same as PR 3/4 — UTC, no compensation.

---

## 3. File-by-file change plan

| File | Action | Approx LOC | Purpose |
|------|--------|-----------:|---------|
| `supabase/migrations/20260428000000_alert_dispatches.sql` | new | 45 | §1 schema |
| `app/api/cron/alert-dispatcher/route.ts` | new | ~180 | Cron handler: auth, dry-mode, fetch unacked, batch, send, persist, retention |
| `app/api/alerts/ack/route.ts` | new | ~90 | One-click HMAC ack endpoint |
| `lib/alerts/dispatch.ts` | new | ~160 | Core: fetchPending, groupForSend, dispatch |
| `lib/alerts/render.ts` | new | ~220 | renderSingle, renderBatched, renderStormSummary |
| `lib/alerts/sign.ts` | new | ~60 | HMAC sign/verify, 7d expiry |
| `lib/env.ts` | edit | +1 | Register `ALERT_ACK_SECRET` as optional |
| `vercel.json` | edit | +1 | New cron entry |
| `__tests__/alerts/sign.test.ts` | new | ~40 | HMAC roundtrip + tampered + expiry |
| `__tests__/alerts/render.test.ts` | new | ~80 | Single, batched, storm, HTML escape |
| `__tests__/alerts/dispatch.test.ts` | new | ~140 | Mocked supabase + resend; empty/single/batched/storm/anti-loop/already-acked/send-fail |
| `__tests__/alerts/ack-route.test.ts` | new | ~60 | Valid/bad-sig/expired/non-existent/idempotent |

**Total:** ~1,075 LOC across 7 new code files + 5 test files + 1 migration + 2 small edits.

---

## 4. Email design

### 4.1 Single-alert email
- **Subject** (≤78 chars): `[ContractsIntel ALERT] {severity} · {source} · {message_first_60_chars}`
- HTML 640px max width, inline CSS only (Gmail-safe per `lib/digest/render.ts:5-7`).
- Severity badge (red `#dc2626`), `Source:` `Run:` `Fired:` line, `Message:` block (escaped, monospace), `Context preview:` first 6 keys + `<details>` for full JSON.
- Ack button: `<a href="{ackUrl}">Acknowledge</a>` styled as button. Plaintext URL below.
- Footer: dispatcher run_id, "morning ops-digest will also surface this" reminder.

### 4.2 Batched email (2 ≤ N ≤ 10)
- **Subject:** `[ContractsIntel ALERT] {N} critical/error events in last 5 min`
- Compact table: # · Severity · Source · Message(60ch) · Ack
- Ack-all link at top: `?ids=41,42,43&ts=…&sig=…` with sig over sorted CSV ids + ts.

### 4.3 Storm summary (N > 10)
- **Subject:** `[ContractsIntel ALERT] STORM — {N} events in last 5 min (showing top 10)`
- Top-10 table + `…and {N-10} more — see /admin/alerts dashboard or query cron_alerts.`
- Single ack-all link covers all N.

### 4.4 Sender / recipient (decided)
- `from`: `process.env.RESEND_FROM_EMAIL || "ContractsIntel Ops <system@contractsintel.com>"`
- `to`: `"willitfreez@gmail.com"` (constant)

---

## 5. Ack endpoint

**Path:** `app/api/alerts/ack/route.ts`. **Method:** GET.

URL shapes:
- Single: `/api/alerts/ack?id=41&ts=1745510400&sig=<hex>`
- Batch: `/api/alerts/ack?ids=41,42,43&ts=1745510400&sig=<hex>`

Signing (`lib/alerts/sign.ts`):
```
payload = `${idsSorted.join(",")}.${ts}`
sig = hmacSha256(ALERT_ACK_SECRET, payload).toString("hex")
```

Verify steps:
1. Parse → 400 on missing/malformed
2. `if (now - ts > 7*86400)` → 410 expired
3. Constant-time sig compare → 400 invalid
4. `UPDATE cron_alerts SET acked_at = now(), acked_by = 'email-ack-link' WHERE id = ANY($1) AND acked_at IS NULL`
5. Tiny inline-styled HTML page: `Alert(s) #41,#42 acknowledged ✓ at 14:08:21 UTC.`

Idempotency: `WHERE acked_at IS NULL` makes second click a no-op; success page still returns.

No CSRF concern: HMAC is the auth.

---

## 6. Rate-limit / batching policy

**Picked: (a) Simple per-tick batching.**

5-min cron cadence IS the window. Per tick:
- 0 alerts → no-op, no row written
- 1 alert → single email (mode='single')
- 2–10 alerts → batched (mode='batched')
- &gt;10 alerts → storm-summary (mode='storm-summary'), capped at LIMIT 50

Rejected:
- (b) Rolling window — adds state for marginal gain at 5-min cadence
- (c) Severity-segmented — overkill at current volume

---

## 7. Edge cases

| Case | Behavior |
|---|---|
| Resend send fails (call #1) | `await sleep(2000)`; retry once. Mirrors `app/api/cron/ops-digest/route.ts:175-180`. |
| Resend fails (call #2) | Insert `alert_dispatches` row with `status='failed'`, `error_message`, `attempt=2`. Then `alert(supabase, runId, 'error', 'alert-dispatcher', 'Resend send failed twice', {...})`. Anti-loop guard prevents pickup. Always return 200. |
| Dispatcher generates alert | Filter `source <> 'alert-dispatcher'`. `DISPATCHER_SOURCE = 'alert-dispatcher'` constant used for both meta-alert source AND filter. **Non-negotiable.** |
| 100 alerts in 5 min (storm) | LIMIT 50; `mode='storm-summary'` shows top 10 + count of rest; one dispatch row references all 50 via `alert_ids`. Remaining 50+ picked up next tick. |
| `acked_at` already set | SELECT filters `acked_at IS NULL`. Pre-acked rows invisible — no email, no dispatch row. |
| HMAC secret rotation | All in-flight links break. Documented, accepted. Operator workaround: `UPDATE cron_alerts SET acked_at = now() WHERE id IN (…);` Mentioned in success page footer. |
| Brand-new install / empty `cron_alerts` | SELECT returns 0 → return `{run_id, dispatched: 0}`. No dispatch row. |
| `?dry=1` | Render the email, return JSON with `would_dispatch: N`, `mode`, `subject`, `html`, `text`, `alert_ids`. No DB writes, no Resend calls. |
| Auth missing/wrong | 401, same as health-check. |
| DST | UTC cron, no compensation. |
| `RESEND_API_KEY` unset | Resend client throws → caught → counted as failed send → meta-alert path. |
| `ALERT_ACK_SECRET` unset | Route refuses to render emails (would produce unverifiable links). Fail-closed: 500 + no rows written. Documented. |

---

## 8. PIPELINE_LIVE gating

Same as PR 3/4: **not gated.** Observability runs regardless.

---

## 9. Testing strategy

### 9.1 Unit
- `sign.test.ts` — sign+verify roundtrip; flip 1 char of sig → reject; ts >7d old → reject; missing secret → throw.
- `render.test.ts` — single (with full context), batched (3), storm (15), HTML escape on `<script>`/`&`/`"`, null context, very long message truncation in subject.
- `dispatch.test.ts` — mocked Supabase + Resend: empty/1/5/60 pending, anti-loop filter, send fails twice → meta-alert, storm cap.

### 9.2 Integration
- `?dry=1` returns JSON with rendered subject/html/text and `would_dispatch: N`. No writes.

### 9.3 Manual rehearsal (in PR description)
1. Deploy.
2. `?dry=1` with bearer → `{would_dispatch: 0}`.
3. `INSERT INTO cron_alerts (severity, source, message, context, run_id) VALUES ('critical', 'manual-test', 'PR 5 rehearsal', '{"k":"v"}', 'rehearsal-1');`
4. `?dry=1` again → `{would_dispatch: 1, mode: 'single', subject: '[ContractsIntel ALERT] critical · manual-test · PR 5 rehearsal'}`.
5. Wait ≤5 min for cron tick. Email lands. Click ack. Confirm `acked_at` set.
6. `DELETE FROM cron_alerts WHERE source = 'manual-test';`

---

## 10. Estimated LOC and time

- LOC: ~1,075
- Time: **1.5–2 working days**.

---

## 11. OPEN QUESTIONS (max 3)

1. **Subject prefix:** `[ContractsIntel ALERT]` vs `[CI-ALERT]` for tighter mobile lock-screen rendering?
2. **`warn` severity inclusion:** spec says critical+error only. Confirm we should NOT dispatch `warn` (lower bar = noisier inbox; ops-digest surfaces warns the next morning anyway).
3. **SMS via Twilio for `critical` only — defer or fold in?** Recommend defer (own PR) to keep PR 5 scoped.
