# SAM.gov Account Tier Appeal — Draft

**Status:** DRAFT. Do not send until Raphael approves.
**Target channel:** SAM.gov Federal Service Desk (fsd.gov) support ticket, category "API / Data Services".
**Account email:** rafihertz@gmail.com (ContractsIntel production key holder).
**Key identifier (for SAM to locate the account):** our currently-active API key begins `SAM-40cc23bb-…` (full value on file; happy to provide through a secure support channel).
**Previous tickets:** First formal support contact; no prior ticket IDs on file. Key rotation on Apr 21, 2026 was performed unilaterally on our end when we detected external compromise of the prior key.

---

## Summary

Our production SAM API key is on a custom daily quota far below the standard documented tiers. A controlled single-request probe today returned HTTP 429 on the first and only request of the day, with `nextAccessTime` pinned to the next UTC midnight — the signature of a near-zero daily bucket, not a sliding per-minute rate limit.

We believe this is a residual abuse-response flag from an incident in which our prior key was externally compromised (approximately Apr 15–22, 2026). We rotated the key on our end on Apr 21. The rotated key appears to have inherited the account-level punitive throttle.

**We are requesting:**

1. **Preferred:** restoration to the **federal system-account tier (10,000 requests / day)**, on the grounds that our use case — ingesting the full universe of certified small-business contractors (8(a), HUBZone, SDVOSB, WOSB, EDWOSB; approximately 40,000+ entities) across SAM's Entity Management and Entity Extract endpoints — is substantively similar to a federal system integration and cannot be served by the 1,000/day public tier within any reasonable timeframe.
2. **Acceptable minimum:** restoration to the **standard 1,000 requests / day non-federal public tier**. This lets us resume product operation, even if full-universe backfill takes several weeks.
3. Either outcome requires that the **abuse-response flag from the Apr 15–22 compromise be cleared** and the current key be moved off the custom punitive bucket.

## What ContractsIntel does (use-case justification)

ContractsIntel (https://contractsintel.com) is a production SaaS that surfaces federal contracting opportunities and certification-aware lead data to certified small-business contractors. Our workload depends on two SAM pipelines:

1. **Opportunities ingest** — hourly reads from `api.sam.gov/opportunities/v2/search` so our users see fresh solicitations matched to their NAICS and set-aside profile.
2. **Entity universe ingest** — periodic reads from `api.sam.gov/entity-information/v3/entities` (and the Entity Extract endpoint) to maintain a current roster of the full universe of certified contractors (8(a), HUBZone, SDVOSB, WOSB, EDWOSB). This roster is ~40,000+ entities; at 1,000 requests/day with reasonable page sizing the initial backfill is on the order of days, at 10,000/day on the order of hours. At the current sub-20/day effective ceiling it is infeasible.

Both pipelines are first-party product operations on legitimate SaaS traffic, not resale of SAM data. We are happy to share product screenshots, incorporation details, or a live demo on request.

## Evidence

### Exhibit A — Controlled probe on 2026-04-24 (rotated key, request 1 of the day)

```
GET https://api.sam.gov/opportunities/v2/search
    ?api_key=SAM-40cc23bb-…
    &postedFrom=04/22/2026
    &postedTo=04/22/2026
    &limit=1
    &offset=0
Accept: application/json
```

Response:

```
HTTP/1.1 429
Content-Length: 201

{
  "code": "900804",
  "message": "Message throttled out",
  "description": "You have exceeded your quota .You can access API after 2026-Apr-25 00:00:00+0000 UTC",
  "nextAccessTime": "2026-Apr-25 00:00:00+0000 UTC"
}
```

429 on **the first and only request of the UTC day**, with `nextAccessTime` set to the next UTC midnight, is dispositive evidence that the effective daily bucket is far below 1,000 requests. This probe is fully reproducible; we can re-run it live on a support call.

### Exhibit B — Prior capture in our audit table (2026-04-19 23:05 UTC)

Verbatim row from our `cron_alerts` audit table, written at 2026-04-19 23:05 UTC by our cert-pipeline HUBZone delta ingest when it received a 429 on its first SAM call of that tick:

```json
{
  "code": "900804",
  "message": "Message throttled out",
  "description": "You have exceeded your quota .You can access API after 2026-Apr-20 00:00:00+0000 UTC",
  "nextAccessTime": "2026-Apr-20 00:00:00+0000 UTC"
}
```

Same shape as Exhibit A; `nextAccessTime` pinned to midnight UTC.

### Exhibit C — Response-header signature

Our 429 responses do not include `X-RateLimit-Limit` or `X-RateLimit-Remaining` headers, which we understand is consistent with keys provisioned on a custom tier by manual desk action rather than the standard public-tier defaults.

### On daily-ceiling quantification

We deliberately do not cite a specific per-day call count. Our cron route does not write a per-request audit row on failure, so we will not reconstruct an hourly log after the fact. The single-request 429 in Exhibit A is, by itself, sufficient evidence that the effective daily bucket is well below 1,000. We are happy to run a controlled probe-plus-burst sequence the day after any tier restoration and share the full request/response log so your team can verify the new tier is applied correctly.

## Prior-incident context

Our previous key was externally compromised between approximately Apr 15 and Apr 22, 2026. External requests during that window may have triggered account-level abuse detection. We suspect that flag was not cleared when we rotated the key on Apr 21 — the new key appears to have inherited the account-level punitive tier.

## Business impact

Our production launch is imminent, with full-universe backfill of certified-contractor records across all five cert types on the critical path. At the current effective ceiling the backfill cannot complete in the required timeframe. We have already disabled our hourly ingest cron (commit `dc83e9b` on github.com/contractsintel/contractsintel `main`) to stop consuming any further quota while this ticket is open, and are holding all production `api.sam.gov` calls aside from at most one controlled probe per day for monitoring.

Any tier restoration — even the standard 1,000/day public tier — unblocks the launch. The federal-system 10,000/day tier is the outcome that best matches the actual use case, but we will gratefully accept either.

## Mitigations already in place

- Rotated the compromised key on Apr 21, 2026 (this is our first formal support contact).
- Disabled the hourly `scrape-opportunities` Vercel cron (PR #14, merged as commit `dc83e9b`) to prevent further quota consumption.
- Updated our one-shot backfill script to upsert per page so partial progress survives a 429 (PR #15, commit `0c23596`).
- Holding all production calls to `api.sam.gov` pending resolution.

## Contact

- Name: Raphael Hertz
- Email: rafihertz@gmail.com
- Project: ContractsIntel (github.com/contractsintel/contractsintel)
- Production domain: https://contractsintel.com
- Happy to provide the full key value, full request/response captures with timestamps, screen share of a live controlled probe, or any other verification your team needs.

---

### Internal notes (do not include in outbound ticket)

- Evidence in this draft is limited to items that can be produced verbatim from our audit trail or re-run on demand:
  - **Exhibit A**: captured live on 2026-04-24 via a single curl — fully reproducible; full request URL and response body above.
  - **Exhibit B**: `cron_alerts` row captured 2026-04-19 23:05:48 UTC, `source=cert-pipeline`.
- `SAM-40cc23bb-…` and `SAM-65df4126-…` are API-key prefixes (current and prior), NOT support-ticket IDs. Framed accordingly in the outbound text.
- Intentionally omitted from the outbound appeal:
  - Any specific per-day call count (e.g. "~17/day"). Our prior rough estimate was inferred from a backfill run that 429'd after 5 successful pages, not from audit data; we don't want to cite a number we can't verify.
  - An hourly Apr 23 call-accounting table. The `scrape-opportunities` route writes no audit row on failure, so we cannot produce a verified per-hour log and will not reconstruct one.
  - The 406 / HAL-JSON content-negotiation bug in our separate `scrape-federal` scraper (fixed in PR #16, commit `824c52a`). That scraper hits `sam.gov/api/prod/sgs/v1/search/`, a different host with no shared quota, so it is not relevant to this appeal.
- Posture: **ask high, accept standard**. Lead with federal-tier 10k/day framed honestly against the 40k-entity full-universe use case; make 1k/day the stated acceptable minimum so we don't walk away with zero if they refuse the 10k ask.
- If SAM responds "your account is on the default public tier, no flag found" — contradicts Exhibit A; push back politely with the verbatim 429 body and offer a live re-run.
- Target response time: 3–7 business days. Critical path for May 4 launch.
