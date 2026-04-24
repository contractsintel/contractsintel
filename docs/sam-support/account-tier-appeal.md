# SAM.gov Account Tier Appeal — Draft

**Status:** DRAFT. Do not send until Raphael reviews.
**Target channel:** SAM.gov Federal Service Desk (fsd.gov) support ticket, category "API / Data Services".
**Account email:** rafihertz@gmail.com (ContractsIntel production key holder).
**Previous tickets:**
- SAM-65df4126… (earlier burn / key-rotation request, Apr 2026)
- SAM-40cc23bb… (Apr 21 rotation confirmation)

---

## Summary of the problem

Our production SAM API key appears to have been placed on a **custom, punitive-tier quota of roughly 17 requests per day**. This is orders of magnitude below the standard documented tiers (non-federal public: 1,000/day; federal system account: 10,000/day) and makes the Opportunities API effectively unusable for our production ingest.

We believe this is a residual abuse-response flag from an earlier incident where our prior key was externally burned (reported in ticket SAM-65df4126…). The key was rotated on Apr 21, 2026 (confirmed in ticket SAM-40cc23bb…), and an in-house health probe on Apr 23 00:05 UTC returned a clean HTTP 200. However, within the first ~17 requests on Apr 23, the new key began returning WSO2 APIM throttle code `900804` ("Message throttled out") with `nextAccessTime` fixed at the next UTC midnight — the signature of a daily-bucket tier, not a per-minute rate limit.

We are requesting a **restoration to the standard 1,000/day (or higher federal-system) tier** so that our scheduled ingest can resume.

## Evidence

**1. Call accounting for Apr 23, 2026 UTC (new key, post-rotation):**

| # | Time (UTC)  | Call                                                 | Result        |
|---|-------------|------------------------------------------------------|---------------|
| 1 | 00:05       | Entity health probe (`/entity-information/v3/entities?size=1`) | HTTP 200      |
| 2–11 | hourly 01:00–10:00 | `opportunities/v2/search` cron (1 call each tick) | HTTP 200      |
| 12–17 | ~14:00  | Backfill script, pages 0–5                           | HTTP 200      |
| 18 | ~14:00     | Backfill script, page 6                              | **HTTP 429 `900804`** |

Total successful requests before throttle: **17**. No burst; calls spaced across 14 hours.

**2. Throttle response body (representative):**

```json
{
  "fault": {
    "code": 900804,
    "message": "Message throttled out",
    "description": "You have exceeded your quota. Please wait until the next access window.",
    "nextAccessTime": "2026-04-24T00:00:00Z"
  }
}
```

`nextAccessTime` pinned to midnight UTC is consistent with a daily-bucket tier — not a sliding per-minute rate limit.

**3. Absence of rate-limit headers:**
Responses do not include `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers. This matches SAM's documented behavior for keys on custom tiers provisioned by manual desk action, rather than the standard public-tier defaults.

**4. Prior incident context (ticket SAM-65df4126…):**
Our previous key was compromised externally between approximately Apr 15 and Apr 22. During that window, the attacker's requests would have counted against our account. We suspect the abuse flag triggered by that burst was not cleared when the key was rotated on Apr 21 — the new key inherited the account-level punitive tier.

## What we're asking for

1. **Confirm** whether our account / key (`contractsintel prod`, associated email `rafihertz@gmail.com`) is currently on a custom / punitive tier.
2. **Clear** the abuse-response flag associated with the prior-key burn incident (ticket SAM-65df4126…).
3. **Restore** the key to the standard **1,000 requests / day** non-federal tier, or — given our use case is a legitimate federal-opportunity ingest for a production SaaS (ContractsIntel) that serves HUBZone / 8(a) / SDVOSB / WOSB contractors — upgrade to the **federal system-account tier (10,000/day)** if we qualify.

## Business impact

ContractsIntel is a production SaaS that surfaces federal contracting opportunities to certified small-business contractors (HUBZone, 8(a), SDVOSB, WOSB). Our May 4, 2026 HUBZone cold-outbound launch depends on daily SAM Opportunities ingest. At a 17-req/day ceiling we cannot maintain a usable opportunity feed. We have already disabled our hourly ingest cron (commit [TODO: paste hash]) to stop burning quota while this ticket is open.

## Mitigations we've already put in place

- Rotated the compromised key on Apr 21, 2026 (ticket SAM-40cc23bb…).
- Disabled the hourly `scrape-opportunities` Vercel cron (PR #14 on github.com/contractsintel/contractsintel) to prevent further quota burn.
- Updated our one-shot backfill script to upsert per-page incrementally so that any partial progress survives a 429 (commit on branch `fix/backfill-incremental-upsert`).
- Scheduled a daily probe at 00:05 UTC to confirm key health without consuming meaningful quota.

## Contact

- Name: Raphael Hertz
- Email: rafihertz@gmail.com
- Project: ContractsIntel (github.com/contractsintel/contractsintel)
- Production domain: [TODO: production URL]

Happy to provide additional log excerpts, request IDs, or Supabase audit trails on request.

---

### Internal notes (do not include in outbound ticket)

- TODOs before sending:
  - Fill production URL.
  - Paste PR #14 merge commit hash once merged.
  - Paste exact prior-ticket IDs (`SAM-65df4126…` / `SAM-40cc23bb…` are truncated placeholders).
  - Capture one real 429 response body verbatim (the block above is representative, not verbatim) — pull from Vercel function logs.
- If they respond with "your account is on the public default tier, no flag found" — that contradicts the call-accounting evidence; push back politely with the call log.
- Best case: tier restored within 2–5 business days. Plan alternative data sources (USASpending, grants.gov) for opportunity surface if appeal stalls past May 1.
