"use client";

import { useDashboard } from "../context";
import { isDiscovery } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";

const TABS = ["Executive Summary", "Technical Approach", "Past Performance", "Management Plan"] as const;
type Tab = (typeof TABS)[number];

function formatCurrency(n: number | null | undefined): string {
  if (!n || n <= 0) return "TBD";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function ProposalsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const locked = isDiscovery(organization.plan, organization);
  const searchParams = useSearchParams();
  const preselectedOppId = searchParams.get("opportunity_id");

  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<Record<string, string> | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Executive Summary");
  const [copied, setCopied] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    const { data } = await supabase
      .from("opportunity_matches")
      .select("*, opportunities(*)")
      .eq("organization_id", organization.id)
      .eq("user_status", "bidding")
      .order("match_score", { ascending: false });
    setMatches(data ?? []);
    // Auto-select if opportunity_id in URL
    if (preselectedOppId && data) {
      const found = data.find((m: any) => m.opportunity_id === preselectedOppId);
      if (found) setSelectedMatch(found.id);
    }
    setLoading(false);
  }, [organization.id, locked, supabase, preselectedOppId]);

  useEffect(() => { loadData(); }, [loadData]);

  const generateDraft = async (matchId: string) => {
    setGenerating(true);
    setSelectedMatch(matchId);
    setProposal(null);
    setError(null);
    try {
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, organization_id: organization.id, custom_instructions: customInstructions }),
      });
      const data = await res.json();
      if (data.proposal) {
        setProposal(data.proposal);
      } else {
        setError(data.error || "Failed to generate proposal. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setGenerating(false);
  };

  const copySection = (tab: string) => {
    if (!proposal) return;
    navigator.clipboard.writeText(proposal[tab]);
    setCopied(tab);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = () => {
    if (!proposal) return;
    const text = TABS.map(t => `# ${t}\n\n${proposal[t] || ""}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    setCopied("all");
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadAsDoc = () => {
    if (!proposal) return;
    const match = matches.find(m => m.id === selectedMatch);
    const title = match?.opportunities?.title || "Proposal";
    const text = TABS.map(t => `${t.toUpperCase()}\n${"=".repeat(t.length)}\n\n${proposal[t] || ""}`).join("\n\n\n");
    const blob = new Blob([text], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposal-${title.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 40)}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateSection = (tab: string, value: string) => {
    if (!proposal) return;
    setProposal({ ...proposal, [tab]: value });
  };

  if (locked) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-9 max-w-md text-center shadow-lg">
            <svg className="w-9 h-9 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-[16px] font-semibold text-[#111827] mb-2">AI Proposals — BD Pro Feature</h2>
            <p className="text-[14px] text-[#6b7280] mb-5">Generate tailored proposal drafts with AI. Upgrade to BD Pro to unlock.</p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-7 py-3 rounded-xl text-[14px] font-semibold hover:bg-[#1d4ed8] transition-colors">
              Upgrade to BD Pro
            </Link>
          </div>
        </div>
        <div className="filter blur-[2px] opacity-40 pointer-events-none">
          <h1 className="ci-page-title">AI Proposals</h1>
        </div>
      </div>
    );
  }

  const selectedOpp = matches.find(m => m.id === selectedMatch)?.opportunities;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="ci-page-title">AI Proposals</h1>
        <HelpButton page="proposals" />
      </div>
      <InlineGuide page="proposals" />
      <TrialTierBanner page="proposals" />

      {loading ? (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-12 text-center">
          <div className="animate-pulse text-[#9ca3af]">Loading opportunities...</div>
        </div>
      ) : matches.length === 0 ? (
        <div className="max-w-[400px] mx-auto text-center p-8">
          <svg className="w-10 h-10 mx-auto mb-3 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <h3 className="text-[16px] font-semibold text-[#111827] mb-2">Ready to generate proposals</h3>
          <p className="text-[14px] text-[#6b7280] mb-5">Mark any contract as &ldquo;Bidding&rdquo; from the dashboard, then come here to generate an AI proposal draft.</p>
          <Link href="/dashboard" className="inline-block px-6 py-2.5 text-[14px] font-semibold text-white rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors">
            Browse Contracts
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Opportunity List */}
          <div className="lg:col-span-1 space-y-2">
            <h2 className="ci-section-label mb-3">Active Bids ({matches.length})</h2>
            {matches.map((m) => {
              const opp = m.opportunities;
              return (
                <button key={m.id} onClick={() => { setSelectedMatch(m.id); setProposal(null); setError(null); }}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selectedMatch === m.id
                      ? "border-[#2563eb] bg-[#eff6ff] shadow-sm"
                      : "border-[#e5e7eb] bg-white hover:border-[#d1d5db] hover:shadow-sm"
                  }`}>
                  <h3 className="text-[13px] text-[#111827] font-semibold truncate">{opp?.title}</h3>
                  <p className="text-[11px] text-[#6b7280] mt-1 truncate">{opp?.agency}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-[#9ca3af]">
                    <span className="font-semibold text-[#111827]">{formatCurrency(opp?.value_estimate || opp?.estimated_value)}</span>
                    <span>Score: {m.match_score}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Proposal Editor */}
          <div className="lg:col-span-2">
            {selectedMatch && selectedOpp ? (
              <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
                {/* Contract header */}
                <div className="p-4 border-b border-[#e5e7eb] bg-[#f9fafb]">
                  <h3 className="text-[14px] font-semibold text-[#111827]">{selectedOpp.title}</h3>
                  <p className="text-[12px] text-[#6b7280] mt-0.5">{selectedOpp.agency} · {selectedOpp.solicitation_number || "No solicitation #"}</p>
                </div>

                {/* Tabs */}
                <div className="flex items-center border-b border-[#e5e7eb] px-1">
                  {TABS.map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
                        activeTab === tab
                          ? "border-[#2563eb] text-[#2563eb]"
                          : "border-transparent text-[#6b7280] hover:text-[#111827]"
                      }`}>
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Content */}
                <div className="p-5 min-h-[400px]">
                  {generating ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[#9ca3af]">
                      <div className="w-8 h-8 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin mb-4" />
                      <p className="text-[14px] font-medium">Generating proposal with AI...</p>
                      <p className="text-[12px] mt-1">This takes 15-30 seconds</p>
                    </div>
                  ) : error ? (
                    <div className="text-center py-12">
                      <p className="text-[14px] text-[#dc2626] mb-3">{error}</p>
                      <button onClick={() => generateDraft(selectedMatch)}
                        className="px-4 py-2 text-[13px] font-medium bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8]">
                        Try Again
                      </button>
                    </div>
                  ) : proposal ? (
                    <div>
                      <textarea
                        value={proposal[activeTab] || ""}
                        onChange={(e) => updateSection(activeTab, e.target.value)}
                        rows={16}
                        className="w-full text-[14px] text-[#4b5563] leading-relaxed p-4 border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 resize-y"
                      />
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={() => copySection(activeTab)}
                          className={`px-3.5 py-1.5 text-[12px] font-medium border rounded-lg transition-colors ${
                            copied === activeTab ? "bg-[#ecfdf5] border-[#a7f3d0] text-[#059669]" : "border-[#e5e7eb] text-[#4b5563] hover:border-[#d1d5db]"
                          }`}>
                          {copied === activeTab ? "Copied!" : "Copy Section"}
                        </button>
                        <button onClick={copyAll}
                          className={`px-3.5 py-1.5 text-[12px] font-medium border rounded-lg transition-colors ${
                            copied === "all" ? "bg-[#ecfdf5] border-[#a7f3d0] text-[#059669]" : "border-[#e5e7eb] text-[#4b5563] hover:border-[#d1d5db]"
                          }`}>
                          {copied === "all" ? "Copied All!" : "Copy All Sections"}
                        </button>
                        <button onClick={downloadAsDoc}
                          className="px-3.5 py-1.5 text-[12px] font-medium border border-[#e5e7eb] text-[#4b5563] hover:border-[#d1d5db] rounded-lg">
                          Download as Word
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16">
                      <svg className="w-12 h-12 text-[#d1d5db] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-[14px] text-[#6b7280] mb-4">Generate an AI proposal draft tailored to this contract</p>
                      <button onClick={() => generateDraft(selectedMatch)}
                        className="px-6 py-2.5 text-[14px] font-semibold bg-[#2563eb] text-white rounded-xl hover:bg-[#1d4ed8] transition-colors">
                        Generate Proposal Draft
                      </button>
                    </div>
                  )}
                </div>

                {/* Regenerate with custom instructions */}
                {proposal && (
                  <div className="px-5 pb-5 border-t border-[#e5e7eb] pt-4">
                    <button onClick={() => setShowInstructions(!showInstructions)}
                      className="text-[12px] text-[#6b7280] hover:text-[#111827] font-medium">
                      {showInstructions ? "Hide" : "Regenerate with custom instructions"}
                    </button>
                    {showInstructions && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          rows={3}
                          placeholder="e.g. Focus more on our cybersecurity experience, emphasize our local presence in Virginia..."
                          className="w-full px-3 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 resize-none"
                        />
                        <button onClick={() => generateDraft(selectedMatch)}
                          disabled={generating}
                          className="px-4 py-2 text-[13px] font-medium bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8] disabled:opacity-50">
                          {generating ? "Generating..." : "Regenerate"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-[#e5e7eb] rounded-xl p-12 text-center">
                <p className="text-[14px] text-[#9ca3af]">Select a contract from the left to generate a proposal</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
