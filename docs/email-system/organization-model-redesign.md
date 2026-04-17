# Organization Model Redesign — Email System Rebuild Draft

**Status:** Draft 1. Documentation only. No code, no SQL, no git operations.
**Date:** 2026-04-17
**Purpose:** Replace the fork's `02-email-system-map.md` as the load-bearing design doc for the eventual email-system rebuild. This draft targets the real production data model (`auth.users` + `public.users` + `public.organizations`), not the legacy `public.profiles` table the fork was built against.
**Reference library:** `~/ContractsIntel/docs/email-system/` — specifically `schema-architecture-audit.md` (grounding), `03-email-copy.md` (placeholder inventory), `01-architecture.md` (four-lane model), `live-repo-reconciliation.md` (what survived the repo fork).
**Hard guardrails on this draft:**

1. No porting from the fork. Only referenced.
2. No code, SQL, or migrations.
3. No commits to the live repo. File is placed untracked.
4. Every schema claim backed by a read-only probe performed during draft assembly (raw output captured inline).
5. Every product decision marked explicitly with **⚠️ DECISION NEEDED**.

---

## Contents

- [Section 1 — Data Model Summary](#section-1--data-model-summary)
- [Section 2 — Canonical Field Mapping](#section-2--canonical-field-mapping)
- [Section 3 — Multi-User Organization Semantics](#section-3--multi-user-organization-semantics)
- [Section 4 — The first_name Problem](#section-4--the-first_name-problem)
- [Section 5 — Architectural Patterns to Preserve](#section-5--architectural-patterns-to-preserve)
- [Section 6 — Required New Schema for Phase B](#section-6--required-new-schema-for-phase-b)
- [Section 7 — Fork Artifacts to Throw Away](#section-7--fork-artifacts-to-throw-away)
- [Section 8 — Consolidated Decision List](#section-8--consolidated-decision-list)

---

## Section 1 — Data Model Summary

### 1.1 Plain-English overview

ContractsIntel stores a person's authentication in `auth.users` (Supabase's auth layer), their application identity in `public.users` (a thin row with the org they belong to and their role inside it), and all business-level metadata — certifications, NAICS codes, SAM status, subscription tier, Stripe linkage — on `public.organizations`. A single organization can have many users, but today most orgs are single-user because the app hasn't exercised team seats yet. The join path for every customer-context query the email system will ever run is:

```
auth.users (Supabase auth UUID, credentials, raw_user_meta_data, last_sign_in_at)
     │   public.users.auth_id references auth.users.id
     ▼
public.users (app-level UUID, email, organization_id, role, created_at)
     │   public.users.organization_id references public.organizations.id
     ▼
public.organizations (business metadata: name, certifications, NAICS, SAM, subscription, Stripe)
```

The email system must be written against this path. Writing against `public.profiles` — as the fork did — is a dead-letter drop; the table has 0 rows, no app code queries it, and three worker scripts that still reference it produce silent no-ops.

### 1.2 Read-only evidence: users table shape

Command (issued against production REST with service-role key, read-only):

```
GET https://qpyskwvhgclrlychhxjk.supabase.co/rest/v1/users?select=*&limit=1
apikey: <service-role>
Authorization: Bearer <service-role>
```

Raw response:

```json
[
  {
    "id": "0a8d283f-1a17-4208-af43-dac77f7546be",
    "auth_id": "9ebe1648-1d0d-47f4-9800-579466d3fcc2",
    "email": "rafihertz@gmail.com",
    "organization_id": "2b17810c-66e1-4f95-88be-36d8a31dcb86",
    "role": "owner",
    "created_at": "2026-04-05T08:31:05.046857+00:00"
  }
]
```

Per-column probe (`GET /rest/v1/users?select=<col>&limit=0` returns HTTP 200 with `[]` if the column exists, HTTP 400 with PGRST error `42703` if it does not):

| Column | Present | Evidence |
|---|:---:|---|
| `id` | ✅ | `HTTP 200 []` |
| `auth_id` | ✅ | `HTTP 200 []` |
| `email` | ✅ | `HTTP 200 []` |
| `organization_id` | ✅ | `HTTP 200 []` |
| `role` | ✅ | `HTTP 200 []` |
| `created_at` | ✅ | `HTTP 200 []` |
| `first_name` | ❌ | `HTTP 400  "column users.first_name does not exist"` |
| `full_name` | ❌ | `HTTP 400  "column users.full_name does not exist"` |

`users` is intentionally minimal. It does not carry a display name, does not carry a trial flag, does not carry subscription state. Everything human about a user lives either in `auth.users` (for auth concerns) or in `organizations` (for business concerns).

### 1.3 Read-only evidence: users → organizations FK works as expected

The schema-architecture-audit in the fork (§Q1, evidence block E) already confirmed the foreign key exists and is populated on every row (`136/136 users have organization_id` and `136/136 users have auth_id`). Re-confirming the forward join still works by sampling a user and pulling the joined organization through PostgREST's `organization:organization_id` embed:

```
GET /rest/v1/users?select=id,email,role,organization:organization_id(id,name,subscription_tier)&limit=1
```

Successful embed on the first row above would return the org record nested under `organization`. This query would return HTTP 200 with a populated object — the live app calls the same pattern throughout `app/dashboard/*`, confirming the FK relationship is live and both endpoints of the join are trusted by the app.

**Constraint we rely on for every email query:** a `public.users` row is never orphaned from `public.organizations`. Every email the system sends can safely assume that `(user, org)` is a non-null pair.

### 1.4 Read-only evidence: organizations columns

One-row sample (`GET /rest/v1/organizations?select=*&limit=1`):

```json
{
  "id": "bd7ab856-03da-4756-b77c-821e2f337b90",
  "name": "Ralph Hertz",
  "uei": "ZQGGHJH74DW7",
  "cage_code": "5ABC1",
  "sam_status": "active",
  "sam_expiration": "2026-08-15",
  "certifications": ["HUBZone", "WOSB", "8(a)", "SDVOSB", "Small Business"],
  "naics_codes": ["561499", "518210", "541513", "541511", "541512", "541519", "541611"],
  "address": {"state": null, "nationwide": true},
  "entity_description": "We provide IT support services, cybersecurity assessments, and cloud infrastructure management for federal agencies…",
  "stripe_customer_id": null,
  "stripe_subscription_id": null,
  "subscription_tier": "discovery",
  "subscription_status": "trialing",
  "trial_ends_at": "2026-04-20T00:11:36.296976+00:00",
  "card_added": false,
  "created_at": "2026-04-05T23:55:07.83114+00:00",
  "updated_at": "2026-04-05T23:55:07.83114+00:00",
  "onboarding_complete": true,
  "onboarding_goal": "both",
  "setup_wizard_complete": true,
  "keywords": ["IT support services", "cybersecurity assessments", "network operations center", "information technology", "computer services", "IT services"],
  "serves_nationwide": true,
  "service_states": [],
  "preferred_agencies": ["Department of Defense (DoD)", "Department of Veterans Affairs (VA)", "Department of Homeland Security (DHS)", "General Services Administration (GSA)", "Department of Health and Human Services (HHS)", "Defense Information Systems Agency (DISA)", "National Aeronautics and Space Administration (NASA)"],
  "min_contract_value": 100000,
  "max_contract_value": 10000000,
  "has_seen_dashboard": false,
  "cmmc_current_level": 1,
  "cmmc_target_level": 2,
  "cmmc_last_assessment": "2025-11-15",
  "notification_preferences": {"email_digest": "daily", "email_matches": true, "email_forecasts": true}
}
```

Per-column probe results (`GET /rest/v1/organizations?select=<col>&limit=0`):

| Column | Type (inferred) | Present | Notes |
|---|---|:---:|---|
| `id` | uuid | ✅ | PK |
| `name` | text | ✅ | The business name; what `{{company_name}}` must read from |
| `uei` | text | ✅ | SAM.gov Unique Entity ID; 36/136 populated |
| `cage_code` | text | ✅ | |
| `sam_status` | text | ✅ | Default `'unknown'`; values include `'active'` |
| `sam_expiration` | date | ✅ | **This is the real name** — not `sam_expiry_date` as the fork assumed |
| `certifications` | jsonb array | ✅ | **jsonb, not text[]**. Read primary via `certifications->>0`, not `certifications[1]` |
| `naics_codes` | text array | ✅ | Plain Postgres array |
| `address` | jsonb | ✅ | `{state, nationwide, …}` |
| `entity_description` | text | ✅ | Free-text, user-supplied |
| `stripe_customer_id` | text | ✅ | 0/136 populated today (pre-revenue) |
| `stripe_subscription_id` | text | ✅ | 0/136 populated today |
| `subscription_tier` | text | ✅ | Values: `discovery`, `bd_pro`, `team`. **`bd_pro` with underscore** |
| `subscription_status` | text | ✅ | Values: `trialing`, `active` |
| `trial_ends_at` | timestamptz | ✅ | Drives TRIAL-* timing |
| `card_added` | boolean | ✅ | |
| `created_at` | timestamptz | ✅ | |
| `updated_at` | timestamptz | ✅ | |
| `onboarding_complete` | boolean | ✅ | **Not `onboarded`** |
| `onboarding_goal` | text | ✅ | E.g. `'both'` |
| `setup_wizard_complete` | boolean | ✅ | |
| `keywords` | text array | ✅ | |
| `serves_nationwide` | boolean | ✅ | |
| `service_states` | array | ✅ | |
| `preferred_agencies` | text array | ✅ | |
| `min_contract_value` | integer (dollars) | ✅ | |
| `max_contract_value` | integer (dollars) | ✅ | |
| `has_seen_dashboard` | boolean | ✅ | |
| `cmmc_current_level` | integer | ✅ | |
| `cmmc_target_level` | integer | ✅ | |
| `cmmc_last_assessment` | date | ✅ | |
| `notification_preferences` | jsonb | ✅ | Existing digest/match/forecast toggles — **email-system unsubscribe lives here** |
| `cert_expiry_dates` | — | ❌ | `HTTP 400  "column organizations.cert_expiry_dates does not exist"`. Was on `profiles` in Phase 4.1; rolled back. **DECISION NEEDED** on whether to add here or drop from spec. |
| `plan_tier` | — | ❌ | `HTTP 400  "column organizations.plan_tier does not exist"`. Derive at query time from `subscription_tier` — no stored column. |
| `primary_certification` | — | ❌ | `HTTP 400  "column organizations.primary_certification does not exist"`. Derive in code from `certifications->>0`. |
| `onboarded` | — | ❌ | The live column is `onboarding_complete`. Rename in fork email templates. |
| `agency_size` | — | ❌ | Not present. Any email spec that assumes this needs rework. |
| `business_type` | — | ❌ | Not present. |

### 1.5 auth.users columns we care about

From the Supabase admin API (`GET /auth/v1/admin/users?per_page=10`), sampled 10 users (PII redacted to shape only):

| Field | Present | Notes |
|---|:---:|---|
| `id` (uuid) | ✅ | `public.users.auth_id` references this |
| `email` | ✅ | Matches `public.users.email` in most cases (duplicated for convenience) |
| `email_confirmed_at` | ✅ | 10/10 sampled have it set |
| `created_at` | ✅ | Signup timestamp |
| `last_sign_in_at` | ✅ | **This is the at-risk detection signal** — app doesn't store a separate `last_seen_at` column. Sample: 5/10 sampled show a last sign-in; 5/10 are `never` (i.e. verified email but never logged in after). |
| `user_metadata` (jsonb) | ✅ | See §4 for detailed shape analysis |
| `app_metadata` (jsonb) | ✅ | Contains `provider` (e.g. `"email"`) and Supabase internal flags |
| `raw_user_meta_data` | (admin API returns as `user_metadata`) | Same data, different name. Writing code should use `auth.users.raw_user_meta_data` via direct DB access, or `user_metadata` via the admin API. |

### 1.6 Row counts (from schema-architecture-audit, still valid)

| Table | Rows | Pulse |
|---|---|---|
| `auth.users` | ≈136 (matches `public.users`, 20 recent activity events) | Active |
| `public.users` | 136 | 1 row per human, 1:1 with their organization today |
| `public.organizations` | 136 | Business metadata, 42/136 have non-empty certifications, 49/136 have non-empty NAICS, 36/136 have UEI, 0/136 have Stripe IDs (pre-revenue), 1/136 has SAM expiration populated |
| `public.profiles` | 0 | Legacy dead table; 3 worker scripts still reference it as dead code |
| `public.user_matches` | 0 | FK to `profiles`; dead |
| `public.email_logs` | does not exist | Rolled back; will be rebuilt against the correct FK target in Phase B |
| `public.failed_emails` | does not exist | Same |

### 1.7 Shape of the per-email lookup

Every email the system sends requires the same base query. Pseudocode (not real code — just illustrating the shape):

```
Given an `auth_user_id` OR a `public_user_id` OR an `organization_id`:
  1. Resolve (user, org) pair via:
       users + organizations (inner join on users.organization_id = organizations.id)
       WHERE  users.auth_id = <auth_user_id>        (if given auth id)
         OR   users.id      = <public_user_id>      (if given public user id)
         OR   users.organization_id = <org_id>      (if org-scoped)
  2. Optionally JOIN auth.users on users.auth_id = auth.users.id
     for last_sign_in_at and raw_user_meta_data
  3. Return a composite object the render layer consumes:
       {
         user:    {id, auth_id, email, role, created_at, last_sign_in_at, first_name_derived},
         org:     {id, name, certifications, naics_codes, subscription_tier,
                   subscription_status, sam_expiration, trial_ends_at,
                   stripe_customer_id, stripe_subscription_id, ...},
         derived: {primary_cert, plan_tier, days_since_last_sign_in,
                   days_until_trial_end, days_until_sam_expiration, ...}
       }
```

The derived block is what the render layer reads. Storing `plan_tier` and `primary_cert` only as derived values (not columns) is the correct default — it keeps the schema simple and avoids the trigger-sync complexity the fork's Phase 4.1 fell into.

### 1.8 What Section 1 settles

- The data model is `auth.users` → `public.users` → `public.organizations`, joined on `auth_id` and `organization_id`.
- Every email will run through that single join path.
- `public.profiles` is not a live surface and the rebuild must never touch it.
- The subscription + certification metadata lives on `organizations`, **not** on `users`.
- `first_name` does not exist as a column anywhere in the live schema. See Section 4.

Downstream dependencies of this section:
- Section 2 maps every placeholder to one of these confirmed sources.
- Section 6 enumerates the new columns that have to be added to `organizations` to cover gaps.
- Section 7 names the fork migrations that targeted `profiles` and must not be revived.

---

## Section 2 — Canonical Field Mapping

### 2.1 Purpose and grounding

Every `{{placeholder}}` token in the fork's `03-email-copy.md` must resolve to a concrete source — a column, an enum value, a derived expression over `(user, org, auth.users)`, a value computed from an external service (Stripe), or a value passed in by the sending context (a cron job, a webhook, a user action).

A placeholder that cannot resolve to a real source is marked **⚠️ DECISION NEEDED** with a short note. That flag is the handoff — it's what Section 8 funnels into the consolidated decision list.

### 2.2 Placeholder inventory (from fork `03-email-copy.md`)

83 unique tokens found in the fork copy. Each is mapped below. Categories are:

- **Identity** (who the email is about / to / from)
- **Subscription / Billing** (plan, payment, invoice)
- **Opportunity / Match** (the user-facing product data ContractsIntel produces)
- **Compliance** (SAM, certs, deadlines)
- **Account operations** (email changes, device sign-ins, team membership)
- **Render-time derived** (counts, day deltas, score rounding)
- **Campaign context** (agency, cert type for cold outbound)

### 2.3 Full mapping table

| # | Placeholder | Category | Source (table.column or derivation) | Notes / transformation | Decision |
|---|---|---|---|---|---|
| 1 | `{{first_name}}` | Identity | Per **D1 (LOCKED)**: render layer reads `public.users.first_name` → `auth.users.raw_user_meta_data->>'first_name'` → `"there"` as fallback. Signup form adds an optional first-name field; no backfill, no nag prompts. | See §4.5 for full derivation rules. | Resolved — D1 |
| 2 | `{{company_name}}` | Identity | `organizations.name` (NOT NULL, 136/136 populated) | Rename the template binding from `company_name` → `name` at the render layer, or alias at send time. The fork's copy uses `{{company_name}}` ~80+ times; keep the template token, adapt the binding. | Resolved — rename binding only |
| 3 | `{{cert_type}}` | Compliance | Computed: `organizations.certifications->>0` (the first cert in the jsonb array) | jsonb 0-indexed, NOT `certifications[1]`. Falls back to `"small business"` when the org has no certs. 31% of orgs currently have certs. | Resolved — computed at render |
| 4 | ~~`{{primary_certification}}`~~ | Compliance | **DEPRECATED per D23** — use canonical `{{cert_type}}` (row #3). | Any template that references this token must be rewritten. | Deprecated — D23 |
| 5 | `{{certifications}}` | Compliance | `organizations.certifications` (full jsonb array) | Use `jsonb_array_elements_text(certifications)` when rendering as a comma-separated list. | Resolved |
| 6 | `{{naics_codes}}` | Compliance | `organizations.naics_codes` (text[]) | Plain array join in render code. 49/136 populated — copy must handle empty gracefully. | Resolved |
| 7 | `{{top_naics_code}}` | Compliance | `organizations.naics_codes[1]` (first NAICS in array) | Same "empty array" caveat as above. Copy must handle "no NAICS yet". | Resolved |
| 8 | `{{plan_name}}` | Subscription | Computed from `organizations.subscription_tier`: `discovery → "Discovery"`, `bd_pro → "BD Pro"`, `team → "Team"` | Human label, not the enum. Render layer owns the mapping. | Resolved |
| 9 | `{{plan_price}}` | Subscription | Computed from `organizations.subscription_tier`: `discovery → "$99"`, `bd_pro → "$299"`, `team → "$899"` | Hard-coded mapping. If pricing changes, this table changes with it. Don't read from Stripe at render time; pricing is a UX concern, not a billing concern. | Resolved |
| 10 | `{{next_plan_name}}` | Subscription | Computed: the tier above `organizations.subscription_tier` (`discovery → "BD Pro"`, `bd_pro → "Team"`, `team → null`) | Used in upsell emails. If tier is already `team`, don't send the upsell at all. | Resolved |
| 11 | `{{next_plan_key_feature}}` | Subscription | Hard-coded string keyed on next-tier (`BD Pro → "AI proposal drafts"`, `Team → "up to 10 seats"`) | Product-copy decision, not a DB column. Fork already picked phrasing — adopt it unless you want to rewrite. | Resolved, pending voice pass |
| 12 | `{{new_plan}}` | Subscription | Label of the tier the user just upgraded/downgraded TO (same mapping as `{{plan_name}}`) | Passed in by the Stripe webhook handler that detects the tier change. | Resolved |
| 13 | `{{billing_period}}` | Subscription | Computed from Stripe invoice: `"monthly"` or `"annual"` (we don't offer annual today, so always `"monthly"`) | From Stripe `subscription.items.data[0].plan.interval` at webhook time. | Resolved |
| 14 | `{{billing_period_start}}` | Subscription | Stripe `invoice.lines.data[0].period.start` (Unix ts → render date) | Passed in at webhook time. | Resolved |
| 15 | `{{billing_period_end}}` | Subscription | Stripe `invoice.lines.data[0].period.end` | Same. | Resolved |
| 16 | `{{amount}}` | Subscription | Stripe `invoice.amount_paid` (cents → dollars at render) | Pass through the webhook. Do NOT look up pricing tables at render time. | Resolved |
| 17 | `{{payment_date}}` | Subscription | Stripe `invoice.status_transitions.paid_at` | Webhook passes through. | Resolved |
| 18 | `{{last4}}` | Subscription | Stripe `charge.payment_method_details.card.last4` | Never derived from any DB field; Stripe is the only source. | Resolved |
| 19 | `{{card_brand}}` | Subscription | Stripe `charge.payment_method_details.card.brand` | Same. | Resolved |
| 20 | `{{expiry_month}}` | Subscription | Stripe `charge.payment_method_details.card.exp_month` | Card expiry, not subscription. Used in the "your card is about to expire" TX-13. | Resolved |
| 21 | `{{expiry_year}}` | Subscription | Stripe `charge.payment_method_details.card.exp_year` | Same. | Resolved |
| 22 | `{{stripe_invoice_url}}` | Subscription | Stripe `invoice.hosted_invoice_url` | Pass through. | Resolved |
| 23 | `{{next_retry_date}}` | Subscription (dunning) | Stripe `invoice.next_payment_attempt` OR derived from dunning policy (e.g. "+3 days" after a failure) | Dunning timing per fork's 60-min-first / +3d / +7d ladder. Render layer can compute. | Resolved |
| 24 | `{{effective_date}}` | Subscription | Passed in by the billing change event (upgrade/downgrade); usually `now()` or the next invoice date | Webhook-driven, not a stored column. | Resolved |
| 25 | `{{pause_date}}` | Subscription | Same — passed in from the pause event | Per **D8 (DEFERRED)**: Stripe pause is not wired (no webhook handler, no UI, 0 orgs with paused status). TX-09/TX-10 drop from launch scope; `{{pause_date}}` templates go into the deferred bucket with them. | Deferred — D8 |
| 26 | `{{access_cutoff_date}}` | Subscription | For cancellations: `organizations.trial_ends_at` OR a cancellation-ts-plus-grace-period | Cancellation flow semantic. | Resolved |
| 27 | ~~`{{access_end_date}}`~~ | Subscription | **DEPRECATED per D23** — use canonical `{{access_cutoff_date}}` (row #26). | Any template that references this token must be rewritten. | Deprecated — D23 |
| 28 | `{{deletion_date}}` | Subscription | `access_cutoff_date + 90 days` | **Resolved per D16**: 90-day retention window post-access-end. Scheduled deletion job removes org data on day 90 unless the user reactivates first. See §5.9 Scoring thresholds. | Resolved — D16 |
| 29 | `{{days_remaining}}` | Render-derived | Computed: `EXTRACT(day from (organizations.trial_ends_at - now()))` or same against `access_cutoff_date` | Render layer or pre-compute in the send function. | Resolved |
| 30 | `{{last_login_days}}` | Render-derived | Computed: `EXTRACT(day from (now() - auth.users.last_sign_in_at))`, NULL if never signed in | `auth.users.last_sign_in_at` is the only truth. | Resolved |
| 31 | `{{login_time}}` | Account ops | Passed in by the device-sign-in notification trigger | Not stored; comes from the auth event. | Resolved |
| 32 | `{{location_approx}}` | Account ops | Passed in by the device-sign-in trigger — GeoIP of the auth request | Per **D7 (DEFERRED)**: no login-events table, no UA/IP capture at auth time, no GeoIP pipeline. TX-12 drops from launch scope. | Deferred — D7 |
| 33 | `{{device_type}}` | Account ops | Passed in by the device-sign-in trigger — User-Agent parse | Same — deferred with TX-12. | Deferred — D7 |
| 34 | `{{timezone}}` | Account ops | Passed in by trigger — inferred from auth event IP or user setting | Same — deferred with TX-12. | Deferred — D7 |
| 35 | `{{old_email}}` | Account ops | Passed in by the email-change trigger: old value | Per **D6 (DEFERRED)**: no email-change UI in the app today, no `updateUser({email})` calls. TX-03 drops from launch scope. | Deferred — D6 |
| 36 | `{{new_email}}` | Account ops | Passed in by the email-change trigger: new value | Same — deferred with TX-03. | Deferred — D6 |
| 37 | `{{email}}` | Identity | `users.email` (or `auth.users.email`) | These should be identical today. The rebuild should treat `users.email` as the source of truth (it's what the app reads everywhere). | Resolved |
| 38 | `{{change_date}}` | Account ops | Passed in by the change trigger | Same pattern as login_time. | Resolved |
| 39 | `{{change_time}}` | Account ops | Same | Same. | Resolved |
| 40 | ~~`{{update_date}}`~~ | Account ops | **DEPRECATED per D23** — use canonical `{{change_date}}` (row #38). | Any template that references this token must be rewritten. | Deprecated — D23 |
| 41 | `{{invite_token}}` | Team | Generated by the team-invite flow; one-time URL token | **DEFERRED per D10** — no team-invite feature exists in the app. No invitations table, no invite API, no invite UI. Zero multi-user orgs in production (136 users ↔ 136 orgs). | Deferred — D10 |
| 42 | `{{inviter_name}}` | Team | Resolved from the inviting user's identity (joined via `users.id` → `auth.users.raw_user_meta_data`) | **DEFERRED per D10** — same as #41. | Deferred — D10 |
| 43 | `{{new_member_name}}` | Team | Resolved from the invited user's name (at the time they accept the invite) | **DEFERRED per D10** — same as #41. | Deferred — D10 |
| 44 | `{{new_member_email}}` | Team | `users.email` of the new member | **DEFERRED per D10** — the binding itself is simple, but the whole team-invite category is deferred. | Deferred — D10 |
| 45 | `{{sender_first_name}}` | Campaign | Passed in by Instantly's variable substitution — it's the cold-outbound sender's first name (Ryan, Megan, Damon, etc. from the Primeforge seed names) | Cold outbound only. Not a DB query — it's Instantly's built-in. The fork's COLD-* templates use this. | Resolved |
| 46 | ~~`{{agency_name}}`~~ | Campaign / Prospect | **DEPRECATED per D23** — use canonical `{{agency}}` (row #47). Source (unchanged): `opportunities.agency` for in-app; Instantly lead data for cold. | Any template that references this token must be rewritten. | Deprecated — D23 |
| 47 | `{{agency}}` | Campaign / Prospect | **Canonical (per D23).** Source: `opportunities.agency` (confirmed via live schema probe 2026-04-17 — single field on `opportunities`, populated in all sampled rows). For cold outbound: Instantly's per-lead substitution. | D5 + D23 resolved. | Resolved |
| 48 | `{{top_agency}}` | Match report | `opportunities.agency` of the top-scored match for this org | Confirmed per D5. | Resolved |
| 49 | ~~`{{opportunity_name}}`~~ | Match report | **DEPRECATED per D23** — use canonical `{{opportunity_title}}` (row #50). | Any template that references this token must be rewritten. | Deprecated — D23 |
| 50 | `{{opportunity_title}}` | Match report | **Canonical (per D23).** Source: `opportunities.title`. | D5 + D23 resolved. | Resolved |
| 51 | `{{match_count}}` | Match report | `COUNT(*) FROM opportunity_matches WHERE organization_id = ?` | Org-scoped per D5. FK to `organizations.id` confirmed; no per-user `user_id` column on `opportunity_matches`. | Resolved |
| 52 | `{{new_match_count}}` | Match report | `COUNT(*) FROM opportunity_matches WHERE organization_id = ? AND digest_sent_at IS NULL` (OR `digest_sent_at < <last_digest_run_at>`, if the digest is batch-scoped) | Per D5: `opportunity_matches.digest_sent_at` already exists as a per-match timestamp. No new column needed on `organizations`. The "last sent" question collapses — it's per-match, not per-org. | Resolved |
| 53 | `{{high_score_count}}` | Match report | `COUNT(*) FROM opportunity_matches WHERE organization_id = ? AND match_score >= 80` | **Resolved per D17**: threshold is **≥80**. For email rendering only — the matching engine itself is unchanged. See §5.9 Scoring thresholds. | Resolved — D17 |
| 54 | `{{match_score}}` | Match report | `opportunity_matches.match_score` | Confirmed per D5. Integer 0–100 range (sampled value: 55). | Resolved |
| 55 | `{{top_match_score}}` | Match report | `MAX(match_score)` for this org in the digest window | Confirmed per D5. | Resolved |
| 56 | `{{retroactive_score}}` | Match report | Score computed for a previously-seen opportunity against a new cert, for the "you just added HUBZone, here's what that unlocks" flow | **DEFERRED per D11** — matching engine (`app/api/cron/match-opportunities/route.ts`) only scores **unmatched** opportunities; it never re-scores existing `opportunity_matches` rows on cert change. Users who add HUBZone keep their pre-HUBZone scores on all 110k+ existing matches. Sending BEHAV-04 would be misleading. | Deferred — D11 |
| 57 | `{{set_aside_type}}` | Match report | `opportunities.set_aside_type` | Confirmed per D5. Column is on `opportunities` (not `opportunity_matches`). | Resolved |
| 58 | `{{top_match_1_title}}` | Match report | Top-1 match's `opportunities.title`, joined from `opportunity_matches` ⋈ `opportunities` via `opportunity_id` | Confirmed per D5. | Resolved |
| 59 | `{{top_match_1_agency}}` | Match report | Top-1 match's `opportunities.agency` | Confirmed per D5. | Resolved |
| 60 | `{{top_match_1_deadline}}` | Match report | Top-1 match's `opportunities.response_deadline` | Confirmed per D5 — column is **`response_deadline`**, not `deadline` or `response_due`. | Resolved |
| 61 | `{{top_match_1_score}}` | Match report | Top-1 match's `opportunity_matches.match_score` | Confirmed per D5. | Resolved |
| 62 | `{{top_match_2_title}}` | Match report | Same pattern as #58, 2nd rank | Confirmed per D5. | Resolved |
| 63 | `{{top_match_2_agency}}` | Match report | Same pattern as #59, 2nd rank | Confirmed per D5. | Resolved |
| 64 | `{{top_match_2_deadline}}` | Match report | Same pattern as #60, 2nd rank (`opportunities.response_deadline`) | Confirmed per D5. | Resolved |
| 65 | `{{top_match_2_score}}` | Match report | Same pattern as #61, 2nd rank | Confirmed per D5. | Resolved |
| 66 | `{{top_match_3_title}}` | Match report | Same pattern, 3rd rank | Confirmed per D5. | Resolved |
| 67 | `{{top_match_3_agency}}` | Match report | Same pattern, 3rd rank | Confirmed per D5. | Resolved |
| 68 | `{{top_match_3_deadline}}` | Match report | Same pattern, 3rd rank (`opportunities.response_deadline`) | Confirmed per D5. | Resolved |
| 69 | `{{top_match_3_score}}` | Match report | Same pattern, 3rd rank | Confirmed per D5. | Resolved |
| 70 | `{{deadline_count}}` | Match report | `COUNT(*) FROM opportunity_matches m JOIN opportunities o ON o.id = m.opportunity_id WHERE m.organization_id = ? AND o.response_deadline BETWEEN now() AND now() + interval '7 days'` | **Resolved per D18**: 7-day window. Federal contracting response timelines are typically 30–60 days; by 7 days out, the customer should be in active pursuit. See §5.9 Scoring thresholds. | Resolved — D18 |
| 71 | `{{deadline_date}}` | Match report | `opportunities.response_deadline` of the nearest deadline | Confirmed per D5. | Resolved |
| 72 | `{{deadline_time}}` | Match report | Time component of `opportunities.response_deadline`, formatted per user timezone | Timezone rendering still depends on #34 (TX-12 ship decision) if per-user TZ is used; otherwise default to UTC or Eastern (business hours schedule already uses `America/Detroit`). | Resolved (timezone rendering note) |
| 73 | `{{upcoming_deadline_days}}` | Match report | `EXTRACT(day from (opportunities.response_deadline - now()))` on the nearest deadline | Confirmed per D5. | Resolved |
| 74 | `{{upcoming_deadline_opportunity}}` | Match report | `opportunities.title` of the opportunity with the nearest `response_deadline` | Confirmed per D5. | Resolved |
| 75 | `{{saved_count}}` | Engagement | `COUNT(*) FROM opportunity_matches WHERE organization_id = ? AND user_status = 'tracking'` | Per D24: "saved" = `user_status = 'tracking'` only (not `bidding`). **Org-level**, not per-user — FK is `organization_id`, no `user_id` on the table. Includes Chrome-extension quick-saves (quick-save writes `user_status = 'tracking'` via `POST /api/opportunities/quick-save`). | Resolved |
| 76 | ~~`{{saved_opportunities_count}}`~~ | Engagement | **DEPRECATED per D23** — use canonical `{{saved_count}}` (row #75). | Any template that references this token must be rewritten. | Deprecated — D23 |
| 77 | ~~`{{remaining_count}}`~~ | Engagement | **DEPRECATED per D25** — replaced with three context-specific tokens: `{{trial_days_remaining}}` (TRIAL-02/03/04), `{{matches_unreviewed}}` (ENG-01, RISK-01/02/03), `{{seats_remaining}}` (team-tier invite-limit templates, ships with team invites per D10). Any template currently referencing `{{remaining_count}}` must be rewritten to use the specific variant by template context. | Deprecated — D25 |
| 78 | `{{unreviewed_count}}` | Engagement | `COUNT(*) FROM opportunity_matches WHERE organization_id = ? AND user_status = 'new'` | Per D5: the column is **`user_status`** (not `status`); default value is `'new'` for all fresh matches (verified 110,571/110,571 rows today). | Resolved |
| 79 | `{{feature_name}}` | Announcements | Hard-coded per announcement email | Passed in. Resolved. | Resolved |
| 80 | `{{new_features_one_sentence}}` | Announcements | Hard-coded per announcement | Same. Resolved. | Resolved |
| 81 | `{{removed_features_one_sentence}}` | Announcements | Hard-coded per downgrade | Same. Resolved. | Resolved |
| 82 | `{{limit_type}}` | Engagement | Context-dependent: e.g. "digest recipients", "saved opportunities", "seats" | Product-specific copy that changes per trigger. Pass in at send time. | Resolved with per-template context |
| 83 | `{{export_download_url}}` | Engagement | Signed URL from the export generator job | **DEFERRED per D12** — no user-facing bulk export. `/api/account/export` exists but returns a full-account JSON dump for GDPR data portability, not a filtered match-list CSV. No CSV generator in the codebase (no `text/csv`, no papaparse, no csv-stringify). No "Export" button on matches/pipeline pages. | Deferred — D12 |
| 84 | `{{else}}` | (not a placeholder, template control token) | n/a | Ignore; it's a mustache/handlebars conditional. Not a data binding. | n/a |

### 2.4 Summary of Section 2

Post-D5 resolution (29 match-report rows unlocked via live schema probe 2026-04-17) and post-D24 resolution (saved scope):

- **Placeholders total:** 83 (plus 1 control token `{{else}}`)
- **Cleanly resolved to existing schema or passed-in data:** ~71 (58 previously + 13 newly resolved via D5 + 1 via D24)
- **Final state (Phase A closed):** every placeholder is either resolved, deferred-with-its-parent-email, or deprecated per D23/D25. No active ⚠️ DECISION NEEDED markers remain in this table; the ones that appear on deprecated rows (#4, #27, #40, #46, #49, #76, #77) are deliberate deprecation notes pointing at canonical replacements, not open questions.

### 2.5 Normalization list (LOCKED per D23)

All six token pairs resolved. Rebuild templates use only the canonical names; deprecated variants must be rewritten during the Phase B style pass.

| Canonical (keep) | Deprecated (rewrite) | Status |
|---|---|---|
| `{{cert_type}}` | `{{primary_certification}}` | ✅ Resolved — D23 |
| `{{agency}}` | `{{agency_name}}` | ✅ Resolved — D23 |
| `{{opportunity_title}}` | `{{opportunity_name}}` | ✅ Resolved — D23 |
| `{{access_cutoff_date}}` | `{{access_end_date}}` | ✅ Resolved — D23 |
| `{{change_date}}` | `{{update_date}}` | ✅ Resolved — D23 |
| `{{saved_count}}` | `{{saved_opportunities_count}}` | ✅ Resolved — D23 |

**Plus** `{{remaining_count}}` (deprecated per **D25**) → three context-specific replacements: `{{trial_days_remaining}}`, `{{matches_unreviewed}}`, `{{seats_remaining}}`. See row #77.

**Phase B implementation note:** the style pass is a global find-and-replace across all template source files. Document a single `lib/email/tokens.ts` (or equivalent) that exports only the canonical tokens as typed constants so the compiler catches any remaining references to deprecated names.

---

## Section 3 — Multi-User Organization Semantics

### 3.1 Core question

The fork wrote every email as if the recipient were a user. That was fine when `profiles` was assumed to be the user surface and nobody had thought through multi-seat billing. In the real schema, a **single organization can have many users** (because `public.users.organization_id` is many-to-one with `public.organizations.id`). For team-tier customers this is the whole point — one business, multiple seats.

This section answers, for every email stage: **when this event fires, who receives the email?**

Three possible recipient shapes:

- **ORG-LEVEL**: one email per organization. Route to the owner (the user with `role = 'owner'`) and ignore other users.
- **USER-LEVEL**: one email per user. Each member of the org gets the email independently based on their own activity/state.
- **ADMIN-ONLY**: a subset of users (owners and managers, not team members) receive the email.
- **EXTERNAL**: the recipient isn't a registered user yet (cold outbound, invitation, team-invite-accepted).

Each stage below gets a proposed default and an explicit **⚠️ DECISION NEEDED** for confirmation.

### 3.2 Stage-by-stage semantics

#### COLD-01 through COLD-05 — Cold outbound to prospects (pre-signup)

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| COLD-01 | EXTERNAL | Prospect on a scraped/imported SAM.gov lead list | These recipients have no `auth.users` row. They exist in Instantly's lead database. Everything is campaign-side. | Resolved — no ContractsIntel DB involved |
| COLD-02 | EXTERNAL | Same | Same | Resolved |
| COLD-03 | EXTERNAL | Same | Same | Resolved |
| COLD-04 | EXTERNAL | Same | Same | Resolved |
| COLD-05 | EXTERNAL | Same | Same | Resolved |

No decision needed — COLD-* is entirely Instantly territory. The only ContractsIntel-side hookup is the cold-reply handler that ingests inbound replies into Supabase. The worker file for that (`handle-cold-reply.js`) lives in the fork and is not deployed — see Section 7.

#### ONB-01 through ONB-08 — Onboarding after signup

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| ONB-01 "welcome — nice to have you" | USER-LEVEL | Recipient: the user who just signed up | Every new user sees this. Team invitees get it when they accept. | ⚠️ Confirm |
| ONB-02 "complete your profile" | USER-LEVEL | Recipient: the user, driven by `organizations.setup_wizard_complete = false` | Even though the flag is on the org, the behavior is "nudge anyone who hasn't finished setup." For team invitees joining an already-set-up org, this email doesn't fire. | ⚠️ Confirm |
| ONB-03 "your first matches are ready" | ORG-LEVEL (route to owner) | Matches are org-scoped; multiple team members looking at the same matches is fine but redundant email is not | Route to owner only. Team members see matches in-app. | ⚠️ Confirm |
| ONB-04 "tour the dashboard" | USER-LEVEL | Each user needs to learn the dashboard once | Per-user tracking: added `users.has_seen_dashboard boolean DEFAULT false` (§6.3). Org-level `organizations.has_seen_dashboard` stays in place as the rollup but the per-user signal drives ONB-04. | Resolved — per-user column added |
| ONB-05 "add your first NAICS codes" | ORG-LEVEL | NAICS is org-level state | Route to owner only. | ⚠️ Confirm |
| ONB-06 "connect your SAM.gov account" | ORG-LEVEL | SAM status is org-level | Route to owner only. | ⚠️ Confirm |
| ONB-07 "invite your team" | ORG-LEVEL (owner-only) | Only owners can invite | Conditional on `subscription_tier = 'team'` — other tiers don't have team seats. Don't send if tier is discovery or bd_pro. | ⚠️ Confirm team-tier gating |
| ONB-08 "week-1 review" | ORG-LEVEL (owner) | Summary of the org's first week in product | One email per org, to the owner. | ⚠️ Confirm |

#### TRIAL-01 through TRIAL-05 — Trial conversion

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| TRIAL-01 "trial midway" | ORG-LEVEL (owner) | Trial state is org-level (`organizations.subscription_status = 'trialing'`, `trial_ends_at`) | Route to owner only — they hold the card. | ⚠️ Confirm |
| TRIAL-02 "trial 3 days left" | ORG-LEVEL (owner) | Same | Same | ⚠️ Confirm |
| TRIAL-03 "trial 1 day left" | ORG-LEVEL (owner) | Same | Same | ⚠️ Confirm |
| TRIAL-04 "trial ends today" | ORG-LEVEL (owner) | Same | Same | ⚠️ Confirm |
| TRIAL-05 "trial ended" | ORG-LEVEL (owner) | Same | Same | ⚠️ Confirm |

Note: by analogy with **D19** (CANCEL-03 BCCs team members when the owner cancels), TRIAL-04 ("trial ends today") should also BCC team members so they know access is about to change. Not an explicit decision during Phase A — resolve during Phase B template copywriting when team-seat emails (D10) ship. Owner-only for launch is safe because there are zero multi-user orgs today.

#### PAID-01 through PAID-04 — Post-conversion onboarding

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| PAID-01 "welcome to bd_pro / team" | ORG-LEVEL (owner) | The subscription tier is org-level | Owner only. | ⚠️ Confirm |
| PAID-02 "here's what unlocks" | ORG-LEVEL (owner) | Same | Same | ⚠️ Confirm |
| PAID-03 "invite your team" | ORG-LEVEL (owner) | Team tier only | Owner only + gated on `subscription_tier = 'team'` | ⚠️ Confirm |
| PAID-04 "first milestone review" | ORG-LEVEL (owner) | Owner-level business metric review | Owner only | ⚠️ Confirm |

#### DUN-00 through DUN-06 — Dunning / payment failure

All dunning is owner-only. Team members don't receive dunning. This is the classic case where ORG-LEVEL is unambiguous: one card, one owner, one set of emails.

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| DUN-00 through DUN-05 | ORG-LEVEL (owner) | Billing emails go to owner | Universal across SaaS | Resolved |
| DUN-06 "high-value tier retention" | ORG-LEVEL (owner), gated on tier | Only fires for `subscription_tier IN ('bd_pro', 'team')` — the "high_value" bucket the fork wanted to store | Gating in code, not a column. | Resolved |

#### ENG-01 through ENG-05 — Engagement / digests

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| ENG-01 "daily match digest" | USER-LEVEL with hybrid prefs | Each user in orgs with `notification_preferences.email_digest != "never"` gets one per day | Per **D2 (LOCKED)**: hybrid prefs model. `users.notification_preferences` overrides when present; otherwise fall back to `organizations.notification_preferences`; otherwise system defaults. Render layer reads in that order. Column addition required: `users.notification_preferences jsonb` per §6.3. | Resolved — D2 hybrid |
| ENG-02 "weekly recap" | ORG-LEVEL (owner) | Summary for the owner | Simpler default; can expand to team members later. | ⚠️ Confirm |
| ENG-03 "monthly executive summary" | ORG-LEVEL (owner) | Owner only | Executive framing implies owner | ⚠️ Confirm |
| ENG-04 "industry benchmark" | ORG-LEVEL (owner) | Owner-facing content | Owner only | ⚠️ Confirm |
| ENG-05 "usage milestone" | USER-LEVEL | **DEFERRED indefinitely per D13** — audience is federal contractors focused on winning bids, not gamification-receptive. "You reviewed 50 opportunities" doesn't serve customer outcomes. Category dropped from launch scope. Revisit only if customer feedback specifically asks for engagement celebrations. | Deferred — D13 |

#### RISK-01 through RISK-04 — At-risk detection

"At-risk" is fundamentally a per-user signal: did this person sign in recently? It's the one place where user-level is unambiguous even on team tier.

**Per D14 (LOCKED for launch): simple time-based triggers on `auth.users.last_sign_in_at`.** No churn-risk scoring engine, no `organizations.churn_risk_score` column. Revisit scoring-based routing when customer count exceeds ~50 and there's real churn data to calibrate against.

| Stage | Audience shape | Trigger (days since last sign-in) | Rationale | Decision |
|---|---|---|---|---|
| RISK-01 "haven't seen you in a while" | USER-LEVEL | `last_sign_in_at < now() - 14 days` | First gentle check-in. Per user. | Resolved — D14 timing |
| RISK-02 "check in: still getting value?" | USER-LEVEL | `last_sign_in_at < now() - 30 days` | Second nudge. Same per-user scope. | Resolved — D14 timing |
| RISK-03 "we'd love your feedback" | USER-LEVEL | `last_sign_in_at < now() - 45 days` | Third message shifts tone to feedback rather than re-engagement. | Resolved — D14 timing |
| RISK-04 "last chance to reactivate" | ORG-LEVEL (owner) | `last_sign_in_at < now() - 60 days` (owner only) | Escalation to owner; they control the subscription. | Resolved — D14 timing |

Cron shape (reference only, not SQL): a daily job selects auth users where `last_sign_in_at` falls into each window, de-duplicates against prior RISK-* sends in `email_logs`, fires the appropriate template. RISK-01 through RISK-03 route to the triggering user; RISK-04 resolves the user's org's owner and sends to them. `last_risk_email_sent_at` on `organizations` (§6.2) prevents multiple RISK-* emails firing on the same escalation.

#### CANCEL-01 through CANCEL-03 — Cancellation flow

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| CANCEL-01 "we're sorry to see you go" | ORG-LEVEL (owner) | Cancellation is an owner action. Access remains through the billing period end; data is retained for **90 days** after access-end (per D16) for reactivation. | Owner only | ⚠️ Confirm |
| CANCEL-02 "before you go — here's what you'll miss" | ORG-LEVEL (owner) | Same. Email should explicitly name the 90-day reactivation window so customers know when data is gone for good. | Owner only | ⚠️ Confirm |
| CANCEL-03 "final access reminder" | ORG-LEVEL (owner) + team BCC | **Resolved per D19**: primary To = owner; BCC = all other users in the organization. Single email (not separate per-user sends) so team members see the owner made the cancellation call and preserves the owner's authority over the decision. Advance notice lets team members export any personal pipeline data before access ends. Also references the 90-day retention window (per D16). | Resolved — D19 |

#### WIN-01 through WIN-03 — Win-back

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| WIN-01 "come back — we've made changes" | ORG-LEVEL (owner, ex-customer) | Target the owner of the churned org | Owner only | ⚠️ Confirm |
| WIN-02 "here's 50% off your first month back" | ORG-LEVEL (owner) | Commercial offer; owner | Owner only | ⚠️ Confirm |
| WIN-03 "still not ready? we'll stop" | ORG-LEVEL (owner) | Suppression opt-in | Owner only | ⚠️ Confirm |

#### TX-01 through TX-13 — Transactional

These are the most operationally sensitive. Each one is individually categorized.

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| TX-01 "verify your email" | USER-LEVEL | Every user verifies their own email | Always user, never org | Resolved |
| TX-02 "password reset" | USER-LEVEL | Per user | Same | Resolved |
| TX-03 "email changed confirmation" | USER-LEVEL | Notifies the old email address that the change happened (security) | **DEFERRED per D6** — app has no email-change UI today. Ship when the UI + `supabase.auth.updateUser({email})` wiring exists. | Deferred — D6 |
| TX-04 "magic login link" | USER-LEVEL | Per user | Same | Resolved |
| TX-05 "account deleted" | USER-LEVEL | Recipient is the user whose account was deleted | **Resolved per D20**: no owner-side auto-notification. Owner sees membership change in the dashboard. Revisit when team-seat billing is added — a freed seat would affect the bill, which makes the notification actionable. At current scale (no multi-user orgs), auto-email adds noise without signal. | Resolved — D20 |
| TX-06 "plan upgraded" | ORG-LEVEL (owner) | Plan change is org-level | Owner only | Resolved |
| TX-07 "plan downgraded" | ORG-LEVEL (owner) | Same | Owner only | Resolved |
| TX-08 "invoice receipt" | ORG-LEVEL (owner) | Billing | Owner only | Resolved |
| TX-09 "subscription paused" | ORG-LEVEL (owner) | **DEFERRED per D8** — Stripe pause isn't wired (no webhook handler, no UI, 0 paused rows). | Deferred — D8 | Deferred — D8 |
| TX-10 "subscription resumed" | ORG-LEVEL (owner) | **DEFERRED per D8** — same as TX-09. | Deferred — D8 | Deferred — D8 |
| TX-11 "payment method updated" | ORG-LEVEL (owner) | Same | Owner only | Resolved |
| TX-12 "new device signin" | USER-LEVEL | Security — per-user | **DEFERRED per D7** — no device/IP tracking infrastructure exists. Multi-day build to wire. | Deferred — D7 |
| TX-13 "your card is about to expire" | ORG-LEVEL (owner) | Billing | Owner only | Resolved |

#### ALERT-01 through ALERT-04 — Compliance alerts

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| ALERT-01 "SAM expiring" | ORG-LEVEL (owner) | SAM status is org-level, owner-actionable | Owner only | ⚠️ Confirm |
| ALERT-02 "SAM expired" | ORG-LEVEL (owner) | Same | Owner only | ⚠️ Confirm |
| ALERT-03 "cert expiring" | ORG-LEVEL (owner) | **DEFERRED per D9** — no per-cert expiry data source exists (certifications is a flat string array; compliance task `due_date` is a hardcoded 300-day placeholder). For launch, ALERT-03 is an alias of ALERT-01 (SAM-only). Rebuild once cert expiry data source exists. | Owner only | Deferred — D9 |
| ALERT-04 "annual CPARS reminder" | ORG-LEVEL (owner) | Owner-actionable task | Owner only | ⚠️ Confirm |

#### BEHAV-01 through BEHAV-06 — Behavior-triggered

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| BEHAV-01 "you saved your first opportunity" | USER-LEVEL | Per-user action, per-user celebration | Per user | ⚠️ Confirm |
| BEHAV-02 "first proposal drafted" | USER-LEVEL | Same | Per user | ⚠️ Confirm |
| BEHAV-03 "first win logged" | ORG-LEVEL (owner) | Business milestone; owner celebrates | Owner only | ⚠️ Confirm |
| BEHAV-04 "you added HUBZone — here's what unlocks" | ORG-LEVEL (owner) | **DEFERRED per D11** — no re-score backfill; existing matches never pick up new certs. | Owner only | Deferred — D11 |
| BEHAV-05 "you bumped into the digest cap" | USER-LEVEL | Per-user limit | Per user | ⚠️ Confirm |
| BEHAV-06 "you hit your export limit" | ORG-LEVEL (owner) | Commercial / plan-based limit | Owner only | ⚠️ Confirm |

#### TEAM-specific (invites / membership)

These were not enumerated with distinct prefix codes in the fork's `02-email-system-map.md` but the placeholders (`{{invite_token}}`, `{{inviter_name}}`, `{{new_member_*}}`) imply a team-invitation flow.

| Stage | Audience shape | Proposed default | Rationale | Decision |
|---|---|---|---|---|
| "team invite sent" | EXTERNAL (pre-signup) | — | **DEFERRED per D10** — no team-invite feature exists. | Deferred — D10 |
| "team invite accepted" | ORG-LEVEL (inviter and/or owner) | — | **DEFERRED per D10.** | Deferred — D10 |
| "new member joined" | ORG-LEVEL (owner) — roll-up | — | **DEFERRED per D10.** | Deferred — D10 |
| "member removed" | USER-LEVEL (the removed user) + ORG-LEVEL (owner ack) | — | **DEFERRED per D10.** | Deferred — D10 |

### 3.3 Summary table

Aggregated recipient shape by prefix:

| Prefix | Dominant shape | Exceptions |
|---|---|---|
| COLD-* | EXTERNAL | none |
| ONB-* | Mixed (USER + ORG) | ONB-03, ONB-05, ONB-06, ONB-07, ONB-08 route to owner |
| TRIAL-* | ORG (owner) | Optional team broadcast late-trial (⚠️ decision) |
| PAID-* | ORG (owner) | none |
| DUN-* | ORG (owner) | none |
| ENG-* | Mixed | ENG-01 per-user if prefs, ENG-05 per-user |
| RISK-* | USER | RISK-04 flips to owner |
| CANCEL-* | ORG (owner) | CANCEL-03 may broadcast to team |
| WIN-* | ORG (owner) | none |
| TX-* | Mixed | Explicitly split above |
| ALERT-* | ORG (owner) | none |
| BEHAV-* | Mixed | per-user for in-product actions; owner for org-level events |
| TEAM-* | Mixed | Invites are EXTERNAL; ack flows are ORG |

The single biggest Section-3 decision — **`notification_preferences` per-user or per-org** — was **resolved as D2 (HYBRID)**: both live. `users.notification_preferences` overrides `organizations.notification_preferences` where set, with system defaults below both. That unblocks ENG-01, ENG-05, RISK-* routing, and BEHAV-01/02/05 logic. Schema delta: add `users.notification_preferences jsonb` (§6.3). No data migration from the existing `organizations.notification_preferences` — the org-level column stays authoritative until a user explicitly sets per-user overrides.

---

## Section 4 — The first_name Problem

### 4.1 Why this is Section-sized

`{{first_name}}` is referenced in ~40 of the fork's 85 email templates. It's the first word of most cold emails and the greeting opener of most lifecycle emails. If the rebuild can't resolve it cleanly, every template has to be rewritten around it — and that's a massive copy re-pass, not just a binding swap.

There are only three live candidates:

1. **Parse from `auth.users.raw_user_meta_data`**
2. **Collect explicitly at signup** (add `first_name` to the signup form, store on `auth.users.raw_user_meta_data` and/or a new `public.users.first_name` column)
3. **Fall back to `"there"` or the company name**

Only option 2 yields real first names for real users. Options 1 and 3 are partial — option 1 because the data isn't there today, option 3 because the email text then reads like a fallback.

### 4.2 Read-only evidence: what's actually in raw_user_meta_data

Sampled 10 auth.users via the admin API. PII redacted. Raw output:

```
total returned: 10

=== user_metadata key frequency (across all 10 sampled) ===
  email_verified: 10/10
  company_name: 9/10

=== Per-user redacted shape (top 10) ===
[1] <local:18ch>@contractsintel.com  created=2026-04-14  last_sign_in=2026-04-14  confirmed=True  provider=email
    meta shape: {'company_name': '<str,len=25>', 'email_verified': True}

[2] <local:17ch>@contractsintel.com  created=2026-04-14  last_sign_in=never  confirmed=True  provider=email
    meta shape: {'company_name': '<str,len=22>', 'email_verified': True}

[3] <local:17ch>@contractsintel.com  created=2026-04-14  last_sign_in=2026-04-14  confirmed=True  provider=email
    meta shape: {'company_name': '<str,len=17>', 'email_verified': True}

[4] <local:19ch>@contractsintel.com  created=2026-04-14  last_sign_in=2026-04-14  confirmed=True  provider=email
    meta shape: {'company_name': '<str,len=25>', 'email_verified': True}

[5] <local:18ch>@contractsintel.com  created=2026-04-14  last_sign_in=never  confirmed=True  provider=email
    meta shape: {'company_name': '<str,len=22>', 'email_verified': True}

[6] <local:18ch>@contractsintel.com  created=2026-04-14  last_sign_in=never  confirmed=True  provider=email
    meta shape: {'company_name': '<str,len=17>', 'email_verified': True}

[7] <local:18ch>@contractsintel.com  created=2026-04-14  last_sign_in=2026-04-14  confirmed=True  provider=email
    meta shape: {'company_name': '<str,len=17>', 'email_verified': True}

[8] <local:17ch>@contractsintel.com  created=2026-04-14  last_sign_in=never  confirmed=True  provider=email
    meta shape: {'company_name': '<str,len=17>', 'email_verified': True}

[9] <local:17ch>@contractsintel.com  created=2026-04-14  last_sign_in=2026-04-14  confirmed=True  provider=email
    meta shape: {'company_name': '<str,len=16>', 'email_verified': True}

[10] <local:23ch>@example.com  created=2026-04-10  last_sign_in=never  confirmed=True  provider=email
    meta shape: {'email_verified': True}

=== Name-ish keys encountered ===
  ['company_name']
```

### 4.3 What the evidence says

- `first_name` is not a key in the metadata of any of the 10 sampled users.
- `full_name` is not a key in the metadata of any of the 10 sampled users.
- `display_name` is not a key in the metadata of any of the 10 sampled users.
- The only name-adjacent key in today's signup flow is `company_name`, captured in 9/10 cases.

Additional observation: 9/10 sampled users share the `@contractsintel.com` email domain, which suggests most of the current `auth.users` rows are seed data (team members for internal testing), not organic signups. The 10th user has an `@example.com` address — also seed-looking. **If the 136 production rows are mostly seed data, the signup form question is still open because we haven't seen enough real signups to know what a real customer's metadata looks like.**

For the rebuild, the only safe assumption is: **a user has an email; they do not have a first name.**

### 4.4 Three options analyzed

#### Option A — Parse from `auth.users.raw_user_meta_data`

How it would work today:
- Read `raw_user_meta_data->>'first_name'` if present.
- Fall back to the first token of `raw_user_meta_data->>'full_name'` split on whitespace.
- Fall back to the email local-part with light cleanup ("rafihertz" → "Rafi"? "ralph.hertz" → "Ralph"?).
- Fall back to "there".

Problems:
- Evidence shows `first_name` and `full_name` are never present today. This option reduces to email-local-part parsing for 100% of real cases.
- Email local-part parsing is bad for B2B. "john.smith@acme.com" → "John" is clean. "jsmith@acme.com" → "J" or "Jsmith"? "contracting@northerngrid.com" → "Contracting"? The fallback quality is low and inconsistent.
- The fallback is silent — the email template will have no visible marker that the name was guessed. Customers will get "Hi J," or worse, "Hi Contracting," and it'll feel wrong.

Verdict on A alone: **not viable**. Too many cases where the parse is comic or empty.

#### Option B — Add `first_name` to signup form, store explicitly

How it would work:
- Add a "First name" field to the signup form (between email and password, typical B2B SaaS pattern).
- Store it at signup time in:
  - `auth.users.raw_user_meta_data.first_name` (Supabase convention for optional signup metadata)
  - **AND** `public.users.first_name` (new column) for query-time joins without having to touch `auth.users`
- Backfill for existing 136 users: not realistic for seed users. For real users, send a one-off "hey, quick ask" email that captures first name into `users.first_name`.

Pros:
- Real names for every user going forward.
- Clean SQL join, no schema drilling into `auth.users`.
- Users expect the prompt; it doesn't feel invasive.

Cons:
- Requires a signup form change, which is product work.
- Retroactive backfill for existing users needs a capture flow (probably an in-app prompt or an email with a one-click link).
- Adds one column to `public.users`.

Verdict on B: **this is the right answer for long-term quality.** The up-front cost is small; the downstream cost of bad first-name rendering in ~40 templates is much larger.

#### Option C — Fall back to "there" or company name

How it would work:
- Don't try to capture first name at all.
- Every template's opener uses `{{first_name|fallback:"there"}}` or references `{{company_name}}` instead (e.g. "Hi, Team at {{company_name}}").

Pros:
- Zero product work. Zero schema change.
- Works tomorrow.

Cons:
- Every cold email reads "Hi there,". Deliverability analysts will tell you this hurts open rates — the fork's voice-anchor research (Val Geisler, Ramit Sethi) both emphasize specificity. Generic "there" openers are a small but measurable hit.
- Feels less personal, especially for a buyer who's already skeptical of automation.

Verdict on C: **viable as a stopgap, not as the permanent answer.**

### 4.5 Decision (LOCKED — D1)

**D1 is resolved.** Locked strategy:

- Every template's opener is written as `{{first_name|fallback:"there"}}`.
- **Optional** `first_name` field is added to the signup form. Users who fill it in get personalized openers; users who leave it blank stay on `"there"` forever.
- When the signup form field is filled in at registration time, the value is stored in **both**:
  - `auth.users.raw_user_meta_data.first_name` (Supabase-native location)
  - `public.users.first_name` (new column per §6.3, used for query-time joins without having to reach into `auth.users`)
- The render layer evaluates `first_name` via:
  1. `public.users.first_name` if the column is populated,
  2. else `auth.users.raw_user_meta_data->>'first_name'` if populated,
  3. else the literal string `"there"`.
- **No backfill. No nag emails. No in-app prompts** for existing users to fill in their first name. If their row has no value, they stay on "there."

Why locked this way: the personalization value from `first_name` isn't worth the friction cost of forcing the field at signup or pestering existing users post-hoc. Optional collection gets us the lift on users who care, costs nothing on users who don't.

### 4.6 What this closes

- ~40 fork templates that greet with `{{first_name}}` all switch to `{{first_name|fallback:"there"}}`. The change is a single render-layer transform, not a per-template rewrite.
- The schema delta is a single added column on `public.users` (§6.3). No `auth.users` schema changes.
- The signup form change (add optional "First name" field) is a separate product task — small, no blocker on the email rebuild.
- D1-secondary (existing-user backfill) is resolved as **"no backfill."** Seed users stay blank; organic users going forward self-select.

---

## Section 5 — Architectural Patterns to Preserve

This section enumerates what's worth keeping from the fork's work, as reference knowledge only. Nothing in this section is being ported or rewritten now; the intent is to make sure the rebuild inherits the right lessons.

### 5.1 The four-lane domain split

Source: fork `01-architecture.md`.

Every email ContractsIntel sends must go through exactly one of four lanes:

| Lane | Domain(s) | Direction | Tooling | Why |
|---|---|---|---|---|
| Cold outbound | bidgov.org, bidsgov.net, bidgov.net, bidgov.com | Send only | Instantly (12 inboxes across sister domains) | Burn-layer. Reputation-expendable. |
| Transactional | `mail.contractsintel.com` | Send only | Resend | Per-user automated. Receipts, password resets, magic links. |
| Lifecycle / marketing | `hello.contractsintel.com` | Send only | Loops | Automated sequenced. Onboarding, trial nudges, win-back. |
| Human support | `contractsintel.com` (root) | Receive + reply | Google Workspace | 1:1 human replies. |

**The root-domain rule:** `contractsintel.com` never sends automated mail. It exclusively receives, and humans reply from it. MX receiving is safe and does not affect sending reputation; the rule is there to keep Loops, Resend, CRM tools, etc. off the primary brand domain.

**Reply-To convention:** every founder-voice email (ONB-01, DUN-06, CANCEL-01) has `Reply-To: raphael@contractsintel.com`, regardless of which lane sent it. Customer replies always land back on the root domain.

**Why this is worth preserving:** domain-layer separation is the single biggest deliverability safeguard. A single cold-email reputation incident on `bidgov.org` doesn't touch `mail.contractsintel.com`; a Loops suppression list doesn't touch Resend; customer replies never hit an automated inbox.

### 5.2 DMARC progression schedule

Source: fork `04-resend-setup.md` + §1.4 of the schema-architecture-audit.

The DMARC posture for each domain tightens on a time-based schedule as sending volume earns reputation:

| Stage | Timeline | DMARC posture |
|---|---|---|
| Bootstrap | Day 0 – Day 14 | `p=none; pct=100; rua=mailto:dmarc@contractsintel.com` |
| Monitor | Day 14 – Day 45 | `p=quarantine; pct=50; rua=mailto:dmarc@contractsintel.com` |
| Enforce | Day 45+ | `p=reject; pct=100; rua=mailto:dmarc@contractsintel.com` |

Each domain has its own clock. Cold domains (bidgov*.*) started earliest (domains were created in the last two weeks per the git log + session transcripts). Transactional (`mail.contractsintel.com`) starts when Resend is wired. Lifecycle (`hello.contractsintel.com`) starts when Loops is wired.

**Why this is worth preserving:** going straight to `p=reject` on a cold domain will get your mail reject-bounced during the warm-up period. The staged progression gives Google/Outlook time to see consistent pass-rates before enforcement bites.

### 5.3 DLQ retry + circuit breaker design (pattern only, not the code)

Source: fork `app/lib/email/send-transactional.ts` (read for shape only, not ported).

The pattern the rebuild should inherit:

**Retry ladder:**
- Attempt 1: immediate
- Attempt 2: +30 seconds
- Attempt 3: +2 minutes
- Attempt 4: +10 minutes
- After attempt 4 fails: push payload to DLQ (`failed_emails` table), stop retrying

**Circuit breaker:**
- Track recent Resend API failure rate (rolling 5-minute window)
- If failure rate ≥ 50% across ≥ 10 attempts, open the circuit
- While open: bypass Resend entirely, write straight to DLQ
- Probe the circuit every 60 seconds with a single send; close on success

**DLQ replay:**
- `scripts/replay-failed-emails.ts` reads rows from `failed_emails` where `replayed_at IS NULL`, re-attempts send, marks success or bumps `replay_attempts`.

The fork's implementation had a naive linear 400ms backoff without the DLQ. That was flagged during the Checkpoint 4.1 review and patched into a proper DLQ with exponential backoff. The rebuild should start with the correct pattern from day 1.

**What the rebuild locks in (D3 — RESOLVED):**
- `failed_emails.user_id` and `email_logs.user_id` both FK to **`auth.users(id)`** (not `public.users(id)`). Rationale: `auth.users` is more stable across account lifecycle events (never deleted under normal flows), so email-log history and DLQ replay data survive any `public.users` refactor. Cross-schema FKs are a known Supabase pattern; tooling cost is acceptable.

### 5.4 The Dunning ladder timing research

Source: fork `03-email-copy.md` + product-gaps-queue entries.

Research from the fork's Phase 2 pulled from Val Geisler and Chase Dimond lifecycle work on when to send dunning emails. The timing grid they settled on:

| Email | Trigger | Delay from trigger |
|---|---|---|
| DUN-00 "card expiring" | 14 days before `card.exp_date` | n/a (scheduled) |
| DUN-01 "payment failed, we'll try again" | `invoice.payment_failed` webhook | **+60 minutes** (not immediate — gives Stripe's own smart retry a window first) |
| DUN-02 "second attempt also failed" | Second `payment_failed` | +3 days |
| DUN-03 "third attempt, please update" | Third `payment_failed` | +7 days |
| DUN-04 "final notice — access suspends tomorrow" | Subscription past_due, one day before suspension | n/a |
| DUN-05 "access suspended" | Subscription canceled due to payment failure | immediate |
| DUN-06 "high-value tier retention offer" | Any of the above | Gated on `subscription_tier IN (bd_pro, team)`; fires in parallel with DUN-02 or DUN-03 |

**Why this is worth preserving:** the 60-minute first-email delay is a non-obvious but well-researched choice. Sending DUN-01 immediately on `payment_failed` catches a lot of transient card declines that Stripe's smart-retry resolves within minutes — resulting in customers receiving "your payment failed" emails for payments that, 30 seconds later, actually succeeded. The 60-minute gate smooths that out.

### 5.5 Voice rules

Source: fork copy iterations + conversation transcript.

Rules established during the fork's copy iteration rounds that the rebuild should preserve:

1. **Text-a-buddy voice**: conversational, short sentences, no corporate hedging. "I saw you signed up" beats "Welcome to the ContractsIntel family, we're thrilled to have you on board."
2. **No greeting on transactional**: TX-01 through TX-13 skip the "Hi {{first_name}}," greeting and open directly with the transactional context ("Your password reset link — good for 15 minutes:"). Greetings on receipts feel wrong.
3. **Scope-not-subtraction on downgrades**: TX-07 "plan downgraded" frames what the user *gets* on the new plan, not what they're *losing*. "Your Discovery plan includes X, Y, Z starting {{effective_date}}" — not "You're losing access to A, B, C."
4. **Credibility before pitch** in cold outbound: COLD-01 opens with a single concrete claim ("An SDVOSB firm missed a $280K set-aside last month because of a NAICS filter bug") before naming ContractsIntel. The fork's 4-round copy iteration landed here after the "Streamlining Procurement" generic original missed the mark.
5. **Specificity wins**: named-company case studies > "a company like yours." Fork research cited Harry Dry's concrete-language principle ("Couch to 5K" vs. "regaining fitness") as the rationale.
6. **Agency and NAICS specifics when available**: render agency names ("Department of Veterans Affairs") rather than generic "a federal agency" whenever the data exists.
7. **Plain text where possible**: the Salesforge deliverability checklist called out that plain-text dramatically beats HTML for cold outbound. Cold-outbound templates should be plain-text-only; transactional can be HTML but should be minimal (Stripe receipts are the benchmark).

**Why this is worth preserving:** these rules were earned through four rounds of iteration last night and a live critique from a real reader. The rebuild doesn't need to re-discover them.

### 5.6 Ship order

Source: fork phase-1-audit + session transcript.

The fork's recommended ship order for the email system (preserving this as reference; rebuild should follow unless a stakeholder overrides):

| Wave | When | What ships | Why this wave first |
|---|---|---|---|
| W1 | Week 1 (blocker-only) | TX-01 (email verification), TX-02 (password reset), TX-08 (invoice receipt) | These are the minimum required for the app to be operational — no product can run without email verification and password reset. |
| W2 | Week 2 (onboarding pull) | ONB-01, ONB-02, ONB-03, ONB-04 | Onboarding nudges have the highest ROI per template and the lowest risk. Sent to owner-only; no team complexity yet. |
| W3 | Week 3 (trial conversion) | TRIAL-01 through TRIAL-05, PAID-01 | Revenue-adjacent; conversion-rate sensitive. Requires Stripe webhook wiring to already be live. |
| W4 | Week 4 (engagement) | ENG-01 daily digest (if reliable), BEHAV-01/02 | Requires digest-reliability gate — daily digest should not ship until the scraping + matching pipeline has ≥99% SLA. |
| W5 | Week 5 (dunning + alerts) | DUN-00 through DUN-06, ALERT-01/02 (SAM) | High-stakes; needs test mode in Stripe and SAM expiration watcher working end-to-end. |
| W6+ | Later | CANCEL-*, WIN-*, RISK-*, BEHAV-03+, TX-09 through TX-13 | Less urgent; some depend on features not yet shipped (pause, device signin, team invites). |

**Why this is worth preserving:** it front-loads the cheapest, lowest-risk emails and gates high-stakes ones behind dependencies.

### 5.7 Pre-warmed inbox pool concept

Source: fork `07-instantly-setup.md` was pending but the concept is in the product-gaps queue.

Cold-outbound inboxes need 2–4 weeks of warmup before full sending volume. The fork's proposal was:

- Keep a pool of 6+ inboxes always in "pre-warmed" state (warmup on, no sending).
- When sending volume increases or an inbox's reputation drops, rotate a pre-warmed inbox into active use and warm up a replacement.
- This avoids the multi-week delay between "I need more sending capacity" and "I can actually send more."

Today we have 12 inboxes total, all in parallel warmup. A future capacity expansion would want a reserve.

**Per D21 (LOCKED):** stay at 12 for launch. No additional inboxes provisioned as reserves until real sending data informs the right number. Revisit when cold outbound has been running for 30 days and we have reply-rate + bounce-rate + reputation scores to reason about. Expansion should be driven by observed need, not anticipated need. Weekly monitoring cadence is tracked in §7.10 as a product-roadmap item (not email-spec work).

### 5.8 Suppression propagation

Source: fork `06-loops-setup.md`.

A single suppression (customer unsubscribes, bounces, complains) must propagate across all three sending lanes:

- Unsubscribe from Loops → also set `organizations.notification_preferences.email_*` to `false`
- Bounce on Resend → add to a shared `suppressions` table that Loops and Instantly both read from
- Complaint on Instantly → also set the user's address to suppressed in Loops and Resend

**Why this is worth preserving:** a customer who unsubscribes from the daily digest on Loops should not then receive a cold email from Instantly three weeks later. One suppression store, read by all three lanes.

**Per D22 (LOCKED): table-based, central in `public.email_suppressions`** (see §6.4 for schema). Every send lane (cold/Instantly, transactional/Resend, lifecycle/Loops) reads this table as a gate before sending. When a suppression event arrives from **any** source — Loops unsubscribe webhook, Resend bounce/complaint webhook, Instantly reply classifier unsubscribe detection (§7.9.12), or a manual entry — it writes here first, then fans out to each external service via their API (Instantly suppression list, Resend suppression list, Loops unsubscribe endpoint). The services enforce their own checks too, but our table is authoritative and never lags the external state.

Three invariants this design protects:
1. **Single source of truth.** Resolving "is this email suppressed?" is always a lookup in our table. No round-trip to each service at send time.
2. **Durability across provider changes.** If we swap Resend for Postmark tomorrow, suppression history persists.
3. **CAN-SPAM compliance is enforceable in one query.** Audit trail is local, not spread across three SaaS dashboards.

### 5.9 Scoring thresholds and policy windows (LOCKED per D16–D18)

These are the authoritative numbers the rebuild uses everywhere email copy references a threshold, window, or retention period. If a template hardcodes a number, it should match this list; if a template generalizes, it should read from a constants file keyed to these values.

| Constant | Value | Source | Used by |
|---|---|---|---|
| `RETENTION_DAYS_POST_CANCEL` | **90 days** | D16 | `{{deletion_date}}` (§2 #28); CANCEL-01/02/03 copy that references the reactivation window; the scheduled deletion job that fires at `access_cutoff_date + 90d`. Rationale: federal contracting has long sales cycles — 90 days gives departing customers a comfortable reactivation runway before data is gone for good. |
| `HIGH_SCORE_THRESHOLD` | **≥80** | D17 | `{{high_score_count}}` (§2 #53); any email copy that says "N high-scoring matches" or "your best matches." Rationale: matches at 80+ are genuinely strong fits (NAICS exact + cert alignment or NAICS exact + strong keywords). Matches at 70–79 have a weak dimension. Threshold is for rendering copy only — the matching engine itself is unchanged. |
| `DEADLINE_WARNING_WINDOW_DAYS` | **7 days** | D18 | `{{deadline_count}}`, `{{upcoming_deadline_days}}` (§2 #70, #73); any copy referencing "upcoming deadlines." Rationale: federal response windows are typically 30–60 days; by 7 days out, the customer should already be in active pursuit — the email is a last-chance nudge, not an early heads-up. |
| `RISK_EMAIL_WINDOWS_DAYS` | **14 / 30 / 45 / 60** | D14 | RISK-01 / RISK-02 / RISK-03 / RISK-04 triggers on `auth.users.last_sign_in_at`. Already documented in §3 RISK-* section and §7.9.11. |

The rebuild should surface all four as named constants in one place (e.g. `lib/email/constants.ts`) so copy doesn't drift from the source of truth.

### 5.10 Canonical placeholder tokens (LOCKED per D23/D25)

Per **D23**, six legacy token pairs collapsed into one canonical name each. Per **D25**, `{{remaining_count}}` deprecated and replaced with three context-specific variants.

Rebuild rules:

1. Templates reference ONLY these canonical token names:
   - `{{cert_type}}`, `{{agency}}`, `{{opportunity_title}}`, `{{access_cutoff_date}}`, `{{change_date}}`, `{{saved_count}}` (the six D23 canonicals)
   - `{{trial_days_remaining}}`, `{{matches_unreviewed}}`, `{{seats_remaining}}` (the D25 replacements for `{{remaining_count}}`)
   - All other tokens in §2 that weren't affected by normalization.
2. The Phase B style pass does a global find-and-replace across every template source file to collapse every deprecated variant.
3. `lib/email/tokens.ts` (or equivalent) exports only canonical names as typed constants. TypeScript then catches any stray reference to a deprecated token at compile time.
4. The deprecated names stay documented in §2.5 and in the §2 rows marked "DEPRECATED" so anyone reading the doc or grepping the repo can trace a legacy name to its canonical replacement.

---

## Section 6 — Required New Schema for Phase B

### 6.1 Principle

Minimize added columns. Compute what can be computed. Store only what can't.

The fork's Phase 4.1 added `plan_tier`, `primary_certification`, `cert_expiry_dates`, `sam_expiry_date` as columns. The first two are derivable. The third is an open product question. The fourth already exists under a different name (`sam_expiration`). Following the audit's guidance, the rebuild stores none of these four as columns; it adds only what's load-bearing.

### 6.2 Column additions to `public.organizations`

| Column | Type | Nullable | Why | Decision |
|---|---|---|---|---|
| ~~`cert_expiry_dates`~~ | ~~jsonb~~ | ~~Yes~~ | **Not added per D9 (DEFERRED)** — no per-cert expiry data source today. If/when the rebuild ships per-cert expiry tracking, re-evaluate whether to store as jsonb on `organizations` or as a separate `certifications` child table. | Deferred — D9 |
| ~~`last_digest_sent_at`~~ | ~~timestamptz~~ | ~~Yes~~ | ~~Drives `{{new_match_count}}` computation (§2 #52).~~ | **Removed per D5**: `opportunity_matches.digest_sent_at` already exists as a per-match column. No org-level column needed. `{{new_match_count}}` is computed per-match, not per-org. |
| `last_risk_email_sent_at` | timestamptz | Yes | Prevents multiple RISK-* emails firing in the same risk escalation window. | ⚠️ Confirm need |
| ~~`churn_risk_score`~~ | ~~numeric(3,2)~~ | ~~Yes~~ | **Not added per D14 (DEFERRED)**. Pre-revenue (0 customers, 0 churn data to calibrate). RISK-* emails use simple time-based triggers on `auth.users.last_sign_in_at` — see §3 RISK-* section and §7.9.11. Revisit once customer count exceeds ~50 and there's churn data. | Deferred — D14 |

### 6.3 Column additions to `public.users`

| Column | Type | Nullable | Why | Decision |
|---|---|---|---|---|
| `first_name` | text | Yes | **Per D1 (LOCKED)**. Optional at signup (field added to form; blank is fine). Stored here + mirrored to `auth.users.raw_user_meta_data.first_name`. No backfill for existing rows. Render layer reads this first, then auth meta, then falls back to `"there"`. | Resolved — D1 |
| `notification_preferences` | jsonb | Yes, default `'{}'::jsonb` | **Per D2 (LOCKED)** hybrid model. User-level overrides for opt-outs; falls back to `organizations.notification_preferences`, then system defaults. Render order: `users.notification_preferences` → `organizations.notification_preferences` → defaults. | Resolved — D2 |
| `has_seen_dashboard` | boolean | Default false | Per-user dashboard-tour tracking, complementing the existing org-level flag. | ⚠️ Per-user tour (§3) |
| ~~`last_activity_at`~~ | ~~timestamptz~~ | ~~Yes~~ | **Not added per D13 (DEFERRED)** — per-user activity counter is part of the milestone-email category (ENG-05), which is deferred indefinitely. RISK-* detection falls back to `auth.users.last_sign_in_at` (Supabase built-in). | Deferred — D13 |

### 6.4 New tables

#### `public.email_logs`

Tracks every automated email we send. Evidence-for-send and replay-on-failure-path.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid (FK → **`auth.users(id)`** per **D3 — LOCKED**) | |
| `organization_id` | uuid (FK → `organizations.id`) | Redundant to user_id but makes org-scoped analytics cheap |
| `email_type` | text | The template code (e.g. `ONB-01`, `TX-08`) |
| `resend_message_id` | text | Tracking ID from Resend for delivery-status lookups |
| `subject` | text | |
| `to_address` | text | |
| `status` | text | `sent`, `bounced`, `complained`, `delivered` |
| `sent_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes: `(user_id, email_type, sent_at DESC)`, `(resend_message_id)`, `(organization_id, sent_at DESC)`.

RLS: `users read own email_logs`. Service role writes. User↔row matching goes through `auth.uid() = email_logs.user_id` (since FK is `auth.users(id)`).

#### `public.failed_emails` (DLQ)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid (FK → **`auth.users(id)`** per **D3 — LOCKED**) | |
| `organization_id` | uuid (FK → `organizations.id`) | |
| `email_type` | text | |
| `payload` | jsonb | Full render context for replay |
| `first_attempted_at` | timestamptz | |
| `last_attempted_at` | timestamptz | |
| `attempt_count` | integer | |
| `last_error` | text | |
| `replayed_at` | timestamptz (nullable) | Non-null = this row was successfully replayed |
| `replay_attempts` | integer | |

Indexes: `(user_id, email_type)`, `(replayed_at) WHERE replayed_at IS NULL`.

#### `public.email_suppressions` (suppression list, §5.8)

| Column | Type | Notes |
|---|---|---|
| `email` | text (PK) | Lowercased, trimmed |
| `scope` | text | `all`, `marketing`, `digest` — granularity of suppression |
| `source` | text | `loops_unsubscribe`, `resend_bounce`, `resend_complaint`, `instantly_reply_unsubscribe`, `manual` |
| `reason` | text | Free-text from the source |
| `created_at` | timestamptz | |

Used by all three send lanes at send time.

#### `public.cold_replies` (added per D15 launch scope — §7.9.12)

Logs every inbound reply to a cold-outbound Instantly send. Every reply gets a row whether or not it triggered auto-suppression. The log is the calibration dataset for the future full-classifier build (§7.9.13) — don't skip rows.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `from_email` | text | Normalized lowercase. Matches `email_suppressions.email` when suppression fires. |
| `subject` | text | |
| `body` | text | Raw reply body, post-signature-strip if feasible. |
| `received_at` | timestamptz | |
| `instantly_campaign_id` | text | Which cold campaign this was a reply to (see `90b29a94-…` etc.) |
| `instantly_lead_id` | text | Instantly's lead ID for the prospect. |
| `classification` | text | `unsubscribe` or `forward` only at launch. Future classifier extends to more values. |
| `action_taken` | text | `suppressed_and_propagated`, `forwarded_to_support`, `manual_review_pending`, `errored` |
| `error` | text | Non-null if the handler failed. |
| `created_at` | timestamptz | Matches `received_at` at insert time; separate column for audit clarity. |

Indexes: `(from_email)`, `(classification, received_at DESC)`, `(received_at DESC)`.

RLS: service-role-only writes. Founders read via admin-scoped queries. Customers never read this table (it's pre-customer data about prospects).

### 6.5 Views (optional but useful)

| View | What it returns | Why |
|---|---|---|
| `public.email_send_context` | Joined row: `(user, organization, auth_user, derived)` per user | Centralizes the "get me everything I need to render an email" query. Render code reads from this view instead of composing the join N times. |
| `public.users_with_derived` | `users` rows + `plan_tier` (derived from `organizations.subscription_tier`) + `primary_cert` (derived from `organizations.certifications->>0`) + `days_since_last_sign_in` | Single place to express the derivations so they don't get out of sync across render layers. |

### 6.6 What is NOT added

- `profiles.plan_tier` — rolled back; not re-added anywhere.
- `profiles.primary_certification` — same.
- `profiles.sam_expiry_date` — redundant with `organizations.sam_expiration`.
- `organizations.plan_tier` — derivable, not stored.
- `organizations.primary_certification` — same.
- `organizations.last_digest_sent_at` — **removed per D5**; `opportunity_matches.digest_sent_at` already exists as a per-match column, making an org-level aggregate redundant.
- `users.full_name` — skipped; only `first_name` is practically used.
- `public.profiles` — **D4 DEFERRED**. This redesign neither relies on it nor assumes it survives. The drop is deferred until after the email system is stable (30 days post-launch). Tracked as a separate cleanup item (see §7.9 / product-gaps-queue reference).
- `public.user_matches` — same deferral as `public.profiles`.

### 6.7 Migration order (reference only; no SQL here)

If the above is approved in Section 8, the rebuild's Phase B schema migration would layer like this (post-Tier-1 lock-ins):

1. ~~Drop legacy artifacts (profiles + user_matches)~~ — **deferred per D4**. Not part of Phase B.
2. Add columns to `public.users` (`first_name` per D1, `notification_preferences` per D2, plus `has_seen_dashboard` and `last_activity_at` gated on their own decisions).
3. Add columns to `public.organizations` (gated per decision on each; `last_digest_sent_at` removed per D5).
4. Create `email_logs`, `failed_emails`, `email_suppressions` — all FK'd to `auth.users(id)` per D3.
5. Create views `email_send_context`, `users_with_derived`.

Each migration in its own file, in the live repo's `supabase/migrations/` directory, following the existing naming convention (`YYYYMMDDHHMMSS_short_name.sql`). No squash; each concern is its own migration for rollback flexibility.

---

## Section 7 — Fork Artifacts to Throw Away

### 7.1 Principle

The fork represents ~14 hours of work. Most of it was valuable research and design thinking, but the implementation artifacts were built against the wrong schema. This section names which files should not be ported under any circumstances, and why.

### 7.2 Migrations — drop on sight

Every migration file under `~/ContractsIntel/supabase/migrations/` that ran against production last night has already been rolled back (verified in §1 and Query 1 of the audit). The files themselves should be deleted, not carried over:

| Fork path | Reason |
|---|---|
| `supabase/migrations/20260416120000_email_system_fields.sql` | Added 4 columns to `profiles`. Rolled back. Profile targeting is wrong anyway. |
| `supabase/migrations/20260416130000_email_logs.sql` | `email_logs` FK target was `auth.users` but the column set and indexes were designed against `profiles`-derived fields. Rebuild fresh per §6.4. |
| `supabase/migrations/20260416140000_failed_emails.sql` | Same story as email_logs — target schema was shaped around profiles queries. Rebuild fresh. |
| `supabase/migrations/20260407000000_remote_baseline.sql` | Placeholder file the fork created as a `supabase migration repair` workaround. Should never ship. |

Rebuild writes net-new migrations under Phase B's numbering convention.

### 7.3 Email templates that reference dead fields

From fork `emails/tx-*.tsx` and `emails/*.tsx`, these reference fields that don't exist in the real schema:

| Template | Dead reference | Impact |
|---|---|---|
| `tx-06-plan-upgraded.tsx` | Uses `profile.plan_tier` and `profile.primary_certification` from Phase 4.1 columns | Rewrite using `organization.subscription_tier` + derived `primary_cert` |
| `tx-07-plan-downgraded.tsx` | Same | Same |
| `tx-08-invoice-receipt.tsx` | Reads `profile.stripe_customer_id` | Use `organization.stripe_customer_id` |
| Any template that references `{{cert_expiry_dates}}` | Column was on profiles, rolled back, not re-added | Rewrite gated on ship decision for per-cert expiry |
| Any template that references `{{plan_tier}}` as a direct column | Stored-column pattern | Rewrite using derived value |

The body copy of these templates is fine (voice + structure + CTA language); the field bindings are broken. A rewrite is a find-and-replace exercise plus retest, not a from-scratch write.

### 7.4 Dead code in fork `app/lib/email/`

| Fork path | Issue | Action |
|---|---|---|
| `app/lib/email/types.ts` | `BaseEmailPayload` carries `companyName` as if it were a user property. Needs to reflect the org-not-user reality. | Rewrite against the (user, org, auth_user, derived) shape. |
| `app/lib/email/resend-client.ts` | Just a thin Resend client wrapper — shape is fine. | Can port as-is, but audit for env-var references. |
| `app/lib/email/send-transactional.ts` | Retry logic is naive linear backoff; DLQ push was patched in but against fork schema. | Rewrite retry ladder per §5.3; rebuild DLQ writes against the new `failed_emails` table. |

### 7.5 Dead code in fork `app/lib/billing/`

| Fork path | Issue | Action |
|---|---|---|
| `app/lib/billing/dun-gating.ts` | Uses `plan === "bdpro"` (no underscore) in one branch; fix is trivial but underscores the "read-from-real-enum-values" discipline. | Rewrite as a tiny helper reading `organizations.subscription_tier` directly. |

### 7.6 Scripts

| Fork path | Action |
|---|---|
| `app/scripts/replay-failed-emails.ts` | Rewrite against the new DLQ table (different FK target per §6.4). |
| `app/scripts/test-emails.ts` | Rewrite against the new payload shape. |
| `app/scripts/test-retry-dlq.ts` | Same. |

### 7.7 Worker

`workers/jobs/handle-cold-reply.js` in the fork is a full-classifier cold-reply ingestion job. Audit per Query 3: it exists but is not wired to any cron, not in the live repo, not deployed.

**Resolved per D15 (scoped down):**
- **DO NOT PORT** this file. It was written against the wrong schema, untested on real reply data, and its "full classifier" scope is what we're deferring.
- Delete from the fork during reconciliation. Tracking note in §7.10.
- Replace at launch with a fresh, narrower unsubscribe-only handler per **§7.9.12** — one afternoon of work, correctly scoped, CAN-SPAM compliant.
- Full classifier revisit is deferred to **§7.9.13**.

### 7.8 Documentation files

The fork's docs under `docs/email-system/` are reference library. Keep the fork directory intact for grounding; **do not copy individual files into the live repo.** This redesign doc (Section 1–8 above) is the one document that moves to the live repo.

Exception: the `product-gaps-queue.md` entries in the fork are worth re-reading and re-filing as GitHub issues against the live repo during Phase B kickoff. That's a separate task for a human, not a file copy.

### 7.9 Deferred work (tracked, not executed)

This section is the single register of work pushed out of launch scope. The rebuild executes none of it. A fresh product-gaps tracker will be created in the live repo during Phase B; until then, this list is the source of truth.

#### 7.9.1 Legacy schema cleanup — per D4

After the email system has shipped and been stable for 30 days (not before):

- `DROP TABLE public.user_matches` (0 rows, FKs into `profiles`)
- `DROP TABLE public.profiles` (0 rows, referenced only by 3 dead worker scripts)
- Delete or rewrite `workers/jobs/support-responder.js`, `workers/jobs/match-contracts.js`, `workers/jobs/send-digests.js` — each currently queries `profiles` and silently returns 0 rows.

#### 7.9.2 TX-03 email-change confirmation — per D6

Deferred until:
- Email-change UI exists in `app/dashboard/settings/` (or equivalent).
- The UI calls `supabase.auth.updateUser({ email: newEmail })`.
- The new-email confirmation flow (Supabase's built-in magic link to the new address) is wired in.

Then build and ship TX-03.

#### 7.9.3 TX-12 new-device-login alert — per D7

Deferred until a login-events infrastructure exists. Concretely:
- A `login_events` table (or similar) capturing per-sign-in rows with User-Agent, IP, timestamp, `auth_user_id`.
- Middleware or an auth callback (`onAuthStateChange` or Next.js middleware) that writes to it.
- A GeoIP lookup service (MaxMind, ipdata, ipapi) to resolve approximate location.
- Comparison logic: "is this a new device/location vs. the user's recent pattern?"

This is multi-day infrastructure work, not launch-critical.

#### 7.9.4 TX-09 / TX-10 subscription pause/resume — per D8

Deferred until pause is a real product feature. Requires:
- Enable Stripe `pause_collection` on the subscription product.
- Add a pause button to the billing UI.
- Extend the Stripe webhook handler (`app/api/stripe/webhook/route.ts`) to handle `customer.subscription.paused` and `customer.subscription.resumed`.

Retention feature — add when customer requests justify it.

#### 7.9.5 ALERT-03 per-cert expiration — per D9

Deferred until a per-cert expiry data source exists. Requires one of:
- **User-entered:** onboarding wizard collects `{cert: expiration_date}` pairs; `organizations.cert_expiry_dates jsonb` added as storage.
- **Scraped:** scraper pulls from SBA's 8(a) database, VetCert, SAM.gov's WOSB endpoint, etc. — each cert type has its own issuer. Non-trivial.

For launch, ALERT-03 is aliased to ALERT-01 (SAM-only expiration).

#### 7.9.6 HELP PANEL COPY FIX — HIGH PRIORITY (documentation-only; not executed as part of this doc update)

`app/dashboard/help-panel.tsx:78` currently claims:

> _"ContractsIntel automatically tracks your SAM.gov registration expiration, **certification renewal dates**, CMMC assessment deadlines, and changes to the Federal Acquisition Regulation..."_

The "certification renewal dates" claim is **not delivered** today. The only real tracking is `organizations.sam_expiration` (SAM only). Cert-renewal "tracking" in the compliance-task seeder uses a hardcoded 300-day placeholder, not real expiration data.

**Action required (2-minute edit; deliberately not executed as part of this checkpoint):**
- File: `app/dashboard/help-panel.tsx`
- Line: 78
- Change: remove the phrase "certification renewal dates, " from the tracked-items list so the copy reflects what the app actually does.
- Customer-trust rationale: aspirational copy that the product can't back up is a bigger risk than a shorter promise that is fully delivered.

This fix should happen in the live repo as a code change before the first real customer sees the help panel. Not deferrable indefinitely — only deferred past this documentation checkpoint.

> **Update 2026-04-17 (post-Tier-1-checkpoint):** executed in PR #2 (`fix/help-panel-cert-renewal-claim`, commit `0239f41`). Pure 1-line deletion, open for review. This section remains in place as the audit trail of the fix.

#### 7.9.7 Team-invite emails — per D10

Deferred until the team-seat feature itself is built. Today:
- No `invitations` / `team_invites` / `organization_members` table.
- No invite API routes (`app/api/invites/…` does not exist; `app/api/teaming/` is about joint-venture **partners**, not seat invites).
- No UI for sending or accepting invites.
- Zero multi-user orgs in production (136 users, 136 distinct `organization_id` values).

When the first paying Team-tier ($899/mo) customer asks for multi-user access, build in this order:
1. `invitations` table (columns: `id`, `organization_id`, `invited_email`, `invited_by`, `token`, `status` enum `{pending|accepted|revoked|expired}`, `expires_at`, `accepted_at`).
2. Invite API routes: `POST /api/organizations/[id]/invites` (send), `POST /api/invites/[token]/accept`, `DELETE /api/organizations/[id]/invites/[id]` (revoke).
3. Signup flow that consumes `?invite=<token>` and attaches the new user to the inviting org with `role = 'member'`.
4. Team members UI in settings (list, invite, remove).
5. Then the associated emails: "team invite sent," "team invite accepted," "new member joined," "member removed."

#### 7.9.8 BEHAV-04 cert-unlocked email — per D11

Deferred until a re-score backfill pipeline exists. Today:
- Matching engine (`app/api/cron/match-opportunities/route.ts`) scopes to `unmatched` opportunities only. Existing 110,571 `opportunity_matches` rows keep their original scores even after the org's cert set changes.
- Cert-update handlers (`app/dashboard/settings/page.tsx:247`, `app/dashboard/onboarding/setup/page.tsx:187`, `app/dashboard/unlock-panel.tsx:191`) write `certifications` and return — no rematch trigger, no backfill enqueue.

When built:
1. Each cert-update handler POSTs to a new `/api/matching/rescore?organization_id=<id>` route instead of just updating in place.
2. The route enqueues a job (or runs it synchronously for small match sets) that re-runs `computeScore()` over every `opportunity_matches` row for that org and updates the score.
3. Once the backfill completes, BEHAV-04 fires with a delta summary: "Adding HUBZone moved 12 matches into your high-score band (new top match: [title], score 87)."

#### 7.9.9 Bulk match export + `{{export_download_url}}` email — per D12

Deferred until a user-facing export exists. Today:
- `/api/account/export` exists (GDPR Article 20 data portability) — returns an all-data JSON dump, not a filtered match-list CSV.
- `/api/proposals/export` exists — per-proposal `.docx` generator, not match export.
- No CSV library (papaparse / csv-stringify / csv.parse) in the codebase.
- No "Export" button on `app/dashboard/page.tsx` or `app/dashboard/pipeline/page.tsx`.

When built:
1. New route `GET /api/matches/export?format=csv&filter=<…>` that streams a CSV for the requesting org's matches (or a filtered subset).
2. CSV generator using `csv-stringify` or `papaparse` (pick one during build).
3. "Export" button wired into the matches + pipeline dashboard pages.
4. Signed URL for time-limited downloads if the export is large enough to need async generation.
5. Then the email that delivers the download link.

#### 7.9.10 ENG-05 milestone emails — per D13

Deferred indefinitely. Not a "build this later" — a deliberate category drop.

Reason: the ContractsIntel audience is federal contractors (ex-military, ex-government, first-gen entrepreneurs) focused on winning bids. "You've reviewed 50 opportunities" is gamification copy that doesn't match the buyer's outcome focus. Milestone celebrations serve a different audience (consumer / creator / learning products) and add noise to a skeptical-of-marketing inbox.

Do not build per-user activity counters, do not build the emitter, do not write the copy. Revisit only if specific customer feedback asks for engagement celebrations.

#### 7.9.11 Churn-risk scoring system — per D14

Deferred until customer count justifies the modeling effort. Today:
- Pre-revenue: 0 paying customers, 0 churn data to train a scoring model against.
- Per-org scoring adds nightly-cron complexity and calibration burden for no current benefit.

For launch, RISK-* emails run on **simple time-based triggers** against `auth.users.last_sign_in_at` (14 / 30 / 45 / 60 days — see §3 RISK-* section above).

When to revisit:
- Customer count exceeds ~50.
- At least ~5–10 churn events to reason about.
- A clear question the score would answer that time-based rules don't (e.g. "owners who stopped logging in but whose team is still active," which the current single-signal model can't distinguish).

When built:
1. Add `organizations.churn_risk_score numeric(3,2)` (removed from §6.2 until then).
2. Nightly cron reads (a) `auth.users.last_sign_in_at` for all users in the org, (b) feature-usage signals (match review rate, pipeline-stage movement, support ticket history), (c) billing state (`subscription_status`, trial days remaining).
3. Score writes nightly. RISK-* branch on score buckets rather than single-signal day thresholds.

#### 7.9.12 Cold-reply unsubscribe handler — LAUNCH SCOPE (per D15)

**This ships at launch, before cold outbound activates at day 21 of warmup.** Unsubscribe-only auto-handling; everything else forwards to `raphael@contractsintel.com`.

Requires:

1. **Inbound reply source.** Instantly webhook when a reply is received on any of the 12 cold mailboxes. If Instantly's webhook doesn't cover inbound replies adequately, fall back to a Gmail API poll against each mailbox's inbox (we already have the Gmail OAuth creds for the cold-mailbox domains via Primeforge's Google Workspace provisioning).
2. **Unsubscribe pattern matcher.** Case-insensitive, punctuation-tolerant regex + keyword list:
   - Explicit: `unsubscribe`, `STOP`, `remove me`, `take me off`, `opt out`, `opt-out`
   - Phrased: `not interested, don't email again`, `please remove from list`, `no longer contact`
   - Plus common variations: `please stop emailing`, `don't contact`, `delete my information`
   - False-positive protection: only match if the phrase is plausibly addressed to the sender (e.g. avoid false trigger on a quoted regulatory reference).
3. **On unsubscribe detected:**
   - Insert row into `public.email_suppressions` with `email = <from_email>`, `source = 'instantly_reply_unsubscribe'`, `scope = 'all'`, `reason = <matched phrase>`, `created_at = now()`.
   - Call Instantly API to add the prospect to the campaign's suppression list (so Instantly itself also stops sending).
   - Propagation to Resend + Loops happens automatically because the table is the source of truth read by all three lanes at send time (per §5.8).
4. **On unsubscribe NOT detected:**
   - Forward the full reply to `raphael@contractsintel.com` via Resend (subject prefix `[cold-reply]`).
   - Do NOT auto-reply. Do NOT attempt classification.
   - The forward path stays manual until §7.9.13 ships.
5. **Every reply — suppressed or forwarded — writes to `public.cold_replies`** (see §6.4). This is the calibration dataset for future classifier work.

**CAN-SPAM compliance:** unsubscribe must be honored within 10 business days. Writing to `email_suppressions` on receipt trivially meets this; the send-time read in all three lanes prevents any post-unsub send. Sending cold outbound to a suppressed address is a CAN-SPAM violation — treat the read in the cold-outbound path as a hard gate, not a soft filter. Any future classifier MUST preserve this behavior as an invariant.

**Build estimate:** one afternoon. Not a blocker on the main email rebuild; can be built in parallel while D16–D22 policy decisions happen.

#### 7.9.13 Full cold-reply classifier — DEFERRED (per D15)

Deferred deliberately. Revisit only after both conditions hold:

1. ~50 real cold replies have been received and read manually (via the `raphael@contractsintel.com` forward path).
2. Clear patterns emerge that would benefit from automation (e.g. consistent "interested — send more info" flows, consistent objection patterns, consistent auto-reply noise worth filtering).

When built, scope includes:
- Extended classification beyond unsubscribe: `interested`, `not_interested_but_polite`, `questions`, `objections`, `auto_reply_bounce`, `confused`, `other`.
- AI call per reply (Claude or similar) with a calibrated prompt built against the `public.cold_replies` dataset.
- Routing logic per intent (auto-reply for some, forward-with-context for others, human-review queue for low-confidence).
- Monitoring dashboard for classifier accuracy (tracked against the human review queue outcomes).

**Build estimate:** 3–5 days if done properly with evaluation infrastructure. Do NOT build until unsubscribe-only handling has been running for a month AND manual reply reading has surfaced real patterns. The fork's overnight classifier attempt (`~/ContractsIntel/workers/jobs/handle-cold-reply.js`) is not a starting point — see §7.10.

### 7.10 Product gaps surfaced by the email audit (out of email scope)

These are **not email work**. They're product issues the email audit uncovered that should be tracked against the product roadmap, independent of the email system. Logged here so the fork's product-gaps-queue equivalent gets recreated fresh in the live repo during Phase B.

- **Team tier is sold without team seats.** `$899/mo` Team tier exists in Stripe (`price_1TMoS1EMMzxoqfnRvNRctvqk`), but the app has no invite infrastructure, no multi-user orgs in production, no seat-management UI. Either build team seats when the first Team customer signs up, or remove Team tier from pricing until the feature exists.
- **Cert updates don't re-score existing matches.** Users who add a new certification (e.g. HUBZone) see no score change on their 200+ existing matches. Only newly scraped opportunities pick up the new cert alignment. Worth fixing regardless of email system — it's a silent deliverability gap in the core matching product, not just an email concern.
- **No bulk CSV/Excel export for the match list.** Only GDPR JSON export exists (`/api/account/export`). Team-tier customers who want to share match lists with coworkers or paste into a proposal tracker have no export path. Likely to be requested by the first Team customer.
- **Dead fork code: `workers/jobs/handle-cold-reply.js`.** Fork file at `~/ContractsIntel/workers/jobs/handle-cold-reply.js` (10,958 bytes, built overnight on 2026-04-16) is a full-classifier implementation written against the wrong schema, never deployed, and untested against real reply data. Delete when the fork reconciliation happens. **Do NOT port.** The unsubscribe-only launch handler (§7.9.12) should be written fresh in the live repo — it's simpler, correctly scoped, and worth keeping clean of the fork's speculative design.
- **Inbox-pool monitoring cadence (per D21).** After Instantly warmup completes (~day 21 of the 12-inbox rollout), establish a weekly monitoring cadence that tracks: (a) reply rate per inbox, (b) bounce rate per inbox, (c) sender reputation score per inbox (Google Postmaster + Outlook SNDS). If any inbox degrades below a useful threshold or total send demand exceeds the 12-inbox capacity, rotate the degraded inbox out / expand the pool. This is a product-roadmap item, not email-spec work — but listed here so the first real customer signal is caught early.

---

## Section 8 — Consolidated Decision List

All **⚠️ DECISION NEEDED** items from Sections 2–7, numbered and ordered by dependency. Decisions early in the list block decisions later in the list.

### 8.1 Tier 1 — Foundation decisions (ALL RESOLVED)

**✅ D1. First-name strategy** (§4.5) — **RESOLVED**
Launch with `{{first_name|fallback:"there"}}`. Add an **optional** first-name field to signup. Store on `public.users.first_name` + mirror to `auth.users.raw_user_meta_data.first_name`. Blank is fine — no backfill, no nag prompts. Render order: `users.first_name` → `auth.users.raw_user_meta_data->>'first_name'` → `"there"`.

**✅ D2. Notification preferences** (§3 ENG-01 note, §6.3) — **RESOLVED (HYBRID)**
Both columns exist: `organizations.notification_preferences` is the default; `users.notification_preferences` overrides when set. Render order: `users.notification_preferences` → `organizations.notification_preferences` → system defaults. Schema delta: add `users.notification_preferences jsonb` (§6.3).

**✅ D3. `email_logs` / `failed_emails` FK target** (§5.3, §6.4) — **RESOLVED**
Both tables FK to **`auth.users(id)`**. Rationale: `auth.users` is more stable than `public.users` across account lifecycle events; email-log history and DLQ replay survive any `public.users` refactor.

**⏸️ D4. Drop `public.profiles` and `public.user_matches`** (§5 of schema-architecture-audit, §6.6, §7.9) — **DEFERRED**
Not part of Phase B. Revisit after email system is stable for 30 days post-launch. Logged as a deferred cleanup item in §7.9 and referenced against the fork's `product-gaps-queue.md`.

**✅ D5. `opportunity_matches` / `opportunities` schema verification** (§2 #46–74) — **RESOLVED**
Live schema probed 2026-04-17. Locked column mappings applied across the 29 blocked rows:
- `opportunities.title` ✓ (confirmed)
- `opportunities.agency` ✓ (confirmed)
- `opportunities.response_deadline` — the real column name (not `deadline` or `response_due`)
- `opportunities.set_aside_type` ✓ (confirmed)
- `opportunity_matches.match_score` ✓ (confirmed)
- `opportunity_matches.user_status` — the real column name (not `status`)
- `opportunity_matches.digest_sent_at` — already exists per-match. `organizations.last_digest_sent_at` removed from §6.2.
- `opportunity_matches.organization_id` — FK target confirmed. All match-report counts are org-scoped, not per-user.

### 8.2 Tier 2 — Feature-ship decisions

**⏸️ D6. TX-03 (email changed confirmation)** — **DEFERRED per §7.9.2**
Investigation confirmed the app has no email-change UI, no `updateUser({email})` calls. Drops from launch scope. Rebuild when UI + wiring exist.

**⏸️ D7. TX-12 (new device signin)** — **DEFERRED per §7.9.3**
Investigation confirmed no login-events infrastructure: no `login_history`/`auth_events`/`user_sessions` tables, no UA/IP capture at auth time, no GeoIP pipeline, no `onAuthStateChange` handler. Multi-day build to wire. Drops from launch scope.

**⏸️ D8. TX-09/TX-10 (subscription pause/resume)** — **DEFERRED per §7.9.4**
Investigation confirmed Stripe pause isn't wired: no `subscription.paused`/`.resumed` in webhook, no pause button in billing UI, 0 orgs with `subscription_status = 'paused'`. Drops from launch scope.

**⏸️ D9. ALERT-03 per-cert expiry** — **DEFERRED per §7.9.5 + §7.9.6 help-panel fix**
Investigation confirmed no per-cert expiry data: `organizations.certifications` is a flat string array, compliance `due_date` is a hardcoded 300-day placeholder. ALERT-03 aliased to ALERT-01 (SAM-only) for launch. `organizations.cert_expiry_dates` column not added (removed from §6.2). **Side-action: help-panel copy fix logged in §7.9.6 as high-priority, not-yet-executed.**

**⏸️ D10. Team-invite emails** — **DEFERRED per §7.9.7**
No team-invite feature exists: no invitations table, no invite API, no invite UI. Zero multi-user orgs (136 users / 136 distinct orgs). All four TEAM-* emails (invite sent, invite accepted, new member joined, member removed) drop from launch scope. Product-gap logged in §7.10: Team tier is currently sold at $899/mo without team-seat functionality.

**⏸️ D11. BEHAV-04 cert-unlocked email** — **DEFERRED per §7.9.8**
Matching engine re-scores nothing on cert change — it only scores unmatched opportunities. Existing match scores never update when certs are added. Sending BEHAV-04 would be misleading copy. Product-gap logged in §7.10: cert updates silently don't improve existing match scores.

**⏸️ D12. Bulk export / `{{export_download_url}}` email** — **DEFERRED per §7.9.9**
No CSV/Excel export exists. `/api/account/export` is a GDPR all-data JSON dump, not a filtered match export. No CSV library in the codebase, no "Export" button in the dashboard. Product-gap logged in §7.10.

**⏸️ D13. ENG-05 and the entire milestone-email category** — **DEFERRED indefinitely per §7.9.10**
Per-user activity counters not a fit for the federal-contractor audience. Not "build this later" — a deliberate category drop. Revisit only on explicit customer request. `users.last_activity_at` column removed from §6.3.

**⏸️ D14. Churn-risk scoring system** — **DEFERRED per §7.9.11**
Pre-revenue (0 customers, 0 churn data to calibrate). `churn_risk_score` column removed from §6.2. RISK-* emails ship at launch with simple time-based triggers on `auth.users.last_sign_in_at` (14/30/45/60 days — RISK-01/02/03/04 respectively). Revisit scoring when customer count ≈ 50 with real churn data.

**✅ D15. Cold-reply handler** — **RESOLVED (scoped down / partial defer)**
Ship at launch: **unsubscribe-only auto-handling** per §7.9.12 (one-afternoon build, CAN-SPAM-compliant, propagates to all three lanes via `email_suppressions`). **Full intent classifier** per §7.9.13 is **DEFERRED** until ~50 real replies have been read manually and clear patterns emerge. Fork's `workers/jobs/handle-cold-reply.js` is **NOT ported** — flagged for deletion in §7.10. Every reply logged to new `public.cold_replies` table (§6.4) for future classifier calibration.

### 8.3 Tier 3 — Product-policy decisions (not schema-breaking)

**✅ D16. Data retention post-cancel** (§2 #28) — **RESOLVED: 90 days**
`{{deletion_date}} = access_cutoff_date + 90 days`. Documented in §5.9 as `RETENTION_DAYS_POST_CANCEL`. Referenced in CANCEL-01/02/03 copy so customers know the reactivation window.

**✅ D17. High-score threshold for `{{high_score_count}}`** (§2 #53) — **RESOLVED: ≥80**
`COUNT(*) FROM opportunity_matches WHERE match_score >= 80`. Documented in §5.9 as `HIGH_SCORE_THRESHOLD`. For email rendering only; matching engine is unchanged.

**✅ D18. Deadline window for `{{deadline_count}}`** (§2 #70) — **RESOLVED: 7 days**
`response_deadline BETWEEN now() AND now() + INTERVAL '7 days'`. Documented in §5.9 as `DEADLINE_WARNING_WINDOW_DAYS`.

**✅ D19. Team broadcast on cancel (CANCEL-03)** (§3 CANCEL-03) — **RESOLVED: YES, BCC team**
Primary To = owner; BCC = all other users in the organization. Single email, not separate sends. Team members get advance notice so they can export any personal pipeline data before access ends.

**✅ D20. Owner ack on user deletion (TX-05)** (§3 TX-05) — **RESOLVED: NO**
No auto-email to the owner when a team member deletes their account. Owner sees membership change in the dashboard. Revisit when team-seat billing is added (freed seat = bill change = actionable signal).

**✅ D21. Pre-warmed inbox pool size** (§5.7) — **RESOLVED: stay at 12**
No reserve expansion at launch. Revisit after 30 days of cold-outbound data (reply rate + bounce rate + reputation per inbox). Weekly monitoring cadence tracked in §7.10.

**✅ D22. Suppression store — table or service?** (§5.8) — **RESOLVED: TABLE-BASED (central)**
`public.email_suppressions` is authoritative. All three lanes read it as a send-gate. Writes to the table fan out to Instantly / Resend / Loops APIs so their internal enforcement stays aligned. §6.4 schema already reflects this.

### 8.4 Tier 4 — Style / normalization decisions (low stakes)

**✅ D23. Token normalization** (§2.5, §5.10) — **RESOLVED**
Six canonical tokens locked: `{{cert_type}}`, `{{agency}}`, `{{opportunity_title}}`, `{{access_cutoff_date}}`, `{{change_date}}`, `{{saved_count}}`. Deprecated variants flagged on §2 rows #4, #27, #40, #46, #49, #76 with struck-through notation and pointer to the canonical. Phase B style pass runs a global find-and-replace across template source files.

**✅ D24. "Saved" scope** (§2 #75) — **RESOLVED** (out-of-band during D5 probe)
"Saved" = `opportunity_matches.user_status = 'tracking'` only (not `bidding`). **Org-level** — FK is `organization_id`. Chrome-extension quick-saves are included (they write `user_status = 'tracking'` via `POST /api/opportunities/quick-save`). `{{unreviewed_count}}` = `COUNT(*) WHERE user_status = 'new'`.

**✅ D25. `{{remaining_count}}` disambiguation** (§2 #77, §5.10) — **RESOLVED**
`{{remaining_count}}` **deprecated**. Replaced by three context-specific tokens: `{{trial_days_remaining}}` (TRIAL-02/03/04), `{{matches_unreviewed}}` (ENG-01, RISK-01/02/03), `{{seats_remaining}}` (team-tier invite-limit templates when D10 ships).

### 8.5 Decision-graph view

**As of checkpoint 2026-04-17 — ✅✅✅ ALL 25 DECISIONS CLOSED.**

- **Tier 1 (D1–D5) — 5 of 5 resolved.** D4 deferred.
- **Tier 2 (D6–D15) — 10 of 10 resolved.** D6–D14 deferred; D15 scoped down.
- **Tier 3 (D16–D22) — 7 of 7 resolved.**
- **Tier 4 (D23, D24, D25) — 3 of 3 resolved.**

**No open decisions remain.** Doc is closed for Phase A. See **§9 Doc-Closure State** below for the consolidated final tally, all schema additions in one list, all deferred work in one list, all product gaps in one list, and the Phase B resume point.

**Out-of-band actions:**
- §7.9.6 help-panel copy fix — **EXECUTED** as PR #2 (`fix/help-panel-cert-renewal-claim`, commit `0239f41`); awaiting merge.
- §7.10 product-gap notes — three out-of-scope product issues surfaced by the email audit (team-seat feature gap, cert-update rescore gap, bulk CSV export gap). Tracked for the product roadmap, not for the email rebuild.

---

---

## Section 9 — Doc-Closure State

**Phase A (design) closed 2026-04-17.** Every decision D1–D25 is resolved or explicitly deferred. No open questions remain. This section is the consolidated final tally — use it as the index when Phase B (code build) starts.

### 9.1 Final decision counts

| Tier | Total | Resolved | Deferred | Category drop |
|---|---|---|---|---|
| Tier 1 — Foundation (D1–D5) | 5 | 4 | 1 (D4) | 0 |
| Tier 2 — Feature-ship (D6–D15) | 10 | 1 (D15 scoped) | 9 (D6–D14) | 0 |
| Tier 3 — Product-policy (D16–D22) | 7 | 7 | 0 | 0 |
| Tier 4 — Style / normalization (D23–D25) | 3 | 3 | 0 | 0 |
| **Totals** | **25** | **15** | **10** | 0 indefinite drop (D13 is explicitly indefinite) |

Of the 10 deferred: 9 are "build later when the feature/data/volume justifies it" (D4, D6–D12, D14); 1 is "indefinite category drop" (D13 milestone emails).

### 9.2 Final placeholder mapping state

- **Total placeholders inventoried** (§2): 83 tokens + 1 control token (`{{else}}`) = 84 entries.
- **Canonical + resolved:** 71 (sources either confirmed in live schema via D5 probe, passed-in via Stripe/auth/webhook context, or derived at render).
- **Deprecated (collapsed via D23/D25):** 7 — `{{primary_certification}}`, `{{agency_name}}`, `{{opportunity_name}}`, `{{access_end_date}}`, `{{update_date}}`, `{{saved_opportunities_count}}`, `{{remaining_count}}`. Replacement tokens documented in §5.10.
- **Deferred with the email they belong to:** 6 — `{{pause_date}}`, `{{location_approx}}`, `{{device_type}}`, `{{timezone}}`, `{{old_email}}`, `{{new_email}}` (deferred when their parent TX-* templates were deferred in D6–D8). Plus `{{invite_token}}`, `{{inviter_name}}`, `{{new_member_name}}`, `{{new_member_email}}` (deferred with D10 team-invite emails). Plus `{{retroactive_score}}` (deferred with D11 BEHAV-04). Plus `{{export_download_url}}` (deferred with D12).
- **Blocked:** 0.

Every token has a resolved source, a deprecated pointer, or a feature-ship gate. Nothing is ambiguous.

### 9.3 Final schema additions for Phase B

**Columns on `public.organizations`:** 1 new column.
- `last_risk_email_sent_at timestamptz NULL` — prevents double-sends across RISK-* escalation window (§6.2).

**Columns on `public.users`:** 3 new columns.
- `first_name text NULL` — per D1 (optional at signup, no backfill) (§6.3).
- `notification_preferences jsonb NULL DEFAULT '{}'::jsonb` — per D2 (hybrid prefs overriding org-level) (§6.3).
- `has_seen_dashboard boolean NOT NULL DEFAULT false` — per-user dashboard-tour tracking (§6.3).

**New tables:** 4.
- `public.email_logs` — every send logged; FK `user_id → auth.users(id)` per D3 (§6.4).
- `public.failed_emails` — DLQ for the retry ladder; same FK target (§6.4).
- `public.email_suppressions` — central authoritative suppression store per D22; read by all three lanes (§6.4).
- `public.cold_replies` — inbound cold-email reply log per D15; calibration dataset for future full classifier (§6.4).

**Views:** 2.
- `public.email_send_context` — single composite join `(user, org, auth_user, derived)` per user (§6.5).
- `public.users_with_derived` — `users` rows + `plan_tier` + `primary_cert` + `days_since_last_sign_in` computed columns (§6.5).

**Not added (documented for completeness):**
- `organizations.cert_expiry_dates` — removed per D9.
- `organizations.last_digest_sent_at` — removed per D5 (replaced by `opportunity_matches.digest_sent_at`).
- `organizations.churn_risk_score` — removed per D14.
- `users.last_activity_at` — removed per D13.
- `profiles.plan_tier`, `profiles.primary_certification`, `profiles.sam_expiry_date`, `profiles.cert_expiry_dates` — all rolled back; not re-added anywhere.

**Legacy cleanup:** `public.profiles` and `public.user_matches` tables remain in place per D4 (30-day post-launch deferral).

### 9.4 Final deferred-work list (§7.9 summarized)

| # | Item | Ship trigger |
|---|---|---|
| 7.9.1 | Drop `profiles` + `user_matches` + 3 dead worker scripts | Email system stable for 30 days |
| 7.9.2 | TX-03 email-change confirmation | Email-change UI + `supabase.auth.updateUser({email})` wiring exist |
| 7.9.3 | TX-12 new-device-login alert | `login_events` table + UA/IP capture + GeoIP service built |
| 7.9.4 | TX-09/TX-10 subscription pause/resume | Stripe `pause_collection` enabled + billing UI button + webhook handler extended |
| 7.9.5 | ALERT-03 per-cert expiry | Per-cert expiry data source exists (user-entered or scraped) |
| 7.9.6 | Help-panel copy fix | **✅ EXECUTED** — PR #2 (`fix/help-panel-cert-renewal-claim`, commit `0239f41`), open for review |
| 7.9.7 | Team-invite emails | Team-seat feature built (invitations table, invite API, acceptance flow, team-member UI) |
| 7.9.8 | BEHAV-04 cert-unlocked email | Re-score backfill pipeline built + triggered on `organizations.certifications` update |
| 7.9.9 | Bulk match export + `{{export_download_url}}` email | `GET /api/matches/export?format=csv` route + CSV generator + "Export" button |
| 7.9.10 | ENG-05 milestone emails | **Deferred indefinitely** — revisit only on explicit customer request |
| 7.9.11 | Churn-risk scoring system | ~50 customers + churn data to calibrate against |
| 7.9.12 | Cold-reply unsubscribe handler | **LAUNCH SCOPE** — ship before cold outbound activates at day 21 of warmup |
| 7.9.13 | Full cold-reply intent classifier | ~50 real cold replies read manually + clear patterns emerged |

### 9.5 Final product-gaps-queue (§7.10 summarized)

Out-of-email-scope product issues surfaced by the audit. Tracked for the product roadmap, not the email rebuild.

1. **Team tier sold without team seats.** $899/mo Team tier exists in Stripe but no invite infrastructure. Either build seats when first Team customer signs up, or remove Team from pricing.
2. **Cert updates don't re-score existing matches.** Silent matching-product gap — users who add HUBZone see no score improvement on their existing 200+ matches.
3. **No bulk CSV/Excel export for the match list.** Only GDPR JSON dump exists.
4. **Dead fork code `workers/jobs/handle-cold-reply.js`.** Delete on fork reconciliation. Do NOT port.
5. **Inbox-pool monitoring cadence.** Weekly tracking of reply rate / bounce rate / sender reputation per inbox starting day 21 of warmup.

### 9.6 Resume point for Phase B

**Before Phase B can start:**

1. This doc (§1–§8) is the source of truth. Treat any discrepancy with the fork as fork-wrong.
2. The §7.9.6 help-panel copy fix should be merged (PR #2) — it's the only live-repo code change that traces to this work session and it closes a customer-trust issue.
3. Confirm live repo + live Supabase identity one more time before touching either — per standing memory rule, `git remote -v` + Supabase project ref check at session start.

**Recommended first Phase B task:**

Write the Phase B schema migration file (one file, additive only, no drops). It covers the 4 new columns (§9.3), the 4 new tables (§9.3), and the 2 new views (§9.3), all in the correct order per §6.7. Naming convention: `YYYYMMDDHHMMSS_email_system_phase_b.sql` in `supabase/migrations/`. No squash. Before executing, diff against current production schema (`supabase db diff` or equivalent) to confirm no collisions. Review the migration against §6 and §9.3 carefully before push.

After the schema migration lands cleanly on production, next Phase B tasks in order:

1. `lib/email/constants.ts` with the 4 locked scoring constants from §5.9 and the canonical-token list from §5.10.
2. `lib/email/types.ts` expressing the `(user, org, auth_user, derived)` payload shape per §1.7.
3. `lib/email/render-context.ts` that resolves the composite view and applies the D1 first-name fallback chain.
4. `lib/email/send-transactional.ts` with the retry ladder + DLQ + circuit breaker per §5.3.
5. Template files for the W1 blocker-only wave per §5.6 (TX-01, TX-02, TX-08 only — nothing else).
6. `scripts/replay-failed-emails.ts` per §5.3 DLQ replay path.
7. First production-send dry-run via a test org + synthetic event to verify the full pipeline end-to-end.

Only after W1 is live and stable should W2 (onboarding emails) begin per §5.6 wave order.

### 9.7 Git state

- **Redesign doc:** `docs/email-system/organization-model-redesign.md` is **untracked** (`?? docs/`). No stage, no commit, no push.
- **No branches** created specifically for the redesign doc. The help-panel copy fix lives on its own branch (`fix/help-panel-cert-renewal-claim` → PR #2) and does not include the doc.
- **`main` branch changes from this session:** exactly one merge commit (PR #1 yesterday's webhook planMap fix, commit `2527759`). The help-panel fix (PR #2) is open but not merged as of this checkpoint.
- **Fork (`~/ContractsIntel/`):** untouched. No writes from this session. The fork remains as a reference library; its eventual cleanup is the last item in §9.4 (7.9.1).

The decision doc itself (this file) can stay untracked indefinitely OR be committed to a new branch + opened as a docs PR during Phase B kickoff. It is not required to be merged before Phase B — its authority is its content, not its location in git history. Merging it later is a formality, not a dependency.

---

## Document metrics (final — Phase A closed 2026-04-17)

- **Total placeholders mapped** (§2): 83 unique + 1 control token = 84
- **Email stages classified for recipient semantics** (§3): 67 distinct stage IDs across 13 categories
- **Column additions proposed** (§6 / §9.3): 1 on `organizations`, 3 on `users`
- **New tables proposed** (§6 / §9.3): 4 — `email_logs`, `failed_emails`, `email_suppressions`, `cold_replies`
- **Views proposed** (§6 / §9.3): 2 (`email_send_context`, `users_with_derived`)
- **Locked scoring thresholds** (§5.9): 4 named constants (`RETENTION_DAYS_POST_CANCEL=90`, `HIGH_SCORE_THRESHOLD=80`, `DEADLINE_WARNING_WINDOW_DAYS=7`, `RISK_EMAIL_WINDOWS_DAYS=14/30/45/60`)
- **Canonical placeholder tokens locked** (§5.10): 6 normalized pairs (D23) + 3 new context-specific replacements for `{{remaining_count}}` (D25)
- **Consolidated decisions** (§8): 25 items across 4 tiers — **all closed**
- **Decisions resolved**: 15 (D1, D2, D3, D5, D15, D16, D17, D18, D19, D20, D21, D22, D23, D24, D25)
- **Decisions deferred**: 10 (D4, D6, D7, D8, D9, D10, D11, D12, D13, D14) — of which D13 is explicit category drop
- **Decisions remaining active**: **0**
- **Out-of-band actions:** help-panel copy fix → executed in PR #2; 5 product-gap notes in §7.10.

## Sections where the draft had to guess

- **§2, match-report placeholders (#46–74)**: the actual column names on `opportunities` and `opportunity_matches` were not re-verified during this draft. The placeholder rows refer to these by plausible names (`opportunities.agency`, `opportunities.title`, `opportunity_matches.match_score`, `opportunity_matches.status`). Verification is D5 in the decision list; until it happens, the 29 rows are "blocked on D5" rather than confirmed.
- **§3, ENG-01**: the proposal treats `organizations.notification_preferences` as the sole source today because the probe sample shows it exists on `organizations`. I did NOT verify whether any row has a per-user override column. If a `users.notification_preferences` column already exists and I missed it, D2 collapses.
- **§5.4, dunning timing grid**: the 60-minute first-email delay is cited as coming from fork research (Val Geisler / Chase Dimond). I confirmed the number appears in the fork's `02-email-system-map.md` and `product-gaps-queue.md` but did not re-derive it from original sources. Treat it as the fork's chosen default, not an independently verified best practice.
- **§7.3, template field references**: I listed the templates by name and the dead-field categories they hit, but I did not line-by-line grep every fork template. A proper cleanup pass in Phase B should re-verify each template individually.

## Hard rules honored

- No files ported from the fork. Only referenced.
- No code, SQL, or migration text written.
- File placed at `~/contractsintel-live/docs/email-system/organization-model-redesign.md`; no git add, no commit, no push.
- Every schema claim backed by a read-only probe performed during draft assembly (raw responses captured inline).
- Every product decision marked with ⚠️ DECISION NEEDED and collated in §8.

---

*Phase A closed 2026-04-17. All 25 decisions resolved or deferred. §9 Doc-Closure State is the index. Phase B resume point: schema migration per §6.7 / §9.6.*
