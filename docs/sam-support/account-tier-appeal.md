# SAM.gov Account Tier Appeal — Draft

**Status:** DRAFT. Do not send until Raphael reviews.
**Target channel:** SAM.gov Federal Service Desk (fsd.gov) support ticket, category "API / Data Services".
**Account email:** rafihertz@gmail.com (ContractsIntel production key holder).
**Previous tickets:** First support contact — no prior ticket IDs on file.

---

## Summary of the problem

Our production SAM API key appears to be on a **custom daily quota substantially below the standard public tier**. We are routinely hitting HTTP 429 with WSO2 APIM code `900804` ("Message throttled out") with `nextAccessTime` pinned to the next UTC midnight — the signature of a daily-bucket tier, not a sliding per-minute rate limit.

The standard documented tiers are 1,000 requests/day (non-federal public) and 10,000 requests/day (federal system account). Our observed behavior is far below either. We are requesting restoration to a standard tier so our production ingest can resume.

We believe this is a residual abuse-response flag from an incident in which our prior key was externally burned between approximately Apr 15 and Apr 22, 2026. We rotated the key on our end on Apr 21, 2026; this is our first formal support contact. The rotated key appears to have inherited the account-level punitive throttle.

## Evidence

### Exhibit A — Controlled probe on 2026-04-24 (rotated key)

A single controlled request with minimal parameters, sent today:

```
GET https://api.sam.gov/opportunities/v2/search
    ?api_key=<redacted>
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

**This was request number 1 of the day from our rotated key.** The 429 on the first request of a fresh UTC day — together with `nextAccessTime` set to the following UTC midnight — indicates a daily bucket that has effectively zero headroom under normal use, far below the 1,000/day non-federal tier.

### Exhibit B — Earlier capture in our audit table (2026-04-19)

Verbatim row from our `cron_alerts` audit table, written at 2026-04-19 23:05 UTC by our cert-pipeline HUBZone delta ingest when it received a 429 on its first SAM call of that tick:

```json
{
  "code": "900804",
  "message": "Message throttled out",
  "description": "You have exceeded your quota .You can access API after 2026-Apr-20 00:00:00+0000 UTC",
  "nextAccessTime": "2026-Apr-20 00:00:00+0000 UTC"
}
```

Same shape as Exhibit A. `nextAccessTime` pinned to midnight UTC in both cases.

### Exhibit C — Response-header signature

Our throttle responses do not include `X-RateLimit-Limit` or `X-RateLimit-Remaining` headers, which we understand is consistent with keys provisioned on a custom tier by manual desk action rather than the standard public-tier defaults.

### On daily-ceiling quantification

We are deliberately not citing a specific per-day call count. Our cron route that hits `api.sam.gov` does not write a per-request audit row on failure (the route returns a summary response and logs to stdout), so we cannot produce a verified hourly call log from yesterday without reconstructing from inference — which we want to avoid in a support appeal. The controlled single-call probe in Exhibit A is, by itself, sufficient evidence that the effective daily bucket is well below 1,000.

We are happy to run a controlled probe-plus-burst sequence the day after any tier restoration and share the full request/response log, so your team can verify the new tier is applied correctly.

## What we're asking for

1. **Confirm** whether our account / key (associated email `rafihertz@gmail.com`) is currently on a custom / punitive tier.
2. **Clear** the abuse-response flag associated with the prior-key burn incident (Apr 15–22, 2026).
3. **Restore** the key to the standard **1,000 requests / day** non-federal tier, or — given our use case is a legitimate federal-opportunity ingest for a production SaaS (ContractsIntel, https://contractsintel.com) serving HUBZone / 8(a) / SDVOSB / WOSB contractors — upgrade to the **federal system-account tier (10,000/day)** if we qualify.

## Business impact

ContractsIntel (https://contractsintel.com) is a production SaaS that surfaces federal contracting opportunities to certified small-business contractors (HUBZone, 8(a), SDVOSB, WOSB). Our May 4, 2026 HUBZone cold-outbound launch depends on daily SAM Opportunities ingest. At the current effective ceiling we cannot maintain a usable opportunity feed. We have already disabled our hourly ingest cron (commit `dc83e9b` on github.com/contractsintel/contractsintel main) to stop consuming any further quota while this ticket is open.

## Mitigations we've already put in place

- Rotated the compromised key on Apr 21, 2026 (on our end; this is our first formal support contact).
- Disabled the hourly `scrape-opportunities` Vercel cron (PR #14, merged as commit `dc83e9b`) to prevent further quota consumption.
- Updated our one-shot backfill script to upsert per page so partial progress survives a 429 (PR #15, merged as commit `0c23596`).
- Holding all production calls to `api.sam.gov` until this ticket is resolved, aside from at most one controlled probe per day for monitoring.

## Contact

- Name: Raphael Hertz
- Email: rafihertz@gmail.com
- Project: ContractsIntel (github.com/contractsintel/contractsintel)
- Production domain: https://contractsintel.com

Happy to provide additional log excerpts, full request/response captures with timestamps, or a live controlled-probe session on request.

---

### Internal notes (do not include in outbound ticket)

- Evidence in this draft is limited to items that can be produced verbatim from our audit trail or re-run on demand:
  - **Exhibit A**: captured live on 2026-04-24 via a single curl — fully reproducible; full request URL and response body above.
  - **Exhibit B**: row `id` in `cron_alerts` captured 2026-04-19 23:05:48 UTC, `source=cert-pipeline`.
- Intentionally omitted from the outbound appeal:
  - Any specific per-day call count (e.g. "~17/day"). Our prior rough estimate was inferred from a backfill run that 429'd after 5 successful pages, not from audit data; we don't want to cite a number we can't verify.
  - An hourly Apr 23 call-accounting table. The `scrape-opportunities` route writes no audit row on failure, so we cannot produce a verified per-hour log and will not reconstruct one.
  - The 406 / HAL-JSON content-negotiation bug in our separate `scrape-federal` scraper (fixed in PR #16, commit `824c52a`). That scraper hits `sam.gov/api/prod/sgs/v1/search/`, a different host with no shared quota, so it is not relevant to this appeal and mentioning it would only muddy the narrative.
- If SAM responds "your account is on the default public tier, no flag found" — that contradicts Exhibit A; push back politely with the verbatim 429 body and offer to re-run the probe on a shared call.
- Best case: tier restored within 2–5 business days. Fallback data sources (USASpending, grants.gov, the fixed `scrape-federal` feed) keep the product alive for May 4 even if the appeal stalls.
