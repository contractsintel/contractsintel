# DSBS / SBS Scraper — Implementation Plan

**Status:** DRAFT. POC code lives on branch `feat/dsbs-scraper-poc` (same PR as this doc). Do not merge or deploy until Raphael signs off on the ToS posture and POC output.

**Problem framing.** On 2026-04-24 Raphael manually verified that SBA's Small Business Search (SBS, formerly DSBS) publicly renders the contact email for nearly every certified small business in its search result tables, defaulting to visible with an opt-out. This opens a free path to the full universe of ~40,000+ certified contractors across 8(a), HUBZone, SDVOSB, WOSB, and EDWOSB — shifting the SAM-API appeal from critical path to nice-to-have for the contractor-leads workload.

### Update 2026-04-24: pivoted from Patchright to direct API

During POC we captured the SPA's network traffic and discovered that SBS ships a same-origin **public JSON API** at `POST https://search.certifications.sba.gov/_api/v2/search`. Passing `sbaCertifications.activeCerts` with the right cert code returns the entire filtered universe in **one response, no auth, no pagination, no WAF**. A live HUBZone call returned **5,124 rows** in one request, with 97.3% email coverage, 100% UEI coverage, 37.4% multi-cert. The Patchright approach in earlier drafts of this doc is now superseded — we kept the earlier POC file for reference but the canonical POC is `scripts/dsbs-api-poc.js`, ~200 LOC, no browser. Sections below have been updated accordingly; supplanted sections are marked ~~struck through~~.

---

## 1. Target & scope

| Item | Value |
|---|---|
| Source site (public) | https://search.certifications.sba.gov/ (React SPA) |
| Source site (legacy) | https://dsbs.sba.gov/search/dsp_profile.cfm?SAM_UEI={uei} (still resolving; WAF-blocked to plain curl) |
| Universe | 8(a), HUBZone, SDVOSB, WOSB, EDWOSB — ~40k+ entities, deduped across certs |
| Data per firm | company, contact person, email, address (full), active certifications, capabilities narrative, NAICS codes, UEI, CAGE (when visible), website |
| Destination | `public.leads` (source = `'dsbs'`) — schema already matches, see §4 |
| POC scope | Scrape 100 HUBZone firms, upsert to `leads`, spot-check quality |

---

## 2. Technical approach — direct API (recommended)

### The real backend

`POST https://search.certifications.sba.gov/_api/v2/search` — same-origin JSON endpoint, no auth, no CSRF token, no rate-limit headers observed. Cert code map (recovered from the SPA bundle):

| Cert | `activeCerts.value` |
|---|---|
| 8(a) or 8(a) Joint Venture | `"1,4"` |
| HUBZone | `"3"` |
| WOSB | `"5"` |
| EDWOSB | `"6"` |
| VOSB | `"9,10"` |

Request body is a nested object (see `scripts/dsbs-api-poc.js::buildBody`). The server echoes its filter expression as `meili_filter: "public_display = true AND ( active_hz_boolean = true )"` — confirming the per-firm opt-out is honored server-side before results leave the origin.

Each result row contains, among others: `email`, `contact_person`, `uei`, `cage_code`, `legal_business_name`, `dba_name`, `phone`, `address_1/2`, `city`, `state`, `zipcode`, `county`, `website`, `additional_website`, `naics_primary`, `naics_all_codes[]`, `keywords[]`, `capabilities_narrative`, `year_established`, `annual_revenue`, `business_size`, and an `active_*_boolean` flag per cert (`active_hz_boolean`, `active_8a_boolean`, etc.) so we can derive `cert_types[]` in-line without cross-cert joining.

### Full-universe sweep plan

Five HTTP POSTs — one per target cert (8a, HUBZone, WOSB, EDWOSB, SDVOSB-via-self-cert) — merged on `uei` with a `cert_types` union. **Projected wall-clock runtime: <30 seconds.** No pagination needed; per-cert responses appear to be single-shot full sets (5,124 rows for HUBZone in one body).

### ~~Why Patchright on the existing Railway puppeteer-server~~ (superseded)

The site is a client-rendered React SPA behind a CDN/WAF. Plain `fetch`/`curl` returns either empty HTML (SPA shell) or 503 (WAF block), so we need a real browser. We already run **Patchright** (stealth Playwright) in `puppeteer-server/server.js` on Railway (Hobby tier, already paid, already in prod), with `stealthHeaders()` UA rotation and proven patterns for similar government sites (grants.gov, sam.gov internal search, state procurement portals). Extending that server with one new `/cron/dsbs-scrape` endpoint is the minimum-viable delta — no new infra, no new dependencies.

### Why not Vercel headless-browser

Vercel Functions can run `@sparticuz/chromium` but: (a) cold-start overhead dwarfs per-request runtime for SPA scraping, (b) 300s function ceiling forces chunked jobs with resume cursors which we don't need on Railway, (c) it duplicates infra we already own.

### Why not Apify ($5/1k × 40k ≈ $200)

Apify's `fatihtahta/sba-gov-scraper` is a reasonable commercial fallback and was one of the scaffolding data points for the "emails are visible" finding. But:
- At ~$200 for a one-shot full-universe pull plus ongoing ~$20/mo for deltas, it's cheap, not free.
- We lose control over selector changes, rate-limit behavior, and the audit trail.
- Patchright in Railway is zero marginal cost and we already own the operational expertise.

Keep Apify as a **named fallback** if our Patchright scraper hits persistent WAF escalation we can't negotiate past.

### Page flow

1. Navigate to `https://search.certifications.sba.gov/` via Patchright with a residential-looking UA (reuse `stealthHeaders()` from `puppeteer-server/server.js`).
2. Apply cert filter (one scrape pass per cert to get clean cert-level counts; dedupe by UEI on write).
3. For each result page, read the results table directly — rows already contain every field we need.
4. Paginate via "next" button or URL pagination (to be confirmed in POC; SPA may use offset params).
5. Per row, map to a `leads` row (see §4) and upsert keyed on `dedup_key`.
6. Sleep **2–3s** between page navigations; exponential back-off on any 403/503/429.

**No per-profile drill-down needed.** Email is in the results table. This is the biggest cost saver: 40k rows at ~20/page = 2,000 page loads, not 40,000.

---

## 3. Rate limit & anti-ban strategy

Near-trivial under the direct-API design: **5 POST requests total, one per cert**, executed sequentially with a 2s pause between. No browser, no headers worth spoofing, no session state. If the API ever starts returning 429/5xx we'll revisit; for now an exponential back-off is overkill. Projected full-universe wall-clock: **under 30 seconds**.

~~Prior Patchright-era budget: 100 minutes of paginated browser work, session reset every 200 pages, UA rotation, etc.~~ — obsolete, left in git history on earlier commits of this file.

---

## 4. Schema — no migration needed

The `leads` table was extended in `supabase/migrations/20260417_leads_cold_outbound_routing.sql` with exactly the columns DSBS needs:

```
cert_types    text[]   — all certs the firm holds (e.g. ['hubzone','wosb'])
primary_cert  text     — routing cert for Instantly (CHECK 8a|sdvosb|wosb|edwosb|hubzone)
naics_codes   text[]
source        text     — 'dsbs' (per existing column comment)
source_url    text     — dsbs.sba.gov/search/dsp_profile.cfm?SAM_UEI={uei}
dedup_key     text     — lower(coalesce(uei, email)), UNIQUE
```

Upsert pattern (mirrors `lib/pipeline/ingest.ts` for sam_entity ingest):

```ts
supabase.from("leads").upsert(batch, {
  onConflict: "dedup_key",
  ignoreDuplicates: false,  // DSBS row overwrites prior if we see a richer capture
});
```

**Multi-cert handling.** When we re-encounter a firm under a second cert, `cert_types` is merged (union) and `primary_cert` is chosen by priority: `hubzone > sdvosb > 8a > wosb > edwosb` (matches existing product routing — subject to review). The POC uses a simple last-write-wins write; the merge helper lands in the follow-up full-backfill PR.

**Contact-name parsing.** DSBS exposes a single "Contact person" field (e.g. `JESSICA PRESCO`). Split on first whitespace into `first_name` / `last_name`; leave `last_name` null if only one token. Good enough for Instantly mail-merge; revisit if bounces correlate.

---

## 5. Legal / ToS posture

What we checked:

- **robots.txt**: `https://search.certifications.sba.gov/robots.txt` returns the SPA's own HTML (i.e. no robots file present; React router catches all paths). `https://dsbs.sba.gov/robots.txt` returns 503. **No robots rule disallows us.**
- **SBA ToS**: `sba.gov/about-sba/open-government/digital-sba/terms-use` and `/sba-website-policies` both 404'd on WebFetch. No documented automated-access prohibition found via search.
- **Implicit signal**: Apify openly sells a commercial SBA/DSBS scraper (`fatihtahta/sba-gov-scraper`, $5/1k results) that has not been taken down — strong evidence SBA does not treat respectful scraping as an abuse case.
- **Nature of the data**: federal public data; profiles are self-registered by small businesses specifically to be found by federal contracting partners. The per-firm opt-out Raphael observed ("The business owner has hidden this email address from public searches") is itself evidence that public visibility is the affirmative default.

**Risk rating: LOW.** Mitigations:

1. Respect the per-firm email-hidden opt-out — if a row renders no email, write no lead (skip, don't backfill from another source).
2. Rate-limit respectfully (§3). If we ever see the WAF escalate against a specific IP, stop and re-plan rather than rotate proxies.
3. Do not redistribute raw DSBS data — we use it to send legitimate first-party outbound from `contractsintel.com`, not resale.
4. **Open question for Raphael:** do we want counsel to eyeball this before we move past POC? Non-blocking for the POC (100 records, local spot-check) but worth asking before the 40k full-universe sweep.

---

## 6. Phasing

| Phase | Deliverable | State |
|---|---|---|
| **POC** | `/cron/dsbs-scrape` endpoint in puppeteer-server; 100 HUBZone firms upserted; quality spot-check | This PR (draft) |
| **Full backfill** | Multi-cert sweep across 5 cert filters; merge logic for cert_types union; scraper_runs audit row | Next PR, after POC review |
| **Delta refresh** | Weekly cron (Sunday 04:00 UTC) to catch new registrations and cert changes | PR 3 |
| **Instantly routing** | Wire `source='dsbs'` leads into existing cold-outbound sync (`lib/pipeline/sync.ts`) | PR 4 — likely no code change if dedup/routing already handles source-agnostically |

---

## 7. Cost estimate

- **Infra**: $0 marginal (Railway Hobby already running).
- **One-shot backfill compute**: ~100 min of CPU on Railway, well inside paid tier.
- **Ongoing delta**: ~10 min/week. Negligible.
- **Observability**: reuse existing `scraper_runs` audit table; no new tooling.
- **Commercial alternative (Apify)**: ~$200 one-shot + ~$20/mo delta, kept as named fallback.

**Net:** full-universe contact dataset at zero marginal cost if the POC validates the approach.

---

## 8. Open questions (before leaving POC)

1. Does the results table expose **capabilities narrative** inline, or is it a click-through? (POC will confirm.)
2. Does pagination advance via URL (`?page=N`) or only via in-page button click? (Changes resume-cursor design for full backfill.)
3. What fraction of rows have the email-hidden opt-out? (POC 100-sample gives a first read.)
4. Is there a natural sort order we can rely on for idempotent re-runs, or do we need to dedupe purely on `dedup_key`?
5. Counsel review before full-universe sweep — yes/no?

---

## 9. Appendix — why no SAM ingest change here

This plan intentionally says nothing about the SAM.gov Entity/Opportunities pipelines. Those remain on the separate `api.sam.gov` workload, and the support-tier appeal (currently in Raphael's court to send via `iaeoutreach@gsa.gov`) is orthogonal. A restored SAM tier will add **opportunities-side freshness** and **UEI/CAGE cross-checking** for DSBS rows, but it is no longer the bottleneck for the 40k+ **contacts** universe — that's what this plan delivers.
