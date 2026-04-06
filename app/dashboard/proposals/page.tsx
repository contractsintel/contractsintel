"use client";
"use client";

import { useDashboard } from "../context";
import { isDiscovery } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";

const TABS = ["Technical Approach", "Past Performance", "Executive Summary"] as const;
type Tab = (typeof TABS)[number];

export default function ProposalsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const locked = isDiscovery(organization.plan, organization);

  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<Record<Tab, string> | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Technical Approach");
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    const { data } = await supabase
      .from("opportunity_matches")
      .select("*, opportunities(*)")
      .eq("organization_id", organization.id)
      .eq("user_status", "bidding")
      .order("match_score", { ascending: false });
    setMatches(data ?? []);
    setLoading(false);
  }, [organization.id, locked, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const generateDraft = async (matchId: string) => {
    setGenerating(true);
    setSelectedMatch(matchId);
    setProposal(null);
    try {
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, organization_id: organization.id }),
      });
      const data = await res.json();
      if (data.proposal) {
        setProposal(data.proposal);
      }
    } catch {
      // handle error silently
    }
    setGenerating(false);
  };

  const copyToClipboard = () => {
    if (!proposal) return;
    navigator.clipboard.writeText(proposal[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadProposal = () => {
    if (!proposal) return;
    const text = TABS.map((t) => `# ${t}\n\n${proposal[t]}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "proposal-draft.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (locked) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#1e2535] bg-[#0d1018] p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#4a5a75] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-serif text-[#e8edf8] mb-2">AI Proposals — BD Pro Feature</h2>
            <p className="text-sm text-[#8b9ab5] mb-4">
              Generate tailored proposal drafts with AI. Upgrade to BD Pro to unlock this feature.
            </p>
            <Link
              href="/dashboard/settings"
              className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
            >
              Upgrade to BD Pro
            </Link>
          </div>
        </div>
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="text-2xl font-serif text-[#e8edf8] mb-6">AI Proposals</h1>
          <div className="border border-[#1e2535] bg-[#0d1018] p-12 text-center text-[#4a5a75]">
            Sample proposal content would appear here...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-[#e8edf8]">AI Proposals</h1>
        <HelpButton page="proposals" />
      </div>
      <InlineGuide page="proposals" />
      <TrialTierBanner page="proposals" />
      <div style={{display:'none'}}>
      </div>

      {loading ? (
        <div className="text-center text-[#4a5a75] py-12">Loading opportunities...</div>
      ) : matches.length === 0 ? (
        <div className="border border-[#1e2535] bg-[#0d1018] p-12 text-center">
          <div className="text-[#4a5a75] text-lg mb-2">No active bids</div>
          <p className="text-sm text-[#8b9ab5]">
            Mark opportunities as &quot;Bidding&quot; from the{" "}
            <Link href="/dashboard" className="text-[#3b82f6]">dashboard</Link> to generate proposals.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Opportunity List */}
          <div className="col-span-1 space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-3">Active Bids</h2>
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMatch(m.id)}
                className={`w-full text-left border p-3 transition-colors ${
                  selectedMatch === m.id
                    ? "border-[#2563eb] bg-[#2563eb]/5"
                    : "border-[#1e2535] bg-[#0d1018] hover:border-[#2a3548]"
                }`}
              >
                <h3 className="text-xs text-[#e8edf8] font-medium truncate">{m.opportunities?.title}</h3>
                <p className="text-[10px] text-[#8b9ab5] mt-1">{m.opportunities?.agency}</p>
              </button>
            ))}
          </div>

          {/* Proposal Viewer */}
          <div className="col-span-2">
            {selectedMatch ? (
              <div className="border border-[#1e2535] bg-[#0d1018]">
                <div className="flex items-center justify-between p-4 border-b border-[#1e2535]">
                  <div className="flex gap-1">
                    {TABS.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 text-xs transition-colors ${
                          activeTab === tab
                            ? "bg-[#2563eb] text-white"
                            : "text-[#8b9ab5] hover:text-[#e8edf8]"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyToClipboard}
                      disabled={!proposal}
                      className="px-3 py-1 text-xs border border-[#1e2535] text-[#8b9ab5] hover:border-[#2a3548] disabled:opacity-30 transition-colors"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={downloadProposal}
                      disabled={!proposal}
                      className="px-3 py-1 text-xs border border-[#1e2535] text-[#8b9ab5] hover:border-[#2a3548] disabled:opacity-30 transition-colors"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => selectedMatch && generateDraft(selectedMatch)}
                      disabled={generating}
                      className="px-3 py-1 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] disabled:opacity-50 transition-colors"
                    >
                      {generating ? "Generating..." : proposal ? "Regenerate" : "Generate Draft"}
                    </button>
                  </div>
                </div>
                <div className="p-6 min-h-[400px]">
                  {generating ? (
                    <div className="text-center text-[#4a5a75] py-12">
                      <div className="animate-pulse">Generating proposal draft with AI...</div>
                    </div>
                  ) : proposal ? (
                    <div className="text-sm text-[#8b9ab5] whitespace-pre-wrap leading-relaxed">
                      {proposal[activeTab]}
                    </div>
                  ) : (
                    <div className="text-center text-[#4a5a75] py-12">
                      Click &quot;Generate Draft&quot; to create an AI-powered proposal
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-[#1e2535] bg-[#0d1018] p-12 text-center text-[#4a5a75]">
                Select an opportunity to generate a proposal
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
