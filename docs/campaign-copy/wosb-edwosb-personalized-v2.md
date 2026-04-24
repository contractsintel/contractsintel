# WOSB / EDWOSB — Personalized v2 (Draft)

**Campaign**: `c054a34d-5cbc-468b-aef7-677f9e5e61f5` (BidsGov - Cold Outbound - WOSB/EDWOSB)
**Universe**: 12,265 NeverBounce-valid leads, source='dsbs' (wosb=12,253 + edwosb=12 — single combined campaign per `CAMPAIGN_MAP`)
**Drafted**: 2026-04-24 (same framework as HUBZone v2 / 8(a) v2 / SDVOSB v2: 1 merge tag, Steps 1-3 personalized, Steps 4-5 = COLD-04/05 unchanged)
**Supersedes**: existing sequences on campaign c054a34d once approved

---

## 1. Verified WOSB/EDWOSB stats (source: docs/verified-stats/wosb-edwosb-claim-audit-2026-04-21.json)

Pulled against `public.opportunities`, sam_gov + sam sources (effective window ends 2026-04-14 — 7-day SAM ingest gap):

| metric | value | n |
|---|---:|---:|
| DLA share of WOSB/EDWOSB set-asides | **~63%** (62.1–63.9% across 90/180-day windows; 60.5% at 365d) | 95/153 @ 180d |
| DLA Maritime (top single buyer) | 30.7% | 47/153 |
| Top-4 DLA subcommands share of DLA volume | 99% | Maritime 47 · Land 28 · Aviation 11 · Troop Support 8 |
| NAICS-33 Manufacturing share of DLA-WOSB | **92.6%** (99.9% of all DLA-WOSB is manufacturing 31-33) | 88/95 |
| Top 6-digit NAICS (DLA-WOSB) | 334417 Electronic Connectors (n=10) · 335999 Misc Electrical (n=8) · 334220 Wireless Comm Equip (n=7) | — |
| EDWOSB-only DLA share | 12.5% (2/16) | n=16 — too thin to lean on |

**Caveat**: n=153 at 180d is thinner than SDVOSB (n=917) but stronger than 8(a) (n=125). The 63% DLA figure is stable across the two main windows — high-confidence hook. The DLA story is really a **WOSB** story (not EDWOSB — EDWOSB subsample is too small for subgroup claims); copy aggregates both under "WOSB set-asides" which is fair for a WOSB/EDWOSB campaign.

**Audit flags carried forward from 2026-04-21**:
- Say **"manufacturing — especially electronic components, parts, and assemblies"**. Do NOT say "facilities" or "supply categories" — the 2026-04-21 audit flagged both as wrong (zero construction/facilities NAICS, zero wholesale NAICS in DLA-WOSB). The DLA-WOSB pool is 99.9% manufacturing.
- The 4 named DLA subcommands (Maritime, Land, Aviation, Troop Support) are correct and in the correct volume order.

---

## 2. Lead-side enrichment coverage (12,265 WOSB/EDWOSB valids)

| field | populated | coverage |
|---|---:|---:|
| `first_name` | 12,265 | 100% |
| `company_name` | 12,265 | 100% |
| `naics_primary` | 12,038 | 98.1% |
| `naics_label` (lookup hit) | 10,216 | **84.9%** |

**Lead-side NAICS distribution (2-digit, WOSB+EDWOSB combined):**

| NAICS | sector | n | % |
|---|---|---:|---:|
| 54 | Professional/Scientific/Technical | 5,094 | 42.3% |
| 56 | Admin/Support/Waste/Remediation | 1,288 | 10.7% |
| 23 | Construction | 1,254 | 10.4% |
| 31-33 | Manufacturing | 898 | **7.5%** |
| 61 | Educational | 773 | 6.4% |
| 48-49 | Transportation | 527 | 4.4% |
| 62 | Health Care | 515 | 4.3% |
| 42 | Wholesale Trade | 457 | 3.8% |
| 51 | Information | 248 | 2.1% |
| 81 | Other Services | 245 | 2.0% |

**Mismatch hook**: the sharpest mismatch of all four certs. WOSB/EDWOSB lead side is **42% pro services**, only **7.5% manufacturing**. But 63% of WOSB set-aside *volume* is DLA manufacturing (99.9% manufacturing-coded). The firms are mostly consulting / admin / construction; the awards are mostly electronic connectors, wireless comm equipment, and aircraft parts. Cleanest version of the recurring pattern.

---

## 3. Merge-tag inventory (same as HUBZone v2 / 8(a) v2 / SDVOSB v2)

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

**Subject A**: `quick question on {{naics_label|WOSB}}`
**Subject B**: `quick question on WOSB`

(Subject B is pure-fallback — no merge tag — so A/B variation is genuine even when naics_label is absent.)

**Preview**: Most WOSB firms I talk to hear about relevant set-asides after the window's already closed.

**Body**:
```
{{firstName}} —

Most WOSB firms I talk to find out about relevant set-asides a week or two after the response window opened. They're registered for the right codes — they just never saw the solicitation in time.

Is that {{companyName}}'s situation, or do you have something in place for catching these early?

{{sendingAccountFirstName}}
```

**CTA**: Reply only.

Rationale: mirrors HUBZone / 8(a) / SDVOSB Step 1. Universal time-to-opportunity pain point.

---

### Step 2 (Day 3) — Verified-Stat Hook + Compliance Story

**Subject A**: `63% of WOSB set-asides are DLA — not civilian`
**Subject B**: `where WOSB set-asides actually come from`

**Preview**: About 63% of WOSB set-asides last year came from DLA — mostly electronics manufacturing.

**Body**:
```
{{firstName}} —

Pulled the numbers on WOSB and EDWOSB set-asides the last 6 months. About 63% came from DLA — specifically DLA Maritime, DLA Land, DLA Aviation, and Troop Support. Not the civilian agencies most WOSB firms expect.

That DLA pool is heavy on manufacturing — especially electronic components, parts, and assemblies. Most WOSB firms are in professional services or admin, which is a completely different pool than where the award volume actually sits.

One other thing that comes up a lot on WOSB: the SBA certification renewal. WOSB and EDWOSB certifications expire annually, and when a firm's certify.sba.gov record drifts out of sync — expiration lapses, ownership percentages change — procurement systems silently drop them from set-aside eligibility. No error, no notification.

Curious whether {{companyName}} has seen DLA activity in {{naics_label|your codes}} recently.

{{sendingAccountFirstName}}
```

**CTA**: Reply only.

Notes:
- "About 63%" is precisely right (62.1% 180d, 63.9% 90d). Calling it "63%" is the cleanest middle-ground.
- 4 DLA subcommands named are correct and in correct order per audit.
- "Manufacturing — especially electronic components, parts, and assemblies" replaces the old audit-flagged "facilities and supply categories" wording. Matches reality (99.9% manufacturing; top 6-digit codes are electronic connectors / misc electrical / wireless comm).
- Compliance angle: SBA WOSB/EDWOSB annual certification renewal drift via certify.sba.gov. Parallels HUBZone SAM-address / 8(a) annual-review / SDVOSB VetCert patterns.
- `{{naics_label|your codes}}` is the only merge tag in the body.

---

### Step 3 (Day 7) — Sample Match Report Offer

**Subject A**: `the actual matches in your codes`
**Subject B**: `WOSB matches for {{companyName}}`

**Preview**: I can pull every WOSB/EDWOSB set-aside in your NAICS over the last 30 days, scored by fit.

**Body**:
```
{{firstName}} —

Following up on WOSB set-asides. I can pull every solicitation from the last 30 days that matches {{companyName}}'s NAICS codes and WOSB/EDWOSB status — DLA, civilian, and the long tail — scored by how close a fit each one is for your firm.

Takes a few minutes to run. Want me to send it over?

{{sendingAccountFirstName}}
```

**CTA**: Reply only — "just reply yes". `handle-cold-reply` worker generates the actual report within 30 min of an affirmative.

---

### Step 4 (Day 10) — Permission to Close the Loop

Same as HUBZone / 8(a) / SDVOSB Step 4 / existing COLD-04. Unchanged text.

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

Same as HUBZone / 8(a) / SDVOSB Step 5 / existing COLD-05. Unchanged.

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
| `naics_label` custom field auto-registers on WOSB/EDWOSB campaign via lead POST | ❌ post-approval (first real lead sync registers it automatically) |
| WOSB/EDWOSB campaign sequences (Steps 1-5) pushed via `PATCH /campaigns/{id}` | ❌ post-approval |
| Any existing leads in WOSB/EDWOSB campaign purged (if present) | ❌ post-approval, same pattern as HUBZone/8(a)/SDVOSB |
| Lead load to campaign | ❌ deferred until all 4 cert copies approved — **this is the last one** |

---

## 6. Post-approval checklist

1. **Audit existing state of WOSB/EDWOSB campaign `c054a34d-…`**: check lead count, current sequences, `cert_queue_state.{wosb,edwosb}.sync_enabled` flags.
2. **Lock sync** (if not already): `UPDATE cert_queue_state SET sync_enabled=false WHERE cert IN ('wosb','edwosb')`.
3. **Purge any loaded leads** from the WOSB/EDWOSB Instantly campaign.
4. **PATCH sequences**: install the 5-step sequence from §4.
5. **Verify**: re-fetch sequences JSON, confirm all 5 steps, correct subjects, correct `{{naics_label|fallback}}` bare-text syntax.
6. **Next**: with all 4 certs' v2 copy installed, move to pre-launch readiness for the 2026-05-04 HUBZone activation (bulk lead load, sync unlock, final dry run).

---

## 7. Known deferrals

- Steps 4-5 unchanged from COLD-04/05 — personalization in wind-down emails reads weird.
- EDWOSB-only subgroup claims intentionally avoided. n=16 in 180d; DLA share inverts (12.5%) but sample is too thin to base copy on. Aggregate WOSB+EDWOSB framing is honest for a combined campaign.
- Dropped audit-flagged "facilities" and "supply categories" characterizations. Replaced with accurate "electronic components, parts, and assemblies" language.
- The DLA Maritime single-agency hook (30.7% of all WOSB set-asides — bigger concentration than DLA-Maritime's SDVOSB share) is available as a sharper alternative subject line if the "63% DLA" version underperforms.
