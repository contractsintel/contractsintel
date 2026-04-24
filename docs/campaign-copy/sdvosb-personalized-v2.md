# SDVOSB — Personalized v2 (Draft)

**Campaign**: `c0e249a1-a7aa-4c65-8a85-c8b575810956` (BidsGov - Cold Outbound - SDVOSB)
**Universe**: 21,945 NeverBounce-valid leads, source='dsbs', primary_cert='sdvosb'
**Drafted**: 2026-04-24 (same framework as HUBZone v2 / 8(a) v2: 1 merge tag, Steps 1-3 personalized, Steps 4-5 = COLD-04/05 unchanged)
**Supersedes**: existing sequences on campaign c0e249a1 once approved

---

## 1. Verified SDVOSB stats (source: docs/verified-stats/sdvosb-claim-audit-2026-04-21.json)

Pulled against `public.opportunities`, sam_gov + sam sources (effective window ends 2026-04-14 — 7-day SAM ingest gap):

| metric | value | n |
|---|---:|---:|
| VA share of SDVOSB set-asides | **~66%** (65.8–66.6% across 90/180/365-day windows) | 607/917 @ 180d |
| DoD share | ~32% | 298/917 |
| DLA Maritime (top single buyer) | 11.9% | 109/917 |
| VA offices in top-10 buyers | **8 of 10** | — |
| VA NCOs (strict "Network Contract Office") in top-10 | 6 of 10 | — |
| Top-2 VA SDVOSB buyers (both non-NCO) | PCAC Health Info 36C776 (n=68) · National Cemetery Admin 36C786 (n=58) | — |

**Caveat**: n=917 at 180d is statistically strong (unlike 8(a) at 125). The ~66% VA share is stable across all four windows — this is a high-confidence hook.

**Audit flags carried forward from 2026-04-21**:
- Say **"VA contracting offices"**, not "VA NCOs". 8 of top 10 are VA offices broadly; only 6 are strict NCOs. The 2/3 claim is about VA overall, not NCOs specifically.
- Do **NOT** claim "VA runs its own acquisition portal separate from SAM/DoD". That's materially wrong — 100% of our VA SDVOSB rows are source='sam_gov'. VA's separate portal (VetCert / formerly VetBiz / CVE) is for *vendor verification*, not opportunities. This draft drops the portal claim entirely.

---

## 2. Lead-side enrichment coverage (21,945 SDVOSB valids)

| field | populated | coverage |
|---|---:|---:|
| `first_name` | 21,945 | 100% |
| `company_name` | 21,945 | 100% |
| `naics_primary` | 21,652 | 98.7% |
| `naics_label` (lookup hit) | 18,245 | **84.3%** |

**Lead-side NAICS distribution (2-digit, SDVOSB only):**

| NAICS | sector | n | % |
|---|---|---:|---:|
| 54 | Professional/Scientific/Technical | 7,517 | 34.7% |
| 23 | Construction | 3,014 | 13.9% |
| 56 | Admin/Support/Waste/Remediation | 2,835 | 13.1% |
| 48-49 | Transportation | 1,436 | 6.6% |
| 31-33 | Manufacturing | 1,427 | **6.6%** |
| 42 | Wholesale Trade | 1,127 | 5.2% |
| 61 | Educational | 936 | 4.3% |
| 81 | Other Services | 692 | 3.2% |
| 62 | Health Care | 644 | 3.0% |
| 51 | Information | 409 | 1.9% |

**Mismatch hook**: the volume story on the opportunity side is "VA first, DLA second." The lead side is pro-services-heavy (35%) and construction/admin (14% / 13%), with manufacturing only 6.6% — which is exactly where DLA Maritime and DLA Land run. Mirrors the HUBZone / 8(a) pattern: where the firms are and where the awards are don't line up.

---

## 3. Merge-tag inventory (same as HUBZone v2 / 8(a) v2)

Already wired in `toInstantlyLead` — no new variables needed:

| Instantly token | source | null-safe |
|---|---|---|
| `{{firstName}}` | `leads.first_name` → payload.first_name | yes |
| `{{companyName}}` | `leads.company` → payload.company_name | yes |
| `{{sendingAccountFirstName}}` | Instantly native | yes |
| `{{naics_label}}` | `naicsLabel(leads.naics_primary)` | yes; returns null → bare-text fallback fires |

---

## 4. Final copy

### Step 1 (Day 0) — Observation + Question

**Subject A**: `quick question on {{naics_label|SDVOSB}}`
**Subject B**: `quick question on SDVOSB`

(Subject B is pure-fallback — no merge tag — so A/B variation is genuine even when naics_label is absent.)

**Preview**: Most SDVOSB firms I talk to hear about relevant set-asides after the window's already closed.

**Body**:
```
{{firstName}} —

Most SDVOSB firms I talk to find out about relevant set-asides a week or two after the response window opened. They're registered for the right codes — they just never saw the solicitation in time.

Is that {{companyName}}'s situation, or do you have something in place for catching these early?

{{sendingAccountFirstName}}
```

**CTA**: Reply only.

Rationale: mirrors HUBZone / 8(a) Step 1. Universal time-to-opportunity pain point. Saves the SDVOSB-specific VA concentration insight for Step 2.

---

### Step 2 (Day 3) — Verified-Stat Hook + Compliance Story

**Subject A**: `two-thirds of SDVOSB set-asides come from the VA`
**Subject B**: `where SDVOSB set-asides actually come from`

**Preview**: About two-thirds of SDVOSB set-asides last year came from the VA — not DoD.

**Body**:
```
{{firstName}} —

Pulled the numbers on SDVOSB set-asides the last 6 months. About two-thirds came from the VA — not DoD. Eight of the top ten buyers in that window were VA contracting offices.

The top two VA offices alone — PCAC Health Information and the National Cemetery Administration — ran over 120 SDVOSB set-asides. Most SDVOSB firms focus on DoD work and miss the VA side entirely, which is where the volume actually is.

One other thing that comes up a lot on SDVOSB: the VetCert verification status. When a firm's VetCert record drifts out of sync — expiration lapses, ownership details change — the Veteran Small Business Certification Database silently drops them from set-aside eligibility. No error, no notification.

Curious whether {{companyName}} has seen VA SDVOSB activity in {{naics_label|your codes}} recently.

{{sendingAccountFirstName}}
```

**CTA**: Reply only.

Notes:
- "Two-thirds" / "about two-thirds" avoids false precision. True range is 65.8–66.6%.
- "VA contracting offices" (not "VA NCOs") per 2026-04-21 audit — 8 of top 10 are VA offices broadly; only 6 are strict NCOs.
- Named top-2 VA buyers are PCAC Health Information (36C776, n=68) and NCA (36C786, n=58). 68+58 = 126 → "over 120" is honest and memorable.
- Compliance angle: VetCert (formerly VetBiz/CVE, migrated to SBA Jan 2023) verification drift → silent exclusion from Veteran Small Business Certification Database. Parallels HUBZone's SAM-address drift and 8(a)'s annual-review drift.
- `{{naics_label|your codes}}` is the only merge tag in the body.
- Drops the old "VA runs its own portal" claim entirely — that was materially wrong per audit.

---

### Step 3 (Day 7) — Sample Match Report Offer

**Subject A**: `the actual matches in your codes`
**Subject B**: `SDVOSB matches for {{companyName}}`

**Preview**: I can pull every SDVOSB set-aside — VA and DoD — in your NAICS over the last 30 days, scored by fit.

**Body**:
```
{{firstName}} —

Following up on SDVOSB set-asides. I can pull every solicitation from the last 30 days that matches {{companyName}}'s NAICS codes and SDVOSB status — VA, DLA, and the long tail — scored by how close a fit each one is for your firm.

Takes a few minutes to run. Want me to send it over?

{{sendingAccountFirstName}}
```

**CTA**: Reply only — "just reply yes". `handle-cold-reply` worker generates the actual report within 30 min of an affirmative.

---

### Step 4 (Day 10) — Permission to Close the Loop

Same as HUBZone / 8(a) Step 4 / existing COLD-04. Unchanged text.

**Subject A**: `still relevant?`
**Subject B**: `closing the loop`

**Body**:
```
{{firstName}} —

I've sent a few notes over the past couple weeks. Haven't heard back, which probably means the timing isn't right — or I got the wrong person.

If federal contract tracking isn't on your radar right now, no problem. If it is and the timing's just been bad, I'm happy to follow up in a few months.

Either way, worth knowing. What's the situation?

{{sendingAccountFirstName}}
```

---

### Step 5 (Day 14) — Case Closed

Same as HUBZone / 8(a) Step 5 / existing COLD-05. Unchanged.

**Subject A**: `closing this out`
**Subject B**: `taking you off my list`

**Body**:
```
{{firstName}} — closing this out. If the timing changes, you know where to find me.

{{sendingAccountFirstName}}
```

---

## 5. Implementation status (post-approval)

| item | status |
|---|---|
| `naics_label` wired in sync.ts (cross-cert) | ✅ shipped (HUBZone PR #24) |
| Bare-text fallback syntax confirmed (no quotes) | ✅ verified end-to-end via test send |
| `naics_label` custom field auto-registers on SDVOSB campaign via lead POST | ❌ post-approval (first real lead sync registers it automatically) |
| SDVOSB campaign sequences (Steps 1-5) pushed via `PATCH /campaigns/{id}` | ❌ post-approval |
| Any existing leads in SDVOSB campaign purged (if present) | ❌ post-approval, same pattern as HUBZone/8(a) |
| Lead load to campaign | ❌ deferred until all 4 cert copies approved |

---

## 6. Post-approval checklist

1. **Audit existing state of SDVOSB campaign `c0e249a1-…`**: check lead count, current sequences, `cert_queue_state.sdvosb.sync_enabled` flag.
2. **Lock sync** (if not already): `UPDATE cert_queue_state SET sync_enabled=false WHERE cert='sdvosb'`.
3. **Purge any loaded leads** from the SDVOSB Instantly campaign.
4. **PATCH sequences**: install the 5-step sequence from §4.
5. **Verify**: re-fetch sequences JSON, confirm all 5 steps, correct subjects, correct `{{naics_label|fallback}}` bare-text syntax.
6. **Next**: proceed to WOSB/EDWOSB draft using same framework.

---

## 7. Known deferrals

- Steps 4-5 unchanged from COLD-04/05 — personalization in wind-down emails reads weird.
- Dropped the "VA runs separate portal" claim entirely. It's both wrong (VA opps are on SAM) and not useful — the real procurement complexity is VetCert verification, which is the compliance paragraph.
- The 6.6% manufacturing lead-side vs DLA-Maritime-#1 mismatch is noted in §2 but not in the Step 2 body — would read as stat-dumping on top of the VA hook. Can revisit if VA framing underperforms.
- If Raphael wants a sharper stat, consider replacing "over 120 SDVOSB set-asides" with the exact "126 in the last 6 months" — slightly more credible, slightly less round. Current draft favors the rounded form.
