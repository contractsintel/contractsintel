"use client";

import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
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

const BD_PRO_FEATURES = [
  { key: "proposals", label: "AI Proposal Drafts", table: "proposal_drafts" },
  { key: "past_perf", label: "Past Performance Builder", table: "past_performance" },
  { key: "contracts", label: "Contract Delivery", table: "contracts" },
  { key: "compliance_full", label: "Full Compliance Monitor", table: "compliance_items" },
];

const TEAM_FEATURES_LIST = [
  { key: "cpars", label: "CPARS Monitor", table: "cpars_ratings" },
  { key: "network", label: "Subcontracting Network", table: "teaming_matches" },
  { key: "competitors", label: "Competitor Intelligence", table: "competitors" },
  { key: "analytics", label: "Agency Analytics", table: "agency_analytics" },
  { key: "loss", label: "Loss Analysis", table: "loss_analyses" },
];

export default function ExpiredPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ used: string[]; recommended: string } | null>(null);

  useEffect(() => {
    async function checkUsage() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRec } = await supabase
        .from("users")
        .select("organization_id")
        .eq("auth_id", user.id)
        .single();

      if (!userRec?.organization_id) return;
      const orgId = userRec.organization_id;

      const used: string[] = [];
      let usedTeam = false;
      let usedBdPro = false;

      // Check BD Pro features
      for (const f of BD_PRO_FEATURES) {
        const { count } = await supabase.from(f.table).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
        if (count && count > 0) { used.push(f.label); usedBdPro = true; }
      }

      // Check Team features
      for (const f of TEAM_FEATURES_LIST) {
        const { count } = await supabase.from(f.table).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
        if (count && count > 0) { used.push(f.label); usedTeam = true; }
      }

      const recommended = usedTeam ? "Team" : usedBdPro ? "BD Pro" : "Discovery";
      setUsage({ used, recommended });
    }
    checkUsage();
  }, [supabase]);

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
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">CI</div>
            <span className="font-semibold text-[15px] text-[#111827]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
          </Link>
          <h1 className="font-['DM_Serif_Display'] text-3xl tracking-[-0.02em] text-[#0f172a] mb-3">Your free trial has ended</h1>
          <p className="text-[#4b5563] text-base max-w-lg mx-auto">
            To continue using ContractsIntel and keep receiving matched opportunities, choose a plan below.
          </p>
        </div>

        {usage && usage.used.length > 0 && (
          <div className="border border-[#f0f1f3] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8">
            <div className="text-sm text-[#4b5563] mb-3">
              During your trial, you used <strong className="text-[#111827]">{usage.used.length + 4}</strong> of 16 products:
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {["Opportunity Intelligence", "Pipeline Tracker", "Compliance Alerts", "Calendar Sync"].map((f) => (
                <span key={f} className="text-[10px] font-mono px-2 py-1 bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563]">{f}</span>
              ))}
              {usage.used.map((f) => (
                <span key={f} className="text-[10px] font-mono px-2 py-1 bg-[#f8f9fb] border border-[#2563eb]/30 text-[#3b82f6]">{f}</span>
              ))}
            </div>
            <div className="text-sm">
              Based on your usage, we recommend{" "}
              <strong className={usage.recommended === "Team" ? "text-[#a78bfa]" : usage.recommended === "BD Pro" ? "text-[#3b82f6]" : "text-[#111827]"}>
                {usage.recommended}
              </strong>
              {usage.recommended === "Team" && " — you used Team-exclusive features like CPARS and competitor intelligence."}
              {usage.recommended === "BD Pro" && " — you used BD Pro features like proposal drafts and past performance."}
              {usage.recommended === "Discovery" && " — the essentials are all you need right now."}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-5 mb-10">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`border bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${plan.popular ? "border-[#2563eb] ring-1 ring-[#2563eb]" : "border-[#e5e7eb]"}`}
            >
              {plan.popular && (
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#3b82f6] mb-2">Most Popular</div>
              )}
              <div className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-1">{plan.name}</div>
              <div className="text-3xl font-bold tracking-[-0.02em] text-[#0f172a] mb-1">{plan.price}<span className="text-sm text-[#4b5563] font-sans">/mo</span></div>
              <div className="text-xs text-[#4b5563] mb-4">Best for: {plan.best}</div>
              <div className="border-t border-[#e5e7eb] pt-4 mb-5">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-xs text-[#4b5563] mb-2">
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
                    : "border border-[#d1d5db] text-[#111827] hover:border-[#4b5563]"
                }`}
              >
                {loading === plan.tier ? "Redirecting..." : `Subscribe to ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-sm text-[#9ca3af]">
            Questions? Email <a href="mailto:support@contractsintel.com" className="text-[#3b82f6]">support@contractsintel.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
