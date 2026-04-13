import Link from "next/link";

export const metadata = {
  title: "Security — ContractsIntel",
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white text-[#0f172a]">
      <nav className="bg-white border-b border-[#e5e7eb] px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">
            CI
          </div>
          <span className="font-semibold text-[15px] text-[#0f172a]">
            Contracts<span className="text-[#3b82f6]">Intel</span>
          </span>
        </Link>
        <Link href="/" className="text-sm text-[#64748b] hover:text-[#0f172a]">
          &larr; Back to Home
        </Link>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-['DM_Serif_Display'] text-[36px] text-[#0f172a] mb-3">Security</h1>
        <p className="text-[15px] text-[#64748b] mb-10">
          How we protect your company, bid, and opportunity data.
        </p>

        {/* Posture summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          <div className="border border-[#e5e7eb] rounded-xl p-4">
            <div className="text-[11px] font-mono uppercase tracking-wide text-[#94a3b8] mb-1">Encryption</div>
            <div className="text-sm font-semibold text-[#0f172a]">TLS 1.2+ in transit</div>
            <div className="text-xs text-[#64748b] mt-1">AES-256 at rest (Postgres + storage)</div>
          </div>
          <div className="border border-[#e5e7eb] rounded-xl p-4">
            <div className="text-[11px] font-mono uppercase tracking-wide text-[#94a3b8] mb-1">Tenancy</div>
            <div className="text-sm font-semibold text-[#0f172a]">Row-level security</div>
            <div className="text-xs text-[#64748b] mt-1">Postgres RLS enforced on every table</div>
          </div>
          <div className="border border-[#e5e7eb] rounded-xl p-4">
            <div className="text-[11px] font-mono uppercase tracking-wide text-[#94a3b8] mb-1">Hosting</div>
            <div className="text-sm font-semibold text-[#0f172a]">US data residency</div>
            <div className="text-xs text-[#64748b] mt-1">Supabase (AWS us-east-1)</div>
          </div>
        </div>

        <div className="space-y-10 text-[15px] text-[#475569] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Data at rest</h2>
            <p>
              All customer data is stored in a managed Postgres database with AES-256 encryption at rest,
              including daily snapshots, WAL archives, and object storage for uploaded files. Database
              credentials are managed through short-lived service-role tokens never exposed to browser
              clients. Backups are encrypted and retained for 7 days with point-in-time recovery.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Data in transit</h2>
            <p>
              Every connection to ContractsIntel &mdash; from your browser to the app, from the app to our
              database, and from our workers to SAM.gov / Grants.gov / USASpending &mdash; uses TLS 1.2 or
              higher with modern cipher suites. HTTP is never accepted; all requests to the production
              domain are HSTS-preloaded and redirected to HTTPS.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Tenant isolation</h2>
            <p>
              Every table that stores customer data has row-level security (RLS) policies that scope
              reads and writes to rows owned by the authenticated user&apos;s organization. The
              application layer never bypasses RLS on user-facing routes &mdash; service-role access is
              reserved for background workers (SAM ingestion, digest generation) and the bearer-token
              API path, which re-scopes every query to the API key&apos;s organization before executing.
            </p>
            <p className="mt-3">
              That means a compromised user in one tenant cannot read another tenant&apos;s opportunities,
              pipeline, past performance, proposals, compliance matrices, or Bid Assist threads &mdash; the
              database itself enforces the boundary.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Authentication</h2>
            <p>
              User accounts are managed through Supabase Auth with email + password or OAuth. Passwords
              are hashed with bcrypt; session cookies are HttpOnly, Secure, SameSite=Lax, and rotate on
              every sign-in. We support SSO via Google OAuth and have a path for SAML on the Team tier.
            </p>
            <p className="mt-3">
              Public API keys are generated as 32-byte random tokens, stored as SHA-256 hashes in the
              database (we never persist the plain key), prefixed for user recognition, and can be
              soft-revoked at any time from the dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">SOC 2 roadmap</h2>
            <p>
              ContractsIntel is pursuing SOC 2 Type II attestation. Current status:
            </p>
            <ul className="list-disc pl-5 mt-3 space-y-1">
              <li>
                <span className="text-[#0f172a] font-medium">Type I readiness &mdash;</span>{" "}
                policies, access reviews, and vendor inventory in place
              </li>
              <li>
                <span className="text-[#0f172a] font-medium">Observation period &mdash;</span>{" "}
                6-month evidence collection begins after policy freeze
              </li>
              <li>
                <span className="text-[#0f172a] font-medium">Audit &mdash;</span>{" "}
                Type II audit scheduled with a Big-4 auditor
              </li>
            </ul>
            <p className="mt-3">
              While the audit is in progress, enterprise prospects can request our security
              questionnaire, penetration-test summary, and vendor subprocessor list under NDA.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Vulnerability management</h2>
            <p>
              Production dependencies are scanned for known CVEs on every build; high-severity
              advisories block deploys. Quarterly third-party penetration tests cover the web app,
              API, and authentication surface. We operate a coordinated-disclosure program &mdash;
              please report suspected vulnerabilities to{" "}
              <a href="mailto:security@contractsintel.com" className="text-[#2563eb] hover:underline">
                security@contractsintel.com
              </a>{" "}
              and we will acknowledge within one business day.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Incident response</h2>
            <p>
              We maintain a written incident-response runbook with on-call rotation and a 72-hour
              breach-notification commitment to affected customers. Every production change is
              audit-logged, and high-severity incidents trigger a post-mortem that is shared with
              enterprise customers under their MSA.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Data handling for federal work</h2>
            <p>
              ContractsIntel is designed to help small contractors pursue federal opportunities, but it
              is <span className="text-[#0f172a] font-medium">not</span> an authorized system for
              processing CUI, ITAR, or classified information. Do not upload classified material,
              controlled technical data, or ITAR-regulated content to the platform. For CMMC Level 2+
              workloads, contact us about our compliant deployment roadmap.
            </p>
          </section>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-block text-sm font-medium text-[#2563eb] hover:underline"
          >
            &larr; Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
