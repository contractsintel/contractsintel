import Link from "next/link";

export const metadata = {
  title: "Terms of Service — ContractsIntel",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-[#0f172a]">
      <nav className="bg-white border-b border-[#e5e7eb] px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">CI</div>
          <span className="font-semibold text-[15px] text-[#0f172a]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
        </Link>
        <Link href="/" className="text-sm text-[#64748b] hover:text-[#0f172a]">&larr; Back to Home</Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-['DM_Serif_Display'] text-[32px] text-[#0f172a] mb-2">Terms of Service</h1>
        <p className="text-sm text-[#94a3b8] mb-10">Last updated: April 5, 2026</p>

        <div className="space-y-8 text-[15px] text-[#64748b] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Service Description</h2>
            <p>ContractsIntel is a software-as-a-service (SaaS) platform that helps government contractors find, bid on, and manage federal contract opportunities. The platform provides opportunity matching, AI-powered proposal drafts, compliance monitoring, pipeline tracking, and related tools.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Not Legal or Financial Advice</h2>
            <p>ContractsIntel is a business intelligence tool, not a law firm or financial advisor. The information provided through our platform — including bid recommendations, compliance alerts, proposal drafts, and Prompt Payment Act templates — is for informational purposes only and does not constitute legal, financial, or procurement advice. You should consult with qualified professionals before making business decisions based on information from our platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Data Accuracy</h2>
            <p>ContractsIntel aggregates data from SAM.gov and other public government sources. While we make every effort to present accurate and timely information, we do not guarantee the accuracy, completeness, or timeliness of government procurement data. Users are responsible for independently verifying all contract information, deadlines, and requirements before submitting bids or proposals.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Subscriptions and Billing</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>All plans include a <strong className="text-[#0f172a]">14-day free trial</strong>. No credit card is required to start the trial. A payment method is required by Day 7 to continue the trial.</li>
              <li>Subscriptions are <strong className="text-[#0f172a]">month-to-month</strong> with no long-term commitment. You may cancel at any time.</li>
              <li>If you cancel before your trial ends, you will not be charged.</li>
              <li>After the trial, subscriptions renew monthly at the rate for your selected plan: Discovery ($499/mo), BD Pro ($999/mo), or Team ($2,499/mo).</li>
              <li>We reserve the right to modify pricing with <strong className="text-[#0f172a]">30 days written notice</strong> to active subscribers. Price changes do not affect the current billing period.</li>
              <li>Refunds are handled on a case-by-case basis. Contact support@contractsintel.com for refund requests.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">User Responsibilities</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to use ContractsIntel only for lawful purposes related to government contracting. You will not attempt to access other users&apos; data, reverse-engineer the platform, or use the service to submit fraudulent bids or proposals.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">AI-Generated Content</h2>
            <p>Proposal drafts, PPQ narratives, bid recommendations, and other AI-generated content are produced by artificial intelligence and should be treated as first drafts requiring human review. AI-generated content may contain errors, inaccuracies, or language that does not reflect your company&apos;s specific capabilities. You are solely responsible for reviewing, editing, and verifying all AI-generated content before using it in any government submission.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, ContractsIntel and its owners, employees, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, business opportunities, or goodwill, arising from your use of or inability to use the service. Our total liability for any claim arising from the service shall not exceed the amount you paid for the service in the 12 months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Service Availability</h2>
            <p>We strive to maintain 99.9% uptime but do not guarantee uninterrupted access to the service. We may perform scheduled maintenance with reasonable advance notice. We are not liable for service interruptions caused by third-party providers (SAM.gov, Stripe, Google, etc.) or events beyond our control.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Termination</h2>
            <p>We reserve the right to suspend or terminate your account if you violate these terms. You may terminate your account at any time by cancelling your subscription and emailing <a href="mailto:support@contractsintel.com" className="text-[#2563eb]">support@contractsintel.com</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Changes to Terms</h2>
            <p>We may update these terms from time to time. We will notify active subscribers of material changes via email at least 30 days before they take effect. Continued use of the service after changes become effective constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Contact</h2>
            <p>For questions about these terms, contact us at <a href="mailto:support@contractsintel.com" className="text-[#2563eb]">support@contractsintel.com</a>.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
