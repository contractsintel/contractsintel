import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — ContractsIntel",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#080a0f] text-[#e8edf8]">
      <nav className="border-b border-[#1e2535] px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">CI</div>
          <span className="font-semibold text-[15px]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
        </Link>
        <Link href="/" className="text-sm text-[#8b9ab5] hover:text-[#e8edf8]">← Back to Home</Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-serif mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#4a5a75] mb-10">Last updated: April 5, 2026</p>

        <div className="space-y-8 text-[15px] text-[#8b9ab5] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[#e8edf8] mb-3">What Data We Collect</h2>
            <p>When you create an account, we collect your email address, company name, and optionally your Unique Entity Identifier (UEI). If you provide a UEI, we retrieve publicly available information from SAM.gov including your company&apos;s certifications, NAICS codes, CAGE code, registration status, and business address. This is public government data available to anyone.</p>
            <p className="mt-3">We also collect usage data such as which opportunities you track, your pipeline activity, and your subscription status. If you connect Google Calendar, we store an OAuth token to sync deadlines to your calendar.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#e8edf8] mb-3">How We Use Your Data</h2>
            <p>We use your data to provide the ContractsIntel service:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Match government contract opportunities to your certifications and NAICS codes</li>
              <li>Send daily opportunity digest emails</li>
              <li>Generate AI-powered proposal drafts and bid recommendations</li>
              <li>Track your compliance deadlines and send alerts</li>
              <li>Calculate your compliance health score</li>
              <li>Sync deadlines to your Google Calendar (if connected)</li>
              <li>Process subscription payments</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#e8edf8] mb-3">Third-Party Services</h2>
            <p>We use the following third-party services to operate ContractsIntel:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong className="text-[#e8edf8]">Stripe</strong> — payment processing. Stripe handles all credit card data; we never see or store your card number.</li>
              <li><strong className="text-[#e8edf8]">Google</strong> — authentication (Google Sign-In) and calendar sync.</li>
              <li><strong className="text-[#e8edf8]">Supabase</strong> — database hosting and user authentication.</li>
              <li><strong className="text-[#e8edf8]">Anthropic</strong> — AI-powered features including proposal generation, bid recommendations, and performance narratives.</li>
              <li><strong className="text-[#e8edf8]">Resend</strong> — transactional email delivery (digests, alerts, notifications).</li>
              <li><strong className="text-[#e8edf8]">SAM.gov</strong> — public government procurement data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#e8edf8] mb-3">We Do Not Sell Your Data</h2>
            <p>We do not sell, rent, or share your personal information with third parties for marketing purposes. Your company data, opportunity tracking activity, proposal drafts, and compliance information are private to your account.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#e8edf8] mb-3">Data Retention and Deletion</h2>
            <p>We retain your data for as long as your account is active. If you cancel your subscription, your data remains accessible for 90 days in case you resubscribe. After 90 days, inactive account data may be deleted.</p>
            <p className="mt-3">You can request complete deletion of your account and all associated data at any time by emailing <a href="mailto:support@contractsintel.com" className="text-[#3b82f6]">support@contractsintel.com</a>. We will process deletion requests within 30 days.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#e8edf8] mb-3">Cookies</h2>
            <p>We use essential cookies for authentication and session management. We do not use advertising or tracking cookies.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#e8edf8] mb-3">Contact</h2>
            <p>For questions about this privacy policy, contact us at <a href="mailto:support@contractsintel.com" className="text-[#3b82f6]">support@contractsintel.com</a>.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
