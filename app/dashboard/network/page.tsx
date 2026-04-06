"use client";

import { useDashboard } from "../context";
import { isTeam } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";

type Tab = "opportunities" | "posted";

export default function NetworkPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const teamTier = isTeam(organization.plan, organization);

  const [tab, setTab] = useState<Tab>("opportunities");
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [posted, setPosted] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expressingInterest, setExpressingInterest] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    estimated_value: "",
    agency: "",
    required_certs: "",
    naics_codes: "",
    geography: "",
    deadline: "",
  });

  const loadData = useCallback(async () => {
    if (!teamTier) { setLoading(false); return; }
    const [oppsRes, postedRes] = await Promise.all([
      supabase
        .from("teaming_opportunities")
        .select("*, teaming_matches(id, interest_status)")
        .neq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("teaming_opportunities")
        .select("*, teaming_matches(id, interest_status)")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false }),
    ]);
    setOpportunities(oppsRes.data ?? []);
    setPosted(postedRes.data ?? []);
    setLoading(false);
  }, [organization.id, teamTier, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const expressInterest = async (opportunityId: string) => {
    setExpressingInterest(opportunityId);
    try {
      await fetch("/api/teaming/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teaming_opportunity_id: opportunityId }),
      });
      loadData();
    } catch {
      // silent
    }
    setExpressingInterest(null);
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    setSubmitting(true);
    try {
      await fetch("/api/teaming/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
          agency: form.agency,
          required_certs: form.required_certs.split(",").map((s) => s.trim()).filter(Boolean),
          naics_codes: form.naics_codes.split(",").map((s) => s.trim()).filter(Boolean),
          geography: form.geography,
          deadline: form.deadline || null,
        }),
      });
      setForm({ title: "", description: "", estimated_value: "", agency: "", required_certs: "", naics_codes: "", geography: "", deadline: "" });
      loadData();
    } catch {
      // silent
    }
    setSubmitting(false);
  };

  const computeMatchScore = (opp: any): number => {
    let score = 0;
    const oppNaics: string[] = opp.naics_codes ?? [];
    const oppCerts: string[] = opp.required_certs ?? [];
    const orgNaics = organization.naics_codes ?? [];
    const orgCerts = organization.certifications ?? [];
    if (oppNaics.some((n: string) => orgNaics.includes(n))) score += 50;
    if (oppCerts.some((c: string) => orgCerts.includes(c))) score += 30;
    if (oppNaics.length === 0 && oppCerts.length === 0) score += 40;
    if (score === 0) score = 20;
    return Math.min(score, 100);
  };

  if (!teamTier) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#e5e7eb] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-serif text-[#111827] mb-2">Subcontracting Network — Team Feature</h2>
            <p className="text-sm text-[#4b5563] mb-4">
              Find teaming partners and post subcontracting opportunities.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to Team
            </Link>
          </div>
        </div>
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="text-2xl font-serif text-[#111827] mb-6">Subcontracting Network</h1>
          <div className="border border-[#e5e7eb] bg-white p-12 text-center text-[#9ca3af]">
            Sample network content...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-[#111827]">Subcontracting Network</h1>
        <HelpButton page="network" />
      </div>
      <InlineGuide page="network" />

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[#e5e7eb] mb-6">
        <button
          onClick={() => setTab("opportunities")}
          className={`px-5 py-2.5 text-sm transition-colors border-b-2 ${
            tab === "opportunities"
              ? "text-[#111827] border-[#2563eb]"
              : "text-[#4b5563] border-transparent hover:text-[#111827]"
          }`}
        >
          Opportunities for You
        </button>
        <button
          onClick={() => setTab("posted")}
          className={`px-5 py-2.5 text-sm transition-colors border-b-2 ${
            tab === "posted"
              ? "text-[#111827] border-[#2563eb]"
              : "text-[#4b5563] border-transparent hover:text-[#111827]"
          }`}
        >
          Your Posted Opportunities
        </button>
      </div>

      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading...</div>
      ) : tab === "opportunities" ? (
        <div>
          {opportunities.length === 0 ? (
            <div className="border border-[#e5e7eb] bg-white p-12 text-center">
              <div className="text-[#9ca3af] text-lg mb-2">No matching opportunities</div>
              <p className="text-sm text-[#4b5563]">New teaming opportunities matching your profile will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {opportunities.map((opp) => {
                const score = computeMatchScore(opp);
                const alreadyInterested = opp.teaming_matches?.some(
                  (m: any) => m.interest_status === "interested"
                );
                return (
                  <div key={opp.id} className="border border-[#e5e7eb] bg-white p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-sm text-[#111827] font-medium">{opp.title}</h3>
                          <span className={`px-2 py-0.5 text-[10px] font-mono ${
                            score >= 70 ? "bg-[#22c55e]/10 text-[#22c55e]" :
                            score >= 40 ? "bg-[#f59e0b]/10 text-[#f59e0b]" :
                            "bg-[#9ca3af]/10 text-[#9ca3af]"
                          }`}>
                            {score}% match
                          </span>
                        </div>
                        {opp.agency && <p className="text-xs text-[#4b5563]">{opp.agency}</p>}
                        {opp.description && <p className="text-sm text-[#4b5563] mt-2">{opp.description}</p>}
                        <div className="flex items-center gap-4 mt-2">
                          {opp.estimated_value && (
                            <span className="text-xs font-mono text-[#111827]">
                              ${Number(opp.estimated_value).toLocaleString()}
                            </span>
                          )}
                          {opp.naics_codes?.length > 0 && (
                            <span className="text-xs font-mono text-[#9ca3af]">
                              NAICS: {opp.naics_codes.join(", ")}
                            </span>
                          )}
                          {opp.deadline && (
                            <span className="text-xs font-mono text-[#9ca3af]">
                              Due: {new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-4">
                        {alreadyInterested ? (
                          <span className="px-3 py-1 text-xs text-[#22c55e] bg-[#22c55e]/10">Interested</span>
                        ) : (
                          <button
                            onClick={() => expressInterest(opp.id)}
                            disabled={expressingInterest === opp.id}
                            className="px-3 py-1 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
                          >
                            {expressingInterest === opp.id ? "..." : "Express Interest"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Post Form */}
          <div className="border border-[#e5e7eb] bg-white p-5 mb-6">
            <h2 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-4">Post Teaming Opportunity</h2>
            <form onSubmit={handlePost} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                    placeholder="Opportunity title"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Agency</label>
                  <input
                    type="text"
                    value={form.agency}
                    onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Estimated Value</label>
                  <input
                    type="number"
                    value={form.estimated_value}
                    onChange={(e) => setForm((f) => ({ ...f, estimated_value: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Geography</label>
                  <input
                    type="text"
                    value={form.geography}
                    onChange={(e) => setForm((f) => ({ ...f, geography: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Required Certs (comma-sep)</label>
                  <input
                    type="text"
                    value={form.required_certs}
                    onChange={(e) => setForm((f) => ({ ...f, required_certs: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                    placeholder="8(a), HUBZone, SDVOSB..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">NAICS Codes (comma-sep)</label>
                  <input
                    type="text"
                    value={form.naics_codes}
                    onChange={(e) => setForm((f) => ({ ...f, naics_codes: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                    placeholder="541512, 541519..."
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !form.title}
                className="bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
              >
                {submitting ? "Posting..." : "Post Opportunity"}
              </button>
            </form>
          </div>

          {/* Posted List */}
          {posted.length === 0 ? (
            <div className="border border-[#e5e7eb] bg-white p-12 text-center">
              <div className="text-[#9ca3af] text-lg mb-2">No posted opportunities</div>
              <p className="text-sm text-[#4b5563]">Post your first teaming opportunity above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posted.map((opp) => {
                const matchCount = opp.teaming_matches?.filter(
                  (m: any) => m.interest_status === "interested"
                ).length ?? 0;
                return (
                  <div key={opp.id} className="border border-[#e5e7eb] bg-white p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm text-[#111827] font-medium">{opp.title}</h3>
                        {opp.agency && <p className="text-xs text-[#4b5563] mt-0.5">{opp.agency}</p>}
                        <div className="flex items-center gap-4 mt-2">
                          {opp.estimated_value && (
                            <span className="text-xs font-mono text-[#111827]">
                              ${Number(opp.estimated_value).toLocaleString()}
                            </span>
                          )}
                          {opp.deadline && (
                            <span className="text-xs font-mono text-[#9ca3af]">
                              Due: {new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-mono ${
                        matchCount > 0 ? "bg-[#22c55e]/10 text-[#22c55e]" : "bg-[#9ca3af]/10 text-[#9ca3af]"
                      }`}>
                        {matchCount} interested
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
