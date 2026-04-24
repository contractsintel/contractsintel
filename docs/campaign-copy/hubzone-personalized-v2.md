# HUBZone — Personalized v2 Draft

**Campaign**: `2cb25064-8d05-4966-9a57-90058f68241d` (BidsGov - Cold Outbound - HUBZone)
**Universe**: 3,785 NeverBounce-valid leads, source='dsbs', primary_cert='hubzone'
**Draft date**: 2026-04-24
**Status**: DRAFT — awaiting Raphael review before Instantly update
**Supersedes**: COLD-01 / COLD-02d / COLD-03 in `docs/email-system/03-email-copy.md`

---

## 1. Verified HUBZone stats (refreshed 2026-04-24)

Pulled against `public.opportunities` (365-day window, `set_aside_type ILIKE '%hubzone%'`):

| metric | value | n |
|---|---:|---:|
| HUBZone set-asides | 114 | — |
| DLA share | **65.8%** | 75 / 114 |
| DLA Maritime alone | **39.5%** | 45 / 114 |
| Top NAICS (opps) | 236220 Commercial Construction | 19 |
| NAICS-33 Manufacturing share (opps) | ~64% | 73 / 114 |
| NAICS-23 Construction share (opps) | ~26% | 30 / 114 |

**Structural insight**: HUBZone set-asides skew ~64% to manufacturing (NAICS 33) and DLA procurement. But **HUBZone firms** (our lead-side universe) skew the other way — ~32% professional services (NAICS 54), 24% construction (NAICS 23), only 10% manufacturing (NAICS 33). That gap is the hook.

**Honest caveat**: n=114 is thin. DLA-share is stable between Saturday's audit (64.7%) and today (65.8%); single bulk postings can swing it ±3pp. Use "about two-thirds" / "most" framings rather than precise %.

---

## 2. Lead-side enrichment coverage (3,785 HUBZone valids)

| field | populated | coverage |
|---|---:|---:|
| `first_name` | 3,785 | 100% |
| `company_name` | 3,785 | 100% |
| `naics_primary` | 3,785 | 100% |
| `year_established` | 3,785 | 100% |
| `capabilities_narrative` | 2,664 | 70.4% |
| `keywords` (populated) | 3,009 | 79.5% |

Copy must work for the 30% of leads without capabilities_narrative. Use narrative as an opener boost via conditional, not as a required token.

---

## 3. Merge-tag inventory

### A. Already wired in `toInstantlyLead` (lib/pipeline/sync.ts)

| Instantly token | source field | notes |
|---|---|---|
| `{{first_name}}` | `leads.first_name` | standard |
| `{{last_name}}` | `leads.last_name` | standard |
| `{{company_name}}` | `leads.company` | standard |
| `{{phone}}` | `leads.phone` | standard |
| `{{uei}}` | custom var | unused in copy, keep |
| `{{primary_naics}}` | `leads.naics_codes[0]` | existing 6-digit code |
| `{{cert_type}}` | `leads.primary_cert` | "hubzone" |
| `{{city}}` / `{{state}}` | custom vars | unused |

### B. NEW custom variables to add to `toInstantlyLead`

| Instantly token | source field | builder logic |
|---|---|---|
| `{{naics_label}}` | `leads.naics_primary` → lookup | map 6-digit → short human label; see §5 |
| `{{capabilities_excerpt}}` | `leads.capabilities_narrative` | first 60–80 chars, cut at word boundary; null-safe |
| `{{years_in_business}}` | `2026 - leads.year_established` | integer; null if year_established is null |
| `{{year_established}}` | `leads.year_established` | raw 4-digit; backup to years_in_business |
| `{{keyword_first}}` | `leads.keywords[0]` | first DSBS keyword; used as narrative fallback |

Instantly v2 fallback syntax: `{{token|"default"}}`. Confirmed in their API docs; we've used it elsewhere (not in this repo — verify before launch).

### C. Sender tokens (unchanged)

| token | value |
|---|---|
| `{{sender_first_name}}` | Raphael |

---

## 4. Proposed copy

Voice rules: direct, specific, non-corporate, reply-only, plain text. Each email names the firm once and references a lead-specific detail once.

---

### Step 1 (Day 0) — Observation + Question

**Replaces**: COLD-01 generic opener, which doesn't personalize beyond {{first_name}}+{{cert_type}}.

**Subject A**: quick question on {{naics_label|"your NAICS"}}
**Subject B**: HUBZone in {{naics_label|"your code"}}
**Preview**: Most HUBZone firms I talk to hear about set-asides after the window's already closed.

**Body**:
```
{{first_name}} —

Most HUBZone firms in {{naics_label|"your NAICS code"}} I talk to find out about relevant set-asides a week or two after the response window opened. They're registered for the right codes — they just never saw the solicitation in time.

Is that {{company_name}}'s situation, or do you have something in place for catching these early?

{{sender_first_name}}
```

**Personalization notes**:
- `{{naics_label}}` with fallback keeps the sentence readable when the NAICS lookup hasn't been built yet (ships as plain "your NAICS code" until §5 lands).
- Kept `{{company_name}}` in the ask line rather than the opener — specificity in the question feels less templated than in the greeting.
- No capabilities_narrative dependency — this email works for all 3,785 leads uniformly.

**CTA**: Reply only.

---

### Step 2 (Day 3) — Verified-Stat Hook + Compliance Story

**Replaces**: COLD-02d. Keeps the address-mismatch story (it's the product narrative and tests well) but replaces the generic opener with the verified DLA / manufacturing-skew hook and injects per-lead NAICS specificity.

**Subject A**: two-thirds of HUBZone set-asides go through DLA
**Subject B**: where HUBZone set-asides actually come from
**Preview**: 65% of HUBZone set-asides last year came from DLA — mostly manufacturing codes.

**Body**:
```
{{first_name}} —

Pulled the numbers on HUBZone set-asides the last 12 months. Out of 114 solicitations, 75 came from DLA — almost two-thirds — and the bulk of those were in manufacturing codes. DLA Maritime alone ran 45 of them.

Most HUBZone firms we talk to aren't in {{naics_label|"those codes"}}. They're in professional services or construction. That's a different set of competitions than where the volume is. Worth knowing which pool {{company_name}} is actually positioned for.

One other thing that comes up a lot on HUBZone: the principal-office address in SAM has to match the certification record exactly. When it drifts, some procurement systems silently exclude the firm from set-aside searches. No error, no notification.

Curious whether {{company_name}} has had your HUBZone address and SAM record cross-checked recently, and which bucket your NAICS codes are tracking — DLA manufacturing or something else.

{{sender_first_name}}
```

**Personalization notes**:
- Verified stat moved to subject and first paragraph — it's the real story.
- `{{naics_label}}` appears once, parenthetically; doesn't break the sentence if fallback fires.
- Kept the address-mismatch story because it's the bridge to the product.
- Single lead-specific hook (`naics_label`) — two would feel templated.

**CTA**: Reply only.

**Plain-text note**: No HTML. Fits on one laptop screen.

---

### Step 3 (Day 7) — Sample Match Report Offer (with capability cue)

**Replaces**: COLD-03. Adds `capabilities_excerpt` conditional — when we have DSBS narrative text, we mirror a phrase back; when we don't, it reads as a clean "here's what I'd pull" note.

**Subject A**: the actual matches in your codes
**Subject B**: HUBZone matches for {{company_name}}
**Preview**: I can pull every HUBZone set-aside in your NAICS over the last 30 days — scored by fit.

**Body**:
```
{{first_name}} —

Following up on HUBZone set-asides. I can pull every solicitation from the last 30 days that matches {{company_name}}'s NAICS codes and HUBZone status — DLA, Army, and the long tail — scored by how close a fit each one is for a {{years_in_business|"working"}}-year HUBZone firm working in {{capabilities_excerpt|"{{naics_label|\"your codes\"}}"}}.

Takes me a few minutes to run. Want me to send it over?

{{sender_first_name}}
```

**Personalization notes**:
- `{{years_in_business}}` median for HUBZone valids = 15 years. Saying "15-year HUBZone firm" in the sentence reads like someone who actually looked at the firm.
- Fallback chain: `capabilities_excerpt` → `naics_label` → literal "your codes". Graceful degradation.
- "DLA, Army, and the long tail" names the real top agencies from the verified audit — not fabricated.

**CTA**: Reply only — "just reply yes". The `handle-cold-reply` worker sends the actual report within 30 min of an affirmative reply.

---

### Step 4 — Permission to Close (unchanged)

Keep COLD-04 as-is. Personalization in a wind-down email reads weird.

### Step 5 — Case Closed (unchanged)

Keep COLD-05 as-is.

---

## 5. New infrastructure required before Instantly update

### A. Extend `toInstantlyLead` in `lib/pipeline/sync.ts`

Add to the `cv` custom-variables block:

```ts
putCV("naics_label",          naicsLabel(row.naics_primary));
putCV("capabilities_excerpt", excerpt(row.capabilities_narrative, 70));
putCV("year_established",     row.year_established);
putCV("years_in_business",    row.year_established ? 2026 - row.year_established : null);
putCV("keyword_first",        (row.keywords || [])[0]);
```

Helpers (new file `lib/pipeline/personalization.ts`):
- `excerpt(text, maxChars)` — trim, strip newlines, cut at last space before maxChars, strip trailing punctuation. Returns null if input is null/empty.
- `naicsLabel(code6)` — lookup against a static NAICS→short-label table. See §5.B.

### B. NAICS 6-digit → short human label table

Minimum-viable coverage for the HUBZone universe: the top ~40 NAICS codes that account for ~80% of the 3,785 leads. Full 1,056-code table is overkill for launch; a short table with a fallback to null (triggering the `"your codes"` text) is fine.

Concrete top-10 for HUBZone valids (preview; full table lands in `lib/pipeline/naics-labels.ts`):

| code | count | short label |
|---|---:|---|
| 541611 | ~160 | Management Consulting |
| 236220 | ~150 | Commercial Construction |
| 541330 | ~120 | Engineering |
| 561720 | ~90 | Janitorial |
| 238990 | ~75 | Specialty Trade Construction |
| … | | |

(Exact counts to be pulled when building the table; estimates from NAICS 54/23 skews above.)

### C. Instantly custom-field registration

Instantly requires custom variable names to be declared on the campaign before they resolve. Add these 5 to campaign `2cb25064-8d05-4966-9a57-90058f68241d`:

- `naics_label`
- `capabilities_excerpt`
- `year_established`
- `years_in_business`
- `keyword_first`

Manual action in Instantly dashboard (no public API for custom-variable schema on v2 campaigns — confirmed by searching their docs last month, re-verify before launch).

### D. Fallback-syntax verification

Before shipping, run a one-shot Instantly test send to verify `{{token|"default"}}` syntax actually substitutes when the custom variable is missing on the lead. If Instantly only resolves fallbacks when the variable is **present-but-null** (versus absent entirely), the copy needs defensive null values set explicitly in `putCV`. Document the result.

---

## 6. Risk register

| risk | likelihood | mitigation |
|---|---|---|
| Instantly `{{t\|"fallback"}}` syntax doesn't work as expected | medium | Test send before full campaign load |
| NAICS 6-digit → label table coverage < 80% | medium | Fallback chain degrades to "your codes"; leads with obscure NAICS still get a readable email |
| `capabilities_excerpt` truncates mid-acronym or mid-hyphenate | low | Excerpt helper cuts at word boundary; still possible to get a weird excerpt |
| Verified stat (65% DLA) drifts materially before May 4 | low | Re-run the audit SQL on May 3; if DLA share < 60%, soften to "most HUBZone set-asides" |
| 30% of leads lack capabilities_narrative → Step 3 falls back to generic | baseline | Designed-in |

---

## 7. Open questions for Raphael

1. **`years_in_business` framing**: "15-year HUBZone firm" reads fine at median. For firms founded post-2022 (small tail; ~4% of leads), it reads as "3-year HUBZone firm" which may feel too junior. Want a floor (clamp below 5yr → fallback to `"working"`)?
2. **`capabilities_excerpt` risk**: These are self-authored strings. Some are marketing slop ("best-in-class solutions for enterprise-scale transformation"). Mirroring them back in Step 3 can sound generic. Alternative: only include the excerpt when it contains a concrete noun (NAICS/sector word). Worth a regex guard, or ship as-is and iterate?
3. **Step 1 subject A/B**: the `{{naics_label}}` versions bank on the NAICS table landing in time. If not, do we ship plain `"quick question"` / `"how do you track these"` and defer personalized subjects to v3?
4. **Send this draft for HUBZone alone, or produce the 3 other drafts first** (8a / SDVOSB / WOSB-EDWOSB) so you can review all 4 in one pass?

---

## 8. Next steps on approval

1. Approve or edit this draft.
2. I implement §5.A/B (personalization.ts + naics-labels.ts) in `feat/personalization-v2` branch.
3. Instantly test send from a quiet mailbox to a seed lead; confirm fallback syntax + variable resolution.
4. Proceed to 8a draft using the same framework.
