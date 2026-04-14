"use client";

import { useDashboard } from "../context";
import { isDiscovery, isBdProOrHigher } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";
import { ProfileBoostBanner } from "../unlock-panel";

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

  const [matches, setMatches] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<Record<string, string> | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Executive Summary");
  const [copied, setCopied] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(50);

  // Proposal Scorer state
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<Record<string, any> | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);

  // Outline Generator state
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineResult, setOutlineResult] = useState<Record<string, any> | null>(null);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(false);

  const bdProAccess = isBdProOrHigher(organization.plan, organization);

  const loadData = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    const { data } = await supabase
      .from("opportunity_matches")
      .select("*, opportunities(*)")
      .eq("organization_id", organization.id)
      .eq("user_status", "bidding")
      .order("match_score", { ascending: false });
    // Filter out past-deadline opportunities
    const propNow = new Date().toISOString();
    const activeMatches = (data ?? []).filter((m: Record<string, any>) => {
      const dl = m.opportunities?.response_deadline;
      return !dl || dl >= propNow;
    });
    setMatches(activeMatches);
    // Auto-select if opportunity_id in URL
    if (preselectedOppId && activeMatches) {
      const found = activeMatches.find((m: Record<string, any>) => m.opportunity_id === preselectedOppId);
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, organization_id: organization.id, custom_instructions: customInstructions }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.proposal) {
        setProposal(data.proposal);
      } else {
        setError(data.error || "Failed to generate proposal. Please try again.");
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        setError("Generation timed out. Try again.");
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      clearTimeout(timeoutId);
      setGenerating(false);
    }
  };

  const runPinkTeamReview = async () => {
    if (!selectedMatch || !proposal) return;
    setReviewLoading(true);
    setReviewResult(null);
    setReviewError(null);
    setShowReview(true);
    try {
      const res = await fetch("/api/proposals/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: selectedMatch,
          sections: {
            executive_summary: proposal["Executive Summary"] || "",
            technical_approach: proposal["Technical Approach"] || "",
            past_performance: proposal["Past Performance"] || "",
            management_plan: proposal["Management Plan"] || "",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReviewResult(data);
    } catch (e: unknown) {
      setReviewError(e instanceof Error ? e.message : "Failed to run Proposal Scorer. Please try again.");
    } finally {
      setReviewLoading(false);
    }
  };

  const generateOutline = async () => {
    if (!selectedMatch) return;
    setOutlineLoading(true);
    setOutlineResult(null);
    setOutlineError(null);
    setShowOutline(true);
    try {
      const res = await fetch("/api/proposals/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: selectedMatch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setOutlineResult(data);
    } catch (e: unknown) {
      setOutlineError(e instanceof Error ? e.message : "Failed to generate outline. Please try again.");
    } finally {
      setOutlineLoading(false);
    }
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

  const downloadAsTxt = () => {
    if (!proposal) return;
    const match = matches.find(m => m.id === selectedMatch);
    const title = (match?.opportunities?.title || "Proposal").slice(0, 60);
    const text = TABS.map(t => `${t.toUpperCase()}\n${"=".repeat(t.length)}\n\n${proposal[t] || ""}`).join("\n\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_proposal.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // G07 Word export — POSTs the current in-memory proposal to
  // /api/proposals/export which returns a .docx binary we save to disk.
  const [exporting, setExporting] = useState(false);
  const downloadAsDocx = async () => {
    if (!proposal) return;
    const match = matches.find(m => m.id === selectedMatch);
    const opp = match?.opportunities;
    const title = (opp?.title || "Proposal").slice(0, 80);
    setExporting(true);
    try {
      const res = await fetch("/api/proposals/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          company: organization.name,
          agency: opp?.agency,
          solicitation: opp?.solicitation_number,
          sections: {
            executive_summary: proposal["Executive Summary"] || "",
            technical_approach: proposal["Technical Approach"] || "",
            past_performance: proposal["Past Performance"] || "",
            management_plan: proposal["Management Plan"] || "",
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_proposal.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
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
            <svg className="w-9 h-9 text-[#94a3b8] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-[16px] font-semibold text-[#0f172a] mb-2">AI Proposals — BD Pro Feature</h2>
            <p className="text-[14px] text-[#64748b] mb-5">Generate tailored proposal drafts with AI. Upgrade to BD Pro to unlock.</p>
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
      <ProfileBoostBanner context="pipeline" />

      {loading ? (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-12 text-center">
          <div className="animate-pulse text-[#94a3b8]">Loading opportunities...</div>
        </div>
      ) : matches.length === 0 ? (
        <div className="max-w-[400px] mx-auto text-center p-8">
          <svg className="w-10 h-10 mx-auto mb-3 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <h3 className="text-[16px] font-semibold text-[#0f172a] mb-2">Ready to generate proposals</h3>
          <p className="text-[14px] text-[#64748b] mb-5">Mark any contract as &ldquo;Bidding&rdquo; from the dashboard, then come here to generate an AI proposal draft.</p>
          <Link href="/dashboard" className="inline-block px-6 py-2.5 text-[14px] font-semibold text-white rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors">
            Browse Contracts
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Opportunity List */}
          <div className="lg:col-span-1 space-y-2">
            <h2 className="ci-section-label mb-3">Active Bids ({matches.length})</h2>
            {matches.slice(0, visible).map((m) => {
              const opp = m.opportunities;
              return (
                <button key={m.id} onClick={() => { setSelectedMatch(m.id); setProposal(null); setError(null); setReviewResult(null); setReviewError(null); setShowReview(false); setOutlineResult(null); setOutlineError(null); setShowOutline(false); }}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selectedMatch === m.id
                      ? "border-[#2563eb] bg-[rgba(37,99,235,0.12)] shadow-sm"
                      : "border-[#e5e7eb] bg-white hover:border-[#d1d5db] hover:shadow-sm"
                  }`}>
                  <h3 className="text-[13px] text-[#0f172a] font-semibold truncate">{opp?.title}</h3>
                  <p className="text-[11px] text-[#64748b] mt-1 truncate">{opp?.agency}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-[#94a3b8]">
                    <span className="font-semibold text-[#0f172a]">{formatCurrency(opp?.value_estimate || opp?.estimated_value)}</span>
                    <span>Score: {m.match_score}</span>
                  </div>
                </button>
              );
            })}
            {matches.length > 0 && (
              <div className="flex items-center justify-between pt-4 border-t border-[#e5e7eb] mt-4">
                <span className="text-xs text-[#94a3b8]">Showing {Math.min(visible, matches.length)} of {matches.length} proposals</span>
                {visible < matches.length && (
                  <button onClick={() => setVisible(v => v + 50)} className="px-5 py-2 text-sm font-medium border border-[#e5e7eb] text-[#64748b] bg-white hover:text-[#0f172a] hover:shadow-sm rounded-xl transition-all">
                    Load 50 More
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: Proposal Editor */}
          <div className="lg:col-span-2">
            {selectedMatch && selectedOpp ? (
              <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
                {/* Contract header */}
                <div className="p-4 border-b border-[#e5e7eb] bg-[#f8f9fb]">
                  <h3 className="text-[14px] font-semibold text-[#0f172a]">{selectedOpp.title}</h3>
                  <p className="text-[12px] text-[#64748b] mt-0.5">{selectedOpp.agency} · {selectedOpp.solicitation_number || "No solicitation #"}</p>
                </div>

                {/* Tabs */}
                <div className="flex items-center border-b border-[#e5e7eb] px-1">
                  {TABS.map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
                        activeTab === tab
                          ? "border-[#2563eb] text-[#2563eb]"
                          : "border-transparent text-[#64748b] hover:text-[#0f172a]"
                      }`}>
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Content */}
                <div className="p-5 min-h-[400px]">
                  {generating ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[#94a3b8]">
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
                        className="w-full text-[14px] text-[#64748b] leading-relaxed p-4 border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 resize-y"
                      />
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={() => copySection(activeTab)}
                          className={`px-3.5 py-1.5 text-[12px] font-medium border rounded-lg transition-colors ${
                            copied === activeTab ? "bg-[#ecfdf5] border-[#a7f3d0] text-[#059669]" : "border-[#e5e7eb] text-[#64748b] hover:border-[#d1d5db]"
                          }`}>
                          {copied === activeTab ? "Copied!" : "Copy Section"}
                        </button>
                        <button onClick={copyAll}
                          className={`px-3.5 py-1.5 text-[12px] font-medium border rounded-lg transition-colors ${
                            copied === "all" ? "bg-[#ecfdf5] border-[#a7f3d0] text-[#059669]" : "border-[#e5e7eb] text-[#64748b] hover:border-[#d1d5db]"
                          }`}>
                          {copied === "all" ? "Copied All!" : "Copy All Sections"}
                        </button>
                        <button onClick={downloadAsTxt}
                          className="px-3.5 py-1.5 text-[12px] font-medium border border-[#e5e7eb] text-[#64748b] hover:border-[#d1d5db] rounded-lg">
                          Download as .txt
                        </button>
                        <button onClick={downloadAsDocx} disabled={exporting}
                          data-testid="export-docx"
                          className="px-3.5 py-1.5 text-[12px] font-medium rounded-lg bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50">
                          {exporting ? "Exporting…" : "Export Word (.docx)"}
                        </button>
                      </div>
                      {/* Proposal Scorer & Outline buttons */}
                      {bdProAccess && (
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={runPinkTeamReview} disabled={reviewLoading}
                            className="px-3.5 py-1.5 text-[12px] font-medium rounded-lg border border-[#f59e0b] text-[#92400e] bg-[#fffbeb] hover:bg-[#fef3c7] disabled:opacity-50 transition-colors">
                            {reviewLoading ? "Reviewing..." : "Proposal Scorer"}
                          </button>
                          <button onClick={generateOutline} disabled={outlineLoading}
                            className="px-3.5 py-1.5 text-[12px] font-medium rounded-lg border border-[#8b5cf6] text-[#5b21b6] bg-[#f5f3ff] hover:bg-[#ede9fe] disabled:opacity-50 transition-colors">
                            {outlineLoading ? "Generating..." : "Generate Outline"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 max-w-[520px] mx-auto">
                      <svg className="w-12 h-12 text-[#d1d5db] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-[14px] text-[#64748b] mb-4 text-center">Generate an AI proposal draft tailored to this contract</p>
                      <div className="w-full mb-3">
                        <label className="block text-[11px] font-medium text-[#64748b] uppercase tracking-wide mb-1.5">
                          Custom instructions (optional)
                        </label>
                        <textarea
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          rows={3}
                          placeholder="e.g. Focus more on our cybersecurity experience, emphasize our local presence in Virginia..."
                          className="w-full px-3 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 resize-none"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => generateDraft(selectedMatch)}
                          className="px-6 py-2.5 text-[14px] font-semibold bg-[#2563eb] text-white rounded-xl hover:bg-[#1d4ed8] transition-colors">
                          Generate Proposal Draft
                        </button>
                        {bdProAccess && (
                          <button onClick={generateOutline} disabled={outlineLoading}
                            className="px-5 py-2.5 text-[14px] font-semibold border border-[#8b5cf6] text-[#5b21b6] rounded-xl hover:bg-[#f5f3ff] disabled:opacity-50 transition-colors">
                            {outlineLoading ? "Generating..." : "Generate Outline"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Regenerate with custom instructions */}
                {proposal && (
                  <div className="px-5 pb-5 border-t border-[#e5e7eb] pt-4">
                    <button onClick={() => setShowInstructions(!showInstructions)}
                      className="text-[12px] text-[#64748b] hover:text-[#0f172a] font-medium">
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

                {/* Proposal Scorer Panel */}
                {showReview && bdProAccess && (
                  <div className="px-5 pb-5 border-t border-[#e5e7eb] pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[14px] font-semibold text-[#0f172a]">Proposal Scorer</h3>
                      <button onClick={() => setShowReview(false)} className="text-[12px] text-[#64748b] hover:text-[#0f172a]">Close</button>
                    </div>
                    {reviewLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 text-[#94a3b8]">
                        <div className="w-6 h-6 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-[13px] font-medium">Running Proposal Scorer...</p>
                        <p className="text-[11px] mt-1">Analyzing proposal strengths & weaknesses</p>
                      </div>
                    ) : reviewError ? (
                      <div className="text-center py-6">
                        <p className="text-[13px] text-[#dc2626] mb-3">{reviewError}</p>
                        <button onClick={runPinkTeamReview}
                          className="px-4 py-2 text-[12px] font-medium bg-[#f59e0b] text-white rounded-lg hover:bg-[#d97706]">
                          Retry Review
                        </button>
                      </div>
                    ) : reviewResult ? (
                      <div className="space-y-4">
                        {/* Score & Win Probability */}
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-medium text-[#64748b] uppercase tracking-wide">Overall Score</span>
                            <span className={`text-[20px] font-bold ${
                              reviewResult.overall_score >= 75 ? "text-[#059669]" :
                              reviewResult.overall_score >= 50 ? "text-[#f59e0b]" : "text-[#dc2626]"
                            }`}>{reviewResult.overall_score}<span className="text-[12px] text-[#94a3b8]">/100</span></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-medium text-[#64748b] uppercase tracking-wide">Win Probability</span>
                            <span className={`text-[13px] font-semibold px-2.5 py-0.5 rounded-full ${
                              reviewResult.win_probability === "High" ? "bg-[#ecfdf5] text-[#059669]" :
                              reviewResult.win_probability === "Medium" ? "bg-[#fffbeb] text-[#92400e]" :
                              "bg-[#fef2f2] text-[#dc2626]"
                            }`}>{reviewResult.win_probability}</span>
                          </div>
                        </div>

                        {/* Section Reviews */}
                        {reviewResult.section_reviews && Object.entries(reviewResult.section_reviews).length > 0 && (
                          <div>
                            <h4 className="text-[11px] font-mono font-medium text-[#64748b] uppercase tracking-wide mb-2">Section Reviews</h4>
                            <div className="space-y-3">
                              {Object.entries(reviewResult.section_reviews).map(([section, review]: [string, any]) => (
                                <div key={section} className="border border-[#e5e7eb] rounded-lg p-3">
                                  <h5 className="text-[13px] font-semibold text-[#0f172a] mb-2 capitalize">
                                    {section.replace(/_/g, " ")}
                                  </h5>
                                  {review.strengths?.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-[11px] font-mono font-medium text-[#059669] uppercase tracking-wide">Strengths</span>
                                      <ul className="mt-1 space-y-0.5">
                                        {review.strengths.map((s: string, i: number) => (
                                          <li key={i} className="text-[12px] text-[#64748b] flex gap-1.5">
                                            <span className="text-[#059669] shrink-0">+</span>{s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {review.weaknesses?.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-[11px] font-mono font-medium text-[#dc2626] uppercase tracking-wide">Weaknesses</span>
                                      <ul className="mt-1 space-y-0.5">
                                        {review.weaknesses.map((w: string, i: number) => (
                                          <li key={i} className="text-[12px] text-[#64748b] flex gap-1.5">
                                            <span className="text-[#dc2626] shrink-0">-</span>{w}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {review.suggestions?.length > 0 && (
                                    <div>
                                      <span className="text-[11px] font-mono font-medium text-[#2563eb] uppercase tracking-wide">Suggestions</span>
                                      <ul className="mt-1 space-y-0.5">
                                        {review.suggestions.map((s: string, i: number) => (
                                          <li key={i} className="text-[12px] text-[#64748b] flex gap-1.5">
                                            <span className="text-[#2563eb] shrink-0">*</span>{s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Compliance Gaps */}
                        {reviewResult.compliance_gaps?.length > 0 && (
                          <div>
                            <h4 className="text-[11px] font-mono font-medium text-[#64748b] uppercase tracking-wide mb-2">Compliance Gaps</h4>
                            <ul className="space-y-1">
                              {reviewResult.compliance_gaps.map((gap: string, i: number) => (
                                <li key={i} className="text-[12px] text-[#64748b] flex gap-1.5">
                                  <span className="text-[#dc2626] shrink-0">!</span>{gap}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Recommended Improvements */}
                        {reviewResult.recommended_improvements?.length > 0 && (
                          <div>
                            <h4 className="text-[11px] font-mono font-medium text-[#64748b] uppercase tracking-wide mb-2">Recommended Improvements</h4>
                            <ul className="space-y-1">
                              {reviewResult.recommended_improvements.map((imp: string, i: number) => (
                                <li key={i} className="text-[12px] text-[#64748b] flex gap-1.5">
                                  <span className="text-[#2563eb] shrink-0">&rarr;</span>{imp}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Proposal Outline Panel */}
                {showOutline && bdProAccess && (
                  <div className="px-5 pb-5 border-t border-[#e5e7eb] pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[14px] font-semibold text-[#0f172a]">Proposal Outline</h3>
                      <button onClick={() => setShowOutline(false)} className="text-[12px] text-[#64748b] hover:text-[#0f172a]">Close</button>
                    </div>
                    {outlineLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 text-[#94a3b8]">
                        <div className="w-6 h-6 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-[13px] font-medium">Generating proposal outline...</p>
                        <p className="text-[11px] mt-1">Building structure and compliance checklist</p>
                      </div>
                    ) : outlineError ? (
                      <div className="text-center py-6">
                        <p className="text-[13px] text-[#dc2626] mb-3">{outlineError}</p>
                        <button onClick={generateOutline}
                          className="px-4 py-2 text-[12px] font-medium bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed]">
                          Retry Outline
                        </button>
                      </div>
                    ) : outlineResult ? (
                      <div className="space-y-4">
                        {/* Page Budget */}
                        {outlineResult.page_budget && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-medium text-[#64748b] uppercase tracking-wide">Page Budget</span>
                            <span className="text-[13px] font-semibold text-[#0f172a]">{outlineResult.page_budget} pages</span>
                          </div>
                        )}

                        {/* Outline Sections */}
                        {outlineResult.outline?.length > 0 && (
                          <div>
                            <h4 className="text-[11px] font-mono font-medium text-[#64748b] uppercase tracking-wide mb-2">Outline</h4>
                            <div className="space-y-3">
                              {outlineResult.outline.map((section: Record<string, any>, idx: number) => (
                                <div key={idx} className="border border-[#e5e7eb] rounded-lg p-3">
                                  <h5 className="text-[13px] font-semibold text-[#0f172a] mb-2">
                                    {idx + 1}. {section.title || section.section || `Section ${idx + 1}`}
                                  </h5>
                                  {section.subsections?.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-[11px] font-mono font-medium text-[#8b5cf6] uppercase tracking-wide">Subsections</span>
                                      <ul className="mt-1 space-y-0.5">
                                        {section.subsections.map((sub: string, i: number) => (
                                          <li key={i} className="text-[12px] text-[#64748b] pl-3">{idx + 1}.{i + 1} {sub}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {section.writing_instructions && (
                                    <div className="mb-2">
                                      <span className="text-[11px] font-mono font-medium text-[#2563eb] uppercase tracking-wide">Writing Instructions</span>
                                      <p className="text-[12px] text-[#64748b] mt-1">{section.writing_instructions}</p>
                                    </div>
                                  )}
                                  {section.key_themes?.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-[11px] font-mono font-medium text-[#059669] uppercase tracking-wide">Key Themes</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {section.key_themes.map((theme: string, i: number) => (
                                          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]">{theme}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {section.evidence_needed?.length > 0 && (
                                    <div>
                                      <span className="text-[11px] font-mono font-medium text-[#f59e0b] uppercase tracking-wide">Evidence Needed</span>
                                      <ul className="mt-1 space-y-0.5">
                                        {section.evidence_needed.map((ev: string, i: number) => (
                                          <li key={i} className="text-[12px] text-[#64748b] flex gap-1.5">
                                            <span className="text-[#f59e0b] shrink-0">&bull;</span>{ev}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Compliance Checklist */}
                        {outlineResult.compliance_checklist?.length > 0 && (
                          <div>
                            <h4 className="text-[11px] font-mono font-medium text-[#64748b] uppercase tracking-wide mb-2">Compliance Checklist</h4>
                            <ul className="space-y-1">
                              {outlineResult.compliance_checklist.map((item: string, i: number) => (
                                <li key={i} className="text-[12px] text-[#64748b] flex items-start gap-1.5">
                                  <input type="checkbox" className="mt-0.5 shrink-0 accent-[#8b5cf6]" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-[#e5e7eb] rounded-xl p-12 text-center">
                <p className="text-[14px] text-[#94a3b8]">Select a contract from the left to generate a proposal</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
