# HUBZone — Personalized v2 (Approved)

**Campaign**: `2cb25064-8d05-4966-9a57-90058f68241d` (BidsGov - Cold Outbound - HUBZone)
**Universe**: 3,785 NeverBounce-valid leads, source='dsbs', primary_cert='hubzone'
**Approved**: 2026-04-24 (Raphael review on initial draft; surface area simplified from 5 merge tags to 1)
**Supersedes**: COLD-01 / COLD-02d / COLD-03 in the existing `docs/email-system/03-email-copy.md` (non-git fork)

---

## 1. Verified HUBZone stats (refreshed 2026-04-24)

Pulled against `public.opportunities` (365-day window, `set_aside_type ILIKE '%hubzone%'`):

| metric | value | n |
|---|---:|---:|
| HUBZone set-asides | 114 | — |
| DLA share | **65.8%** | 75 / 114 |
| DLA Maritime alone | **39.5%** | 45 / 114 |
| NAICS-33 Manufacturing share (opps) | ~64% | 73 / 114 |
| NAICS-23 Construction share (opps) | ~26% | 30 / 114 |

HUBZone firms (lead-side) skew the other way: ~32% professional services (NAICS 54), 24% construction (NAICS 23), 10% manufacturing (NAICS 33). That mismatch is the Step 2 hook.

**Caveat**: n=114 is thin. DLA share is stable between Saturday's audit (64.7%) and today (65.8%); copy uses "about two-thirds" / "mostly" phrasings rather than precise %.

---

## 2. Lead-side enrichment coverage (3,785 HUBZone valids)

| field | populated | coverage |
|---|---:|---:|
| `first_name` | 3,785 | 100% |
| `company_name` | 3,785 | 100% |
| `naics_primary` | 3,785 | 100% |
| `naics_label` (lookup hit) | 3,171 | **83.9%** (cross-cert table) |

`naics_primary` 100% coverage; the `naics_label` cross-cert table (top 150 codes) resolves 84% of all 40,325 valid DSBS leads. Remaining 16% hit the Instantly fallback chain to `"HUBZone"` / `"those codes"`.

---

## 3. Merge-tag inventory (final)

### Already wired in `toInstantlyLead` (lib/pipeline/sync.ts)

| Instantly token | source |
|---|---|
| `{{first_name}}` | `leads.first_name` |
| `{{company_name}}` | `leads.company` |
| `{{sender_first_name}}` | static (Raphael) |

### NEW — added in this PR

| Instantly token | source | null-safe |
|---|---|---|
| `{{naics_label}}` | `naicsLabel(leads.naics_primary)` | yes; returns null → Instantly fallback syntax handles it |

**Dropped from the earlier draft per review**: `capabilities_excerpt`, `years_in_business`, `year_established`, `keyword_first`. Self-authored text is a risk vector; firm-age framing has edge cases (young firms). One merge tag is enough.

---

## 4. Final copy

### Step 1 (Day 0) — Observation + Question

**Subject A**: `quick question on {{naics_label|HUBZone}}`
**Subject B**: `quick question on HUBZone`

(Subject B is a pure-fallback variant — no merge tag, so Instantly A/B test sees genuine copy variation even when the lead has no NAICS label.)

**Preview**: Most HUBZone firms I talk to hear about set-asides after the window's already closed.

**Body**:
```
{{first_name}} —

Most HUBZone firms I talk to find out about relevant set-asides a week or two after the response window opened. They're registered for the right codes — they just never saw the solicitation in time.

Is that {{company_name}}'s situation, or do you have something in place for catching these early?

{{sender_first_name}}
```

**CTA**: Reply only.

---

### Step 2 (Day 3) — Verified-Stat Hook + Compliance Story

**Subject A**: `two-thirds of HUBZone set-asides go through DLA`
**Subject B**: `where HUBZone set-asides actually come from`

**Preview**: About two-thirds of HUBZone set-asides last year came from DLA — mostly manufacturing codes.

**Body**:
```
{{first_name}} —

Pulled the numbers on HUBZone set-asides the last 12 months. About two-thirds came from DLA — mostly in manufacturing codes. DLA Maritime alone ran 45 of them.

Most HUBZone firms we talk to aren't in {{naics_label|those codes}}. They're in professional services or construction. That's a different set of competitions than where the volume is. Worth knowing which pool {{company_name}} is actually positioned for.

One other thing that comes up a lot on HUBZone: the principal-office address in SAM has to match the certification record exactly. When it drifts, some procurement systems silently exclude the firm from set-aside searches. No error, no notification.

Curious whether {{company_name}} has had your HUBZone address and SAM record cross-checked recently, and which bucket your NAICS codes are tracking — DLA manufacturing or something else.

{{sender_first_name}}
```

**CTA**: Reply only.

---

### Step 3 (Day 7) — Sample Match Report Offer

**Subject A**: `the actual matches in your codes`
**Subject B**: `HUBZone matches for {{company_name}}`

**Preview**: I can pull every HUBZone set-aside in your NAICS over the last 30 days — scored by fit.

**Body**:
```
{{first_name}} —

Following up on HUBZone set-asides. I can pull every solicitation from the last 30 days that matches {{company_name}}'s NAICS codes and HUBZone status — DLA, Army, and the long tail — scored by how close a fit each one is for your firm.

Takes a few minutes to run. Want me to send it over?

{{sender_first_name}}
```

**CTA**: Reply only — "just reply yes". The `handle-cold-reply` worker sends the actual report within 30 min of an affirmative reply.

---

### Step 4 — Permission to Close (unchanged)

Keep existing COLD-04 as-is.

### Step 5 — Case Closed (unchanged)

Keep existing COLD-05 as-is.

---

## 5. Implementation status in this PR

| item | status |
|---|---|
| `lib/pipeline/naics-labels.ts` (150-code lookup, 83.9% cross-cert coverage) | ✅ shipped |
| `lib/pipeline/personalization.ts` (re-export shell) | ✅ shipped |
| `lib/pipeline/sync.ts` — `naics_label` added to custom variables | ✅ shipped |
| Instantly campaign custom-field registration (`naics_label`) | ❌ manual — Raphael, via dashboard |
| Instantly test send to verify `{{token\|fallback}}` bare-text fallback syntax | ❌ post-merge |
| HUBZone steps 1-3 copy update in Instantly | ❌ post-test-send |
| Lead load to campaign | ❌ deferred until all 4 cert copies approved |

---

## 6. Post-merge checklist

1. **Register `naics_label` as a custom field** on campaign `2cb25064-8d05-4966-9a57-90058f68241d` in the Instantly dashboard. No public API for this schema step on v2 — must be manual.
2. **Test send**: from a quiet mailbox, send Step 1 to a single seed lead with a known NAICS 541611 (should render "Management Consulting") and a second seed with a rare NAICS (should render the fallback "HUBZone"). Confirm both variants render correctly. Document in a follow-up comment.
3. **Copy update**: push Steps 1-3 into Instantly via API (or paste via dashboard). Do NOT activate the campaign yet.
4. **Next**: begin 8a draft using the same framework.

---

## 7. Known deferrals

- `capabilities_excerpt`, `years_in_business`, `year_established`, `keyword_first` custom variables — not shipped. Can revisit for a v3 after v2 has real send data and we know whether the simpler copy has any personalization gap worth filling.
- NAICS-table coverage expansion (beyond 150 codes → ~95%) — low priority; fallback chain handles the 16% miss cleanly.
