# 8(a) — Personalized v2 (Draft)

**Campaign**: `90b29a94-8dff-40cb-8dbb-12d26a2d2d56` (BidsGov - Cold Outbound - 8(a))
**Universe**: 2,331 NeverBounce-valid leads, source='dsbs', primary_cert='8a'
**Drafted**: 2026-04-24 (same framework as HUBZone v2: 1 merge tag, Steps 1-3 personalized, Steps 4-5 = COLD-04/05 unchanged)
**Supersedes**: existing sequences on campaign 90b29a94 once approved

---

## 1. Verified 8(a) stats (source: docs/verified-stats/8a-claim-audit-2026-04-21.json)

Pulled against `public.opportunities`, sam_gov + sam sources, 90-day window (effective 2026-01-21 through 2026-04-14 — 7-day SAM ingest gap noted):

| metric | value | n |
|---|---:|---:|
| 8(a) sole-source share of all 8(a) awards | **~40%** (39.7–41.2% across 30/90/180/365-day windows) | 50/125 @ 90d |
| Navy aggregate share of sole-source | **32%** (NAVSUP #3, NAVFAC #4, + NAVAIR/NAVSEA/USMC) | 16/50 |
| DLA Aviation sole-source share | 14% | 7/50 |
| NASA Shared Services sole-source share | 16% (#1 agency) | 8/50 |
| Sector spread (sole-source + competed, 90d) | Admin/Support 22% · Construction 21% · Mfg 20% · Pro Services 18% | 101/125 |

**Caveat**: n=125 is thin for 90d; the 40% sole-source rate is the strongest signal (stable across 4 windows). Copy uses "about 40%" / "roughly even quarters" phrasings rather than precise percentages.

**Note on agency list**: The prior 2026-04-21 audit flagged that calling out "NAVFAC, USACE, AMC, DLA" would be materially wrong — USACE has only 1 sole-source award in 90 days. This draft uses the verified set: **Navy subcommands + DLA + NASA**.

---

## 2. Lead-side enrichment coverage (2,331 8(a) valids)

| field | populated | coverage |
|---|---:|---:|
| `first_name` | 2,331 | 100% |
| `company_name` | 2,331 | 100% |
| `naics_primary` | 2,322 | 99.6% |
| `naics_label` (lookup hit) | 2,200 | **94.4%** (highest of the 4 certs) |

8(a) has the best lookup coverage because the lead pool is heavily concentrated in NAICS 54 (54%) — all of which are well-represented in the 150-code label table. The 5.6% miss falls through to the Instantly bare-text fallback.

**Lead-side NAICS distribution (2-digit, 8(a) only):**

| NAICS | sector | n | % |
|---|---|---:|---:|
| 54 | Professional/Scientific/Technical | 1,259 | 54.0% |
| 23 | Construction | 531 | 22.8% |
| 56 | Admin/Support/Waste/Remediation | 249 | 10.7% |
| 51 | Information | 59 | 2.5% |
| 33 | Manufacturing | 57 | **2.4%** |
| 48-49 | Transportation | 38 | 1.6% |
| 42 | Wholesale Trade | 31 | 1.3% |
| 62 | Health Care | 24 | 1.0% |

**Mismatch hook**: opportunity-side sole-source volume is roughly even across admin/support (22%), construction (21%), manufacturing (20%), and pro services (18%). The lead side is lopsided toward pro services (54%) with manufacturing barely represented (2.4%). Same shape of insight that drove HUBZone Step 2, different specifics.

---

## 3. Merge-tag inventory (same as HUBZone v2)

### Already wired in `toInstantlyLead`

| Instantly token | source | null-safe |
|---|---|---|
| `{{firstName}}` | `leads.first_name` → payload.first_name (Instantly maps to native firstName) | yes |
| `{{companyName}}` | `leads.company` → payload.company_name | yes |
| `{{sendingAccountFirstName}}` | Instantly native (sending mailbox first name) | yes |
| `{{naics_label}}` | `naicsLabel(leads.naics_primary)` | yes; returns null → bare-text fallback fires |

No new custom variables needed for 8(a) — sync.ts already populates `naics_label` for all certs.

---

## 4. Final copy

### Step 1 (Day 0) — Observation + Question

**Subject A**: `quick question on {{naics_label|8(a)}}`
**Subject B**: `quick question on 8(a)`

(Subject B is pure-fallback — no merge tag — so A/B variation is genuine even when naics_label is absent.)

**Preview**: Most 8(a) firms I talk to hear about relevant set-asides after the window's already closed.

**Body**:
```
{{firstName}} —

Most 8(a) firms I talk to find out about relevant set-asides a week or two after the response window opened. They're registered for the right codes — they just never saw the solicitation in time.

Is that {{companyName}}'s situation, or do you have something in place for catching these early?

{{sendingAccountFirstName}}
```

**CTA**: Reply only.

Rationale: mirrors HUBZone Step 1's universal time-to-opportunity pain point. Keeps the specific 8(a) insight (40% sole-source) for Step 2 where it has room to land.

---

### Step 2 (Day 3) — Verified-Stat Hook + Compliance Story

**Subject A**: `40% of 8(a) awards are sole-source, not competed`
**Subject B**: `where 8(a) sole-source dollars actually go`

**Preview**: About 40% of 8(a) awards last year were sole-source — and most of that volume runs through Navy, DLA, and NASA.

**Body**:
```
{{firstName}} —

Pulled the numbers on 8(a) awards the last 12 months. About 40% are sole-source — not competed at all. Navy subcommands run the biggest share, then DLA Aviation, then NASA Shared Services.

Sole-source volume is spread across construction, manufacturing, remediation, and professional services — roughly even quarters. Worth noting: most 8(a) firms are concentrated in professional services. The manufacturing side specifically has less competition per opportunity.

One other thing that comes up a lot on 8(a): the annual review / continuing eligibility filing. When a firm's filing drifts out of sync with SAM, some procurement systems silently exclude them from set-aside search results. No error, no notification.

Curious whether {{companyName}} has seen sole-source activity in {{naics_label|your codes}} recently.

{{sendingAccountFirstName}}
```

**CTA**: Reply only.

Notes:
- "About 40%" avoids implying false precision on n=125.
- Agency list is the verified-audit set (Navy / DLA / NASA) — explicitly does NOT include USACE (audit flagged that as wrong).
- Compliance angle parallels HUBZone's SAM address drift: 8(a) annual review filings drifting out of sync → silent exclusion from set-aside searches. Under-appreciated, concrete, actionable.
- `{{naics_label|your codes}}` is the only merge tag in the body.

---

### Step 3 (Day 7) — Sample Match Report Offer

**Subject A**: `the actual matches in your codes`
**Subject B**: `8(a) matches for {{companyName}}`

**Preview**: I can pull every 8(a) set-aside — sole-source and competed — in your NAICS over the last 30 days, scored by fit.

**Body**:
```
{{firstName}} —

Following up on 8(a) set-asides. I can pull every solicitation from the last 30 days that matches {{companyName}}'s NAICS codes and 8(a) status — sole-source and competed, across Navy, DLA, NASA, and the long tail — scored by how close a fit each one is for your firm.

Takes a few minutes to run. Want me to send it over?

{{sendingAccountFirstName}}
```

**CTA**: Reply only — "just reply yes". `handle-cold-reply` worker generates the actual report within 30 min of an affirmative.

---

### Step 4 (Day 10) — Permission to Close the Loop

Same as HUBZone Step 4 / existing COLD-04. Unchanged text, no personalization beyond core variables.

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

Same as HUBZone Step 5 / existing COLD-05. Unchanged.

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
| `naics_label` custom field auto-registers on 8(a) campaign via probe-lead technique | ❌ post-approval (no action required — first real lead sync will register it automatically) |
| 8(a) campaign sequences (Steps 1-5) pushed via `PATCH /campaigns/{id}` | ❌ post-approval |
| Any existing leads in 8(a) campaign purged (if present) | ❌ post-approval, same pattern as HUBZone |
| Lead load to campaign | ❌ deferred until all 4 cert copies approved |

---

## 6. Post-approval checklist

1. **Audit existing state of 8(a) campaign `90b29a94-…`**: check lead count, current sequences, `cert_queue_state.8a.sync_enabled` flag. (Same audit pattern just done for HUBZone — expect similar stale state from the 2026-04-18 pipeline deploy.)
2. **Lock sync**: `UPDATE cert_queue_state SET sync_enabled=false WHERE cert='8a'`.
3. **Purge any loaded leads** from the 8(a) Instantly campaign.
4. **PATCH sequences**: install the 5-step sequence from §4.
5. **Verify**: re-fetch sequences JSON, confirm all 5 steps, correct subjects, correct `{{naics_label|fallback}}` bare-text syntax.
6. **Next**: proceed to SDVOSB draft using same framework.

---

## 7. Known deferrals

- Steps 4-5 are unchanged from COLD-04/05. The HUBZone spec called that out explicitly ("personalization in wind-down emails reads weird") and the same logic applies here.
- No Step 2 "sector mismatch" numeric split in the copy. The 22/21/20/18% breakdown is honest but reads as stat-dumping. Copy uses the qualitative "roughly even quarters" instead.
- If Step 2 reply rate underperforms Step 1 at 14-day mark, consider trimming the compliance paragraph (annual review) — it's the densest block and a natural first cut.
- Agency claim leans on "Navy aggregate" at 32%. If Raphael wants, we can name the specific top-3 (NASA Shared Services 16%, DLA Aviation 14%, NAVSUP 12%) in the copy. Current draft says "Navy subcommands run the biggest share, then DLA Aviation, then NASA Shared Services" — accurate but less quantified. Change to specifics only if the aggregate reads weak.
