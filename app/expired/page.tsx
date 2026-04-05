"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import Link from "next/link";

const PLANS = [
  {
    name: "Discovery",
    price: "$499",
    tier: "discovery",
    best: "Solo contractors finding opportunities",
    features: ["Opportunity Intelligence + Daily Digest", "Compliance Alerts", "Pipeline Tracker", "Google Calendar Sync", "SAM.gov Profile Audit"],
  },
  {
    name: "BD Pro",
    price: "$999",
    tier: "bd_pro",
    best: "Contractors actively bidding on contracts",
    popular: true,
    features: ["Everything in Discovery", "AI Proposal First Drafts", "Full Compliance (CMMC + FAR)", "Past Performance Builder", "Contract Delivery Dashboard", "State + Local Monitoring", "Weekly Pipeline Report"],
  },
  {
    name: "Team",
    price: "$2,499",
    tier: "team",
    best: "Growing firms managing multiple contracts",
    features: ["Everything in BD Pro", "Unlimited team users", "CPARS Monitor", "Subcontracting Network", "Competitor Intelligence", "Agency Heat Maps", "Contract Vehicle Alerts"],
  },
];

export default function ExpiredPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (tier: string) => {
    setLoading(tier);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#080a0f] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">CI</div>
            <span className="font-semibold text-[15px] text-[#e8edf8]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
          </Link>
          <h1 className="text-3xl font-serif text-[#e8edf8] mb-3">Your free trial has ended</h1>
          <p className="text-[#8b9ab5] text-base max-w-lg mx-auto">
            To continue using ContractsIntel and keep receiving matched opportunities, choose a plan below.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5 mb-10">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`border bg-[#0d1018] p-6 ${plan.popular ? "border-[#2563eb] ring-1 ring-[#2563eb]" : "border-[#1e2535]"}`}
            >
              {plan.popular && (
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#3b82f6] mb-2">Most Popular</div>
              )}
              <div className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-1">{plan.name}</div>
              <div className="text-3xl font-serif text-[#e8edf8] mb-1">{plan.price}<span className="text-sm text-[#8b9ab5] font-sans">/mo</span></div>
              <div className="text-xs text-[#8b9ab5] mb-4">Best for: {plan.best}</div>
              <div className="border-t border-[#1e2535] pt-4 mb-5">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-xs text-[#8b9ab5] mb-2">
                    <svg className="w-3.5 h-3.5 text-[#22c55e] mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => handleSubscribe(plan.tier)}
                disabled={loading !== null}
                className={`w-full py-3 text-sm font-medium transition-colors disabled:opacity-50 ${
                  plan.popular
                    ? "bg-[#2563eb] text-white hover:bg-[#3b82f6]"
                    : "border border-[#2a3548] text-[#e8edf8] hover:border-[#8b9ab5]"
                }`}
              >
                {loading === plan.tier ? "Redirecting..." : `Subscribe to ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-sm text-[#4a5a75]">
            Questions? Email <a href="mailto:support@contractsintel.com" className="text-[#3b82f6]">support@contractsintel.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
