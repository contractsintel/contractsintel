# Credential Rotation Playbook

**Purpose:** If the Apr 23 00:05 UTC SAM probe returns 429 against the rotated key, the attacker has code or env access (not just the old SAM key). That triggers a full credential sweep. This document is the pre-prepped checklist so execution is fast.

**Do NOT rotate based on this document alone.** Rotation executes only after probe-green/probe-red decision.

**Trigger conditions:**
- **Probe green (200):** External burn on old SAM key only. No sweep needed. Close this playbook.
- **Probe red (429):** Attacker has access to one of: Vercel envs, GitHub repo, Supabase `api_keys` table, local `.env`, or a developer machine. Full sweep.

**Rotation priority order** (if sweeping): Supabase service role → GitHub PAT → Vercel token → everything downstream. Don't let the attacker re-exfiltrate new keys while you're rotating.

---

## 1. Supabase

### SUPABASE_SERVICE_ROLE_KEY
- **Stored in:** Vercel env (`SUPABASE_SERVICE_ROLE_KEY`), Railway env, local `/Users/raphaelhertz/ContractsIntel/.env` line 4, possibly GitHub Actions secrets.
- **Grants:** Full read-write on all Supabase tables, bypasses RLS. **Admin blast radius.**
- **Rotate:** Raphael. Supabase dashboard → Project Settings → API → "Reset service_role key". URL: https://supabase.com/dashboard/project/qpyskwvhgclrlychhxjk/settings/api
- **Time:** 2 min rotation + 5 min propagation (Vercel env update, Railway redeploy).
- **Blast radius if compromised:** Total. Attacker can read/write every table including `api_keys`, `leads`, `organizations`, `contracts`. Treat as highest priority.

### NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable)
- **Stored in:** Vercel env (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), local `.env` line 3.
- **Grants:** RLS-constrained read/write. Publicly shipped to browser by design.
- **Rotate:** Raphael, only if service role rotated (pair rotation). Same dashboard.
- **Time:** 2 min + redeploy.
- **Blast radius:** Limited to whatever RLS permits. Low on its own, but stale one breaks the frontend.

### SUPABASE_DB_PASSWORD
- **Stored in:** Local `.env` line 5. NOT in Vercel (we use REST, not direct Postgres).
- **Grants:** Direct Postgres connection as `postgres` role — **bypasses everything including RLS and triggers**.
- **Rotate:** Raphael. Supabase dashboard → Project Settings → Database → Reset database password.
- **Time:** 1 min. No deploy needed (unused in prod runtime).
- **Blast radius:** Total, if an attacker ever made a direct pg connection. Low actual use surface.

### Supabase Management PAT (`sbp_…` — see local `.env`/shell)
- **Stored in:** Claude's working memory + local shell history. NOT in repo or Vercel.
- **Grants:** Full Management API — can read/write schema, run SQL, manage projects on Raphael's account.
- **Rotate:** Raphael. https://supabase.com/dashboard/account/tokens — revoke old, generate new.
- **Time:** 1 min.
- **Blast radius:** Account-level admin. Highest-sensitivity token in the stack after service role.

---

## 2. GitHub

### GitHub PAT (`ghp_…` — stored in macOS Keychain)
- **Stored in:** macOS Keychain (`security` cmd), used by Claude for API calls. NOT in repo.
- **Grants:** Repo scope on `contractsintel/contractsintel` — read, write, open PRs, push branches.
- **Rotate:** Raphael. https://github.com/settings/tokens → revoke, regenerate with same scopes, update Keychain.
- **Time:** 3 min.
- **Blast radius:** Repo code access. Attacker can push malicious commits, exfil private repo contents. No org-admin.

### GitHub Actions secrets (if any)
- **Check:** https://github.com/contractsintel/contractsintel/settings/secrets/actions
- **Likely contents:** SUPABASE_ACCESS_TOKEN, VERCEL_TOKEN, possibly test keys.
- **Rotate:** Update each after upstream rotation completes.
- **Time:** 30 sec per secret.

---

## 3. Vercel

### VERCEL_TOKEN (`vcp_…` — see local `.env` line 30)
- **Stored in:** Local `.env` line 30.
- **Grants:** Team-level API access — read/write env vars, trigger deploys, view logs for team `team_6Y1lptvuffz3RgE0vwP5fQTI`.
- **Rotate:** Raphael. https://vercel.com/account/tokens → delete, create new.
- **Time:** 2 min. Update local `.env`.
- **Blast radius:** Team-wide. Can modify env vars on any project in the team — high risk.

### CRON_SECRET
- **Stored in:** Vercel env only (not local). Protects `/api/cron/*` endpoints.
- **Grants:** Ability to invoke cron jobs on-demand.
- **Rotate:** Vercel dashboard → Project → Settings → Environment Variables. Regenerate with random 32-byte string.
- **Time:** 2 min + redeploy.
- **Blast radius:** Can spam cron endpoints; limited damage beyond quota burn.

---

## 4. SAM.gov

### SAM_API_KEY, SAM_API_KEY_INGEST (`SAM-…` — see `.env` lines 51–52; rotated Apr 22)
- **Stored in:** Local `.env` lines 51-52, Vercel env, Supabase `api_keys` table (`key_name='sam_api_key'`).
- **Grants:** 1000 calls/day against api.sam.gov for Raphael's account.
- **Rotate:** **Already rotated Apr 22.** Next rotation: https://sam.gov → Profile → Account Details → API Key → Regenerate.
- **Time:** 5 min (sam.gov UI is slow).
- **Blast radius:** Quota burn only. Attacker gets a 1000/day SAM quota. No PII.

---

## 5. Email & Messaging

### RESEND_API_KEY (`re_…`)
- **Stored in:** Local `.env` line 10, Vercel env.
- **Grants:** Send email as `intel@contractsintel.com` via Resend.
- **Rotate:** Raphael. https://resend.com/api-keys → revoke, create new with send scope.
- **Time:** 2 min.
- **Blast radius:** Attacker can send email as us → reputational damage, phishing, domain blacklisting. **Medium-high.**

### INSTANTLY_API_KEY (base64, workspace-scoped)
- **Stored in:** Local `.env` line 15, Vercel env.
- **Grants:** Full control over Instantly workspace `b56d70db-212c-485d-ab45-81ada3f8f27f` — campaigns, leads, mailboxes, sends.
- **Rotate:** Raphael. https://app.instantly.ai/app/settings/integrations → regenerate API key.
- **Time:** 2 min.
- **Blast radius:** Cold-email outbound control, lead list exfil (thousands of prospect emails). **High.**

### PRIMEFORGE_API_KEY
- **Stored in:** Local `.env` line 50, Vercel env.
- **Grants:** Primeforge mailbox infra — provisioning, DNS, domain reputation ops.
- **Rotate:** Raphael. Primeforge dashboard (login required) → API settings.
- **Time:** 5 min.
- **Blast radius:** Could spin up or tear down mailboxes, trash domain reputation. **High.**

### NEVERBOUNCE_API_KEY
- **Stored in:** Local `.env` line 60, Vercel env.
- **Grants:** Email verification API calls against Raphael's $125 prepaid balance.
- **Rotate:** Raphael. https://app.neverbounce.com/apps/custom-integration → rotate key.
- **Time:** 2 min.
- **Blast radius:** Credit burn only. Low.

### ZEROBOUNCE_API_KEY (empty)
- Currently empty. No rotation needed.

---

## 6. Gmail / Google Workspace

### GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET
- **Stored in:** Local `.env` lines 34-35, Vercel env.
- **Grants:** OAuth app identity for Gmail API access (paired with per-user refresh tokens).
- **Rotate:** Raphael. https://console.cloud.google.com/apis/credentials → delete OAuth client, create new, distribute new client ID/secret.
- **Time:** 10 min + refresh token re-issuance for all 5 users below.
- **Blast radius:** Without refresh tokens, just an identity. With them, full inbox access for the 5 users. **Rotate only if refresh tokens are also compromised.**

### GMAIL_REFRESH_TOKEN_RALPH / SUPPORT / AUSTIN / DAMON / JUSTIN
- **Stored in:** Local `.env` lines 36-40, Vercel env.
- **Grants:** Each token = full Gmail read/write for that user's mailbox.
- **Rotate:** Each user must revoke access at https://myaccount.google.com/permissions and re-authorize via our OAuth flow to issue a new refresh token.
- **Time:** 3 min per user × 5 = 15 min (requires each human to click through).
- **Blast radius:** Mailbox-level read/write per token. **High** — attacker can read support emails, send as the user, exfiltrate customer data.

---

## 7. Payments

### STRIPE_SECRET_KEY (`sk_live_…`)
- **Stored in:** Local `.env` line 20, Vercel env.
- **Grants:** Full Stripe API — charge cards, issue refunds, read customer data, modify subscriptions. **LIVE mode.**
- **Rotate:** Raphael. https://dashboard.stripe.com/apikeys → roll secret key.
- **Time:** 3 min + redeploy. Stripe supports old+new valid for 12h by default (set during roll).
- **Blast radius:** **Total financial.** Attacker can see all customer payment data (not card numbers), issue refunds, create charges. **Highest-sensitivity key in the stack by business impact.**

### STRIPE_PUBLISHABLE_KEY (`pk_live_…`)
- **Stored in:** Local `.env` line 19, Vercel env.
- **Rotate:** Same dashboard. Publishable keys are safe to ship to browser, but roll with secret.
- **Time:** 2 min.
- **Blast radius:** None on its own.

### STRIPE_WEBHOOK_SECRET (`whsec_…`)
- **Stored in:** Local `.env` line 21, Vercel env.
- **Grants:** Signature verification for incoming Stripe webhooks.
- **Rotate:** https://dashboard.stripe.com/webhooks → select endpoint → "Roll signing secret".
- **Time:** 2 min + redeploy.
- **Blast radius:** Attacker could forge webhook events (mark invoices paid, trigger access grants). **High.**

---

## 8. Infrastructure

### RAILWAY_TOKEN (UUID — see `.env` line 27)
- **Stored in:** Local `.env` line 27.
- **Grants:** Railway account API — manage worker deploys.
- **Rotate:** Raphael. https://railway.app/account/tokens → revoke, regenerate.
- **Time:** 2 min.
- **Blast radius:** Can redeploy/kill worker, read env vars. **High.**

### SPACESHIP_API_KEY / SPACESHIP_API_SECRET
- **Stored in:** Local `.env` lines 46-47.
- **Grants:** DNS record management on domains registered through Spaceship.
- **Rotate:** Raphael. https://www.spaceship.com/application/api-manager/ → regenerate key+secret pair.
- **Time:** 3 min.
- **Blast radius:** Attacker can repoint DNS → redirect mail, intercept traffic, issue certs via DNS-01 challenge. **Critical for email deliverability.**

---

## 9. Third-Party Data

### ANTHROPIC_API_KEY (`sk-ant-api03-…`)
- **Stored in:** Local `.env` line 24, Vercel env.
- **Grants:** Anthropic API calls on Raphael's account, billed to his credit card.
- **Rotate:** Raphael. https://console.anthropic.com/settings/keys → revoke, create new.
- **Time:** 2 min.
- **Blast radius:** Credit burn (potentially large — no hard cap by default). **Medium-high.**

### CENSUS_API_KEY
- **Stored in:** Local `.env` line 43.
- **Grants:** US Census API access.
- **Rotate:** Raphael. https://api.census.gov/data/key_signup.html → request new key.
- **Time:** 5 min (email-delivery).
- **Blast radius:** Very low — public data, rate-limit only.

---

## Rotation Execution Order (probe-red scenario)

Run top-to-bottom; each step blocks the next:

1. **Supabase Management PAT** (blocks everything else — attacker could undo rotations)
2. **GitHub PAT** (prevent malicious pushes while rotating)
3. **Vercel token** (prevent env re-exfil during rotation)
4. **Supabase service role** (highest data blast radius)
5. **Supabase DB password**
6. **Stripe secret + webhook secret** (financial)
7. **Gmail client secret + all 5 refresh tokens** (data exfil risk)
8. **Resend, Instantly, Primeforge** (outbound-email reputation)
9. **Spaceship DNS** (email/domain integrity)
10. **Railway token**
11. **Anthropic, NeverBounce, Census** (billing/quota only)
12. **Supabase anon key** (rotates alongside service role)

**Total estimated time if all rotated sequentially: 90-120 min.** Bottleneck is the 5 Gmail user re-auths.

After rotation: audit Vercel deploy logs, Supabase `api_keys` audit trail, GitHub commit history for 7 days preceding first sign of compromise. Document findings in `docs/security/incident-YYYY-MM-DD.md`.
