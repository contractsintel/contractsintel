# ContractsIntel — Full Platform Stress-Test & Self-Heal Loop

You are going to stress-test every product, service, and feature ContractsIntel offers — starting with signup/onboarding and extending through the entire platform — by creating many fake accounts with drastically different profiles, exercising every capability end-to-end, observing what works and what breaks, fixing the problems, and re-testing. You will not stop until the entire platform works absolutely perfectly.

## Authority

You have full permission from the owner to do whatever is necessary to complete this mission:

- Read, write, edit, and delete any file in the repo
- Run any command, install dependencies, modify configs
- Create/modify/drop tables in the dev database
- Create, modify, and delete test accounts
- Refactor code, add new files, change schemas, write migrations
- Add tests, logging, telemetry, feature flags
- Restart the dev server, clear caches, rebuild

No need to ask for confirmation on routine changes. The only hard rules are the Ground Rules below.

## Ground rules

1. **Never run against production.** Use a local dev environment (`npm run dev` on port 3100 in `/private/tmp/contractsintel-repo`) pointed at the staging Supabase (`ahlxyfrswyacrciqcngw.supabase.co`) or a local Supabase. If only a prod `.env` exists, stop and ask me before touching any database. Do not create fake accounts or mutate data on contractsintel.com.
2. Use the `preview_*` tools (NOT Claude-in-Chrome, NOT Bash curl) to drive the browser.
3. Read the full codebase before you begin: `app/**`, `lib/**`, `lib/supabase/**`, `public/**`, and all docs (`CLAUDE.md`, etc.). Build a complete mental model of every product surface before testing.
4. Track progress with TodoWrite. One todo per product area per round.

## Platform context — 22 products across 3 tiers

ContractsIntel is a federal contract intelligence platform with 22 products gated across 3 subscription tiers. During the 14-day free trial, ALL features are unlocked.

### Discovery — $99/mo (7 products)
1. **Opportunity Intelligence + Daily Digest** — AI-scored contract matches from SAM.gov, delivered by email at 7am
2. **Compliance Alerts** — Basic compliance monitoring and alerts
3. **Pipeline Tracker** — Kanban-style pipeline for tracking opportunities (bid/pass/save)
4. **Google Calendar Sync** — Deadlines pushed to calendar automatically
5. **SAM.gov Profile Audit** — Automated audit of SAM.gov registration
6. **Slack & Teams Webhooks** — Push opportunity alerts to Slack or Microsoft Teams channels
7. **Copilot AI Chat** — Conversational assistant grounded in tenant data

### BD Pro — $299/mo (adds 11 → 18 total)
8. **AI Proposal First Drafts** — Auto-generated proposal sections from opportunity data
9. **Proposal Pink-Team Review** — AI scores draft proposals against evaluation criteria (strengths/weaknesses/compliance gaps per section)
10. **RFP Document Chat** — Upload any RFP/solicitation PDF and ask AI questions about it
11. **Proposal Outline Generator** — AI reads RFP shred data and builds annotated outlines with page budgets
12. **Capability Statement PDF** — One-click professional PDF export from past performance data
13. **Full Compliance (CMMC + FAR)** — Comprehensive compliance monitoring
14. **Past Performance Builder** — Track and format past performance records
15. **Contract Delivery Dashboard** — Active contract management
16. **State + Local Monitoring** — State and local opportunity tracking
17. **Agency Relationship Mapping** — Track contracting officers and agency relationships
18. **Weekly Pipeline Report** — Automated weekly pipeline summary

### Team — $899/mo (adds 4 → all 22)
19. **CPARS Monitor** — Track contractor performance ratings
20. **Subcontracting Network** — Primes post teaming needs, subs respond
21. **Competitor Intelligence** — Auto-built competitor profiles from USASpending + FPDS
22. **Market Intelligence** — USASpending spending data by NAICS codes
- Also: Agency Heat Maps, Contract Vehicle Alerts, Loss Analysis, Prompt Payment Enforcement, Unlimited Team Users, API Access

### Key feature gating logic (`lib/feature-gate.ts`)
- `isTrialActive(org)` — checks `subscription_status === "trialing"` and `trial_ends_at > now`
- `canAccess(tier, feature, trialActive)` — during trial, ALL features unlocked
- `isBdProOrHigher(tier, org)` — gates BD Pro features (proposals, RFP chat, pink-team, outline, capability PDF)
- `isTeam(tier, org)` — gates Team features (CPARS, competitors, market intel)
- Expired trials redirect to `/expired` with plan recommendation based on usage

### Key API routes
- `POST /api/documents/chat` — RFP Document Chat (Anthropic streaming)
- `POST /api/proposals/review` — Pink-Team Review scoring
- `POST /api/proposals/outline` — Proposal Outline Generator
- `GET /api/capability-statement/pdf` — Capability Statement PDF (PDFKit)
- `GET /api/analytics/spending` — USASpending Market Intelligence
- `POST /api/webhooks/test` — Webhook test endpoint
- `POST /api/copilot/stream` — Copilot AI chat (Anthropic SSE streaming)
- `POST /api/checkout` — Stripe checkout session
- `GET /api/cron/send-digests` — Daily digest email (Resend)
- `GET /api/cron/match-opportunities` — Opportunity matching cron

## Discover every product and service first

Before round 1, produce `./test-runs/inventory.md` cataloging every product, service, feature, page, API route, and integration the platform exposes. This should include (but is not limited to — discover what actually exists):

- Signup / login / password reset / email verification
- Onboarding questionnaire (certifications, NAICS, company description, etc.)
- Dashboard and every tab/section (pipeline, opportunities, analytics, settings)
- SAM.gov monitoring / opportunity feed / match scoring
- Opportunity detail pages, bid/pass/save actions
- SAM.gov profile audit tool
- **RFP Document Chat** — upload PDF, ask AI questions (BD Pro+)
- **Proposal drafting** — AI-generated proposal sections
- **Proposal Pink-Team Review** — AI scoring of draft proposals (BD Pro+)
- **Proposal Outline Generator** — AI outlines from RFP data (BD Pro+)
- **Capability Statement PDF** — one-click PDF export (BD Pro+)
- **Market Intelligence** — USASpending data by NAICS (Team)
- **Slack & Teams Webhooks** — configure and test webhook alerts (All plans)
- **Copilot AI Chat** — conversational assistant in dashboard
- Alerts / notifications / digest emails (daily digest via Resend)
- Past Performance Builder + capability statement management
- Contract Delivery Dashboard (BD Pro+)
- CPARS Monitor (Team)
- Subcontracting Network (Team)
- Competitor Intelligence (Team)
- Compliance monitoring (basic for Discovery, full for BD Pro+)
- Pipeline Tracker with Kanban board
- Google Calendar Sync
- Agency Relationship Mapping (BD Pro+)
- Team features, invites, roles, permissions (Team)
- Billing, plans, trial management, upgrade/downgrade, expired trial paywall
- Settings, profile, certifications edit, NAICS edit, webhook configuration
- Every API route under `app/api/**`
- Tour system (`app/dashboard/tour.tsx`) and Help Panel (`app/dashboard/help-panel.tsx`)
- Get Started guide (`app/dashboard/get-started/page.tsx`)

For each item, document: URL/entry point, required auth state, required tier, inputs, expected outputs, dependencies, and how you will test it.

## The test matrix — 10 personas per round

For each round, generate 10 accounts varying drastically across every dimension. No repeats across rounds.

- **Company size/stage:** solo consultant, 3-person LLC, 50-person firm, 500-person prime
- **Certifications:** none, single (8(a)), stacked (8(a) + HUBZone + WOSB + SDVOSB), edge case (EDWOSB only)
- **NAICS:** single, 10+, custom codes not in preset list, wildly off-topic combinations
- **Company description:** empty, 1 word, 5000+ chars, emoji-only, multilingual (Spanish, Arabic RTL, Chinese), injection payloads (`<script>alert(1)</script>`, `'; DROP TABLE users; --`), markdown, newlines, quotes
- **Names:** unicode (José, 李明), very long, hyphenated, single name, O'Brien
- **Emails:** plus-addressing, subdomains, uppercase, very long local-part — dev-only domain (@ci-test.local or mailtrap catch-all)
- **Passwords:** exactly 8 chars, 100+ chars, unicode, whitespace-padded
- **Flow behavior:** abandon mid-form, double-click submit, back-button, refresh mid-questionnaire, slow-fill vs instant-fill
- **Subscription tier:** vary across Discovery, BD Pro, Team, and active trial — to test feature gating across all tiers
- **Trial status:** active trial (all features), expired trial (paywall), paid subscription

Persist each persona spec as JSON in `./test-runs/round-N/personas.json` before running.

## What to exercise for each account

For each of the 10 accounts, run the entire user journey across every product in the inventory — not just signup. For each persona:

1. Sign up + complete onboarding
2. Land on dashboard, exercise every widget/section
3. Use every feature available on their plan:
   - **All tiers:** Search/filter opportunities, save to pipeline, bid/pass, view match details, check compliance alerts, trigger calendar sync, configure Slack/Teams webhooks (test delivery), use Copilot AI chat, run SAM.gov audit
   - **BD Pro+:** Generate proposal drafts, run Pink-Team Review on drafts, upload RFP and use Document Chat, generate Proposal Outline, export Capability Statement PDF, view contract delivery dashboard, check full compliance
   - **Team:** View CPARS ratings, browse subcontracting network, check competitor intelligence, view Market Intelligence (USASpending data), access agency heat maps
4. Verify feature gating: try to access features ABOVE their tier — should be blocked/hidden
5. Trigger background workers / cron jobs that should run for them; verify results surface correctly
6. Hit every API route reachable from the UI and verify responses
7. Edit their profile (change certs, NAICS, description) and verify persistence + re-matching
8. Log out, log back in, verify state preserved
9. Test the expired trial flow: if trial user, simulate expiration and verify `/expired` paywall with correct plan recommendation
10. Attempt malicious / edge actions (IDOR — reading another test user's data, CSRF, unauth API calls, oversized payloads, rapid-fire requests)

## What to record

- Persona JSON
- `preview_screenshot` at each major step
- `preview_console_logs` — every JS error/warning
- `preview_network` — every failed request, 4xx/5xx, slow call (>2s)
- `preview_logs` — Next.js server errors, worker errors
- Supabase state after each mutation: query the relevant tables to verify rows match input byte-for-byte
- Feature gating correctness: document which features were visible/hidden vs expected for each tier
- AI feature quality: did RFP Chat, Pink-Team Review, Proposal Draft, Outline Generator, and Copilot return sensible responses? Any hallucinations or errors?
- PDF generation: did Capability Statement PDF download successfully? Is the content correct?
- Webhook delivery: did Slack/Teams test webhooks fire correctly?
- Worker job results, queue depth, dead-letter items
- Time to complete each step
- UX friction a human would notice

Save to `./test-runs/round-N/results.md` with a section per persona per product.

## The report (per round)

`./test-runs/round-N/report.md` with:

- **Coverage matrix** — products tested × personas, pass/fail cell grid (all 22 products × 10 personas)
- **Bugs found** — reproducible failures, ranked P0 → P3, with exact repro, expected vs actual, root-cause hypothesis after reading source
- **UX issues** — things that technically work but hurt the user
- **Data integrity issues** — any case where persisted data doesn't match input
- **Security concerns** — injection, auth bypass, IDOR, missing rate limits, PII exposure, missing email verification enforcement, CSRF, XSS
- **Feature gating issues** — any case where tier access is wrong (user sees features they shouldn't, or doesn't see features they should)
- **AI quality issues** — hallucinations, empty responses, streaming errors, wrong model behavior
- **Performance issues** — slow queries, slow pages, N+1s, worker backlogs
- **Suggested additions** — fields, validation, progress indicators, save-and-resume, accessibility fixes, etc., each justified
- **Proposed fixes** — for each issue, the specific file + change you will make

## The self-heal loop

```
round = 1
loop forever:
  1. Generate 10 drastically different personas → personas.json
  2. Run each persona through the ENTIRE platform (every product in inventory.md)
  3. Collect all evidence
  4. Write results.md and report.md
  5. Post a 1-paragraph summary + bug count in chat, share preview URL
  6. WITHOUT WAITING for approval, implement ALL fixes from the report
     (you have full permission — just do it)
  7. Verify each fix: dev server compiles cleanly, existing features still work,
     the specific repro is gone
  8. Write ./test-runs/round-N/fixes.md documenting what was changed and why
  9. round += 1
  10. If exit criteria met (see below) → stop and produce final report
      Else → continue to next round
```

You cannot stop until exit criteria are met. Pause only if:

- A hard Ground Rule would be violated (prod DB access, missing dev env)
- You need a secret/credential you cannot obtain (Stripe test keys, etc.)
- You have made 3 consecutive attempts at the same bug and cannot resolve it — in which case, document thoroughly and ask for help on that specific issue, then continue with everything else

## Definition of "absolutely perfect" (exit criteria)

A round passes when all of these hold across every product in the inventory:

- 10/10 personas complete every user journey without JS errors, 4xx/5xx, or server errors
- 10/10 DB rows match input exactly (no truncation, encoding loss, dropped fields)
- 0 P0/P1/P2 bugs; P3s documented and triaged
- 0 data integrity issues
- 0 security concerns
- 0 feature gating errors (every tier sees exactly the right set of products)
- 0 new UX issues worth flagging
- Injection payloads safely handled (escaped on render, never executed)
- Unicode + RTL render correctly on every page that displays user input
- Validation errors are clear, inline, preserve user input
- Refresh/back-button/double-submit never corrupt state
- Background workers complete successfully for every persona
- Every API route returns correct, safe responses under auth and under attack
- Every page loads in <2s on the dev server
- All 22 products function correctly end-to-end for their respective tiers
- AI features (Copilot, RFP Chat, Pink-Team, Outline, Proposals) return valid responses
- PDF generation (Capability Statement) succeeds without errors
- Webhook delivery (Slack/Teams) fires correctly
- Trial → expired → paywall flow works with correct plan recommendations
- Accessibility: keyboard navigation + screen-reader labels work on every interactive element

## Final report

When exit criteria are met, produce `./test-runs/FINAL-REPORT.md` summarizing:

- Total rounds run
- Total bugs found + fixed, categorized
- Coverage matrix across all rounds (22 products × all personas × all rounds)
- Before/after metrics (errors, perf, UX scores)
- Remaining P3 items with rationale for deferral
- Suggested next steps for the product

## Cleanup

At the end of each round, delete test `auth.users` + profiles + any related rows so the dev DB stays clean. Keep screenshots and logs under `./test-runs/round-N/`.

## Start now

1. Read the entire codebase listed under Ground Rules step 3
2. Produce `./test-runs/inventory.md` (must include all 22 products)
3. Confirm dev environment is safe (staging Supabase, not prod)
4. `preview_start` the dev server
5. Begin round 1
6. Loop until absolutely perfect
7. Share the preview URL at the end of every round
