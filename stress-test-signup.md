# ContractsIntel — Signup & Onboarding Stress-Test Loop

You are going to stress-test the ContractsIntel signup and onboarding flow by creating many fake accounts with drastically different profiles, observing what works and what breaks, fixing the problems, and re-testing — looping until the flow is flawless.

## Ground rules

1. **Never run against production.** Use a local dev environment (`npm run dev` on port 3100 in `/private/tmp/contractsintel-repo`) pointed at the staging Supabase (`ahlxyfrswyacrciqcngw.supabase.co`) or a local Supabase. If only a prod `.env` exists, stop and ask me before touching any database. Do not create fake accounts on contractsintel.com.
2. Use the `preview_*` tools (NOT Claude-in-Chrome, NOT Bash curl) to drive the browser. Start with `preview_start` on the local dev URL (port 3100).
3. Read these files before you begin so you know the full flow end-to-end (signup → email confirm → questionnaire → certifications → NAICS → company description → dashboard):
   - `app/signup/page.tsx`, `app/login/page.tsx`
   - `lib/supabase/middleware.ts`
   - `app/onboarding/**`
   - `app/dashboard/**` (all pages)
   - `app/expired/page.tsx`
   - `lib/feature-gate.ts` (3-tier gating: Discovery $99, BD Pro $299, Team $899)
   - `app/api/**` (all API routes)
   - `CLAUDE.md` if it exists
4. Track progress with TodoWrite. One todo per round.

## Platform context — 22 products across 3 tiers

The platform has 22 products. After onboarding, users land on a dashboard with access gated by tier:

**Discovery (7 products):** Opportunity Intelligence + Daily Digest, Compliance Alerts, Pipeline Tracker, Google Calendar Sync, SAM.gov Profile Audit, Slack & Teams Webhooks

**BD Pro adds (11 more → 18 total):** AI Proposal First Drafts, Proposal Pink-Team Review, RFP Document Chat, Proposal Outline Generator, Capability Statement PDF, Full Compliance (CMMC + FAR), Past Performance Builder, Contract Delivery Dashboard, State + Local Monitoring, Agency Relationship Mapping, Weekly Pipeline Report

**Team adds (4 more → all 22):** CPARS Monitor, Subcontracting Network, Competitor Intelligence, Agency Heat Maps, Contract Vehicle Alerts, Market Intelligence, Unlimited Team Users, API Access, Loss Analysis, Prompt Payment Enforcement

During the 14-day free trial, ALL 22 products are unlocked regardless of tier.

## The test matrix — 10 personas per round

For each round, generate 10 accounts that vary drastically across every dimension. Do not repeat personas across rounds. Cover things like:

- **Company size/stage:** solo consultant, 3-person LLC, 50-person firm, 500-person prime
- **Certifications:** none, single (8(a)), stacked (8(a) + HUBZone + WOSB + SDVOSB), edge case (EDWOSB only)
- **NAICS:** single code, 10+ codes, codes NOT in the preset list (test custom entry if supported), wildly off-topic combinations (construction + software)
- **Company description / worded message:** empty, 1 word, 5000+ characters, emoji-only, multilingual (Spanish, Arabic RTL, Chinese), HTML/script injection attempts (`<script>alert(1)</script>`, `'; DROP TABLE`), markdown, newlines, quotes
- **Names:** unicode (José, 李明), very long, hyphenated, single name, apostrophes (O'Brien)
- **Emails:** plus-addressing (test+1@…), subdomains, uppercase, very long local-part — use a dev-only domain like @ci-test.local or a mailtrap catch-all
- **Passwords:** exactly 8 chars, 100+ chars, unicode, common-password, whitespace-padded
- **Flow behavior:** abandon mid-form and return, double-click submit, back-button after submit, refresh mid-questionnaire, slow-fill vs instant-fill
- **Subscription tier:** vary across Discovery, BD Pro, Team, and trial (to test feature gating post-onboarding)

Persist each persona spec as JSON in `./test-runs/round-N/personas.json` before running, so results are reproducible.

## What to record for each account

For each of the 10 accounts, capture:

- Persona JSON used
- `preview_screenshot` at each step (signup form, post-submit, questionnaire, dashboard landing, expired/paywall page if trial ended)
- `preview_console_logs` — every JS error/warning
- `preview_network` — every failed request, 4xx/5xx, slow call (>2s)
- `preview_logs` — server-side errors from the Next.js dev server
- Supabase state after signup: query `users`, `organizations`, `auth.users`, and any related tables to verify the row was written correctly (cert array intact? NAICS codes stripped properly? company description preserved byte-for-byte? `subscription_tier` set correctly?)
- Time to complete each step
- Any UX friction you noticed as a human would (confusing labels, missing validation feedback, jarring theme changes, etc.)
- After landing on dashboard: verify the correct features are visible/hidden based on tier and trial status (feature gating via `lib/feature-gate.ts`)

Save everything to `./test-runs/round-N/results.md` with a per-persona section.

## The report

After each round, produce `./test-runs/round-N/report.md` with:

- **Bugs found** — reproducible failures, ranked P0 → P3. Include exact repro steps, expected vs actual, and your root-cause hypothesis after reading the source.
- **UX issues** — things that technically work but hurt the user. Be specific.
- **Data integrity issues** — anything where the DB row doesn't match what the user entered.
- **Security concerns** — injection, auth bypass, rate-limit absence, PII exposure, missing email verification enforcement.
- **Feature gating issues** — any case where a user sees features they shouldn't (or doesn't see features they should) based on their tier/trial status.
- **Suggested additions** — fields, validation, progress indicators, save-and-resume, social login, better error messages, accessibility fixes. Justify each one.
- **Proposed fixes** — for each bug/issue, the specific file + change you intend to make.

## The loop

```
round = 1
loop:
  1. Generate 10 drastically different personas → personas.json
  2. Run each persona end-to-end through signup + onboarding via preview_*
  3. After onboarding, verify dashboard feature gating matches their tier
  4. Collect all evidence (screenshots, logs, network, DB state)
  5. Write results.md and report.md for the round
  6. Present the report to me in chat with a 1-paragraph summary + bug count
  7. Wait for my "go" — then implement ALL fixes from the report
  8. Verify each fix compiles and the dev server still runs cleanly
  9. round += 1
  10. Repeat until a full round produces ZERO P0/P1 bugs, ZERO data integrity
      issues, ZERO security concerns, and no new UX issues you'd flag.
```

## Definition of "perfect" (exit criteria)

A round passes when all of these hold:

- 10/10 accounts complete signup + full onboarding without JS errors, 4xx/5xx, or server errors
- 10/10 DB rows match input exactly (no truncation, encoding loss, or dropped fields)
- 10/10 accounts land on dashboard with correct feature visibility for their tier
- 0 P0/P1 bugs, 0 data integrity issues, 0 security concerns
- No new UX issues you'd flag to a founder
- Injection payloads are safely handled (escaped on render, not executed)
- Unicode + RTL render correctly on signup, questionnaire, and dashboard
- Validation errors are clear, inline, and don't lose user input
- Refresh/back-button/double-submit don't corrupt state
- Trial users see all 22 products; expired trial users see the paywall (`/expired`) with correct plan recommendations

## Cleanup

At the end of each round, delete the 10 test `auth.users` + their profiles rows so the dev DB stays clean. Keep the screenshots and logs.

## Start now

1. Read the files listed under "Ground rules" step 3.
2. Confirm the dev environment is safe (staging Supabase, not prod).
3. `preview_start` the dev server.
4. Begin round 1.
5. Finish each round by sharing the dev preview URL so I can spot-check.
