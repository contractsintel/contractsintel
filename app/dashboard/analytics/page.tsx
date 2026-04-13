"use client";

import { useDashboard } from "../context";
import { isTeam } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { InlineGuide } from "../inline-guide";
import { MarketIntelligence } from "./market-intel";

interface AgencyStats {
  agency: string;
  opps_seen: number;
  bids: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_value: number;
}

export default function AnalyticsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  // Do NOT pass `organization` — isTeam(plan, org) returns true during
  // active trials, which incorrectly bypasses the Team-tier gate for
  // Discovery trial users. Check the raw plan value only.
  const teamTier = isTeam(organization.plan, organization);

  const [agencyStats, setAgencyStats] = useState<AgencyStats[]>([]);
  const [lossAnalyses, setLossAnalyses] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<30 | 90 | 365>(90);
  const [recomputing, setRecomputing] = useState(false);
  const [activeTab, setActiveTab] = useState<"performance" | "market">("performance");

  const loadData = useCallback(async () => {
    if (!teamTier) { setLoading(false); return; }

    // P3.1: time-range filter — only matches created within the window
    const cutoff = new Date(Date.now() - timeRange * 86400000).toISOString();

    // Fetch opportunity matches with opportunity details
    const { data: matches } = await supabase
      .from("opportunity_matches")
      .select("*, opportunities(agency, estimated_value)")
      .eq("organization_id", organization.id)
      .gte("created_at", cutoff);

    // Build agency stats
    // C2: counting logic was too strict — "bids" only incremented when
    // pipeline_stage was both set AND not "identified". Many orgs mark
    // opportunities via user_status (bidding/tracking/won/lost) instead of
    // advancing pipeline_stage, which produced 0 bids everywhere. Count as
    // a bid if EITHER column signals that the user has engaged with it.
    const BID_STATUSES = new Set(["bidding", "submitted", "awarded", "won", "lost"]);
    const BID_STAGES = new Set([
      "proposal_draft",
      "submitted",
      "awarded",
      "won",
      "lost",
      "bid",
      "bidding",
    ]);
    const statsMap: Record<string, AgencyStats> = {};
    (matches ?? []).forEach((m: Record<string, any>) => {
      const agency = m.opportunities?.agency ?? "Unknown";
      if (!statsMap[agency]) {
        statsMap[agency] = { agency, opps_seen: 0, bids: 0, wins: 0, losses: 0, win_rate: 0, total_value: 0 };
      }
      statsMap[agency].opps_seen++;

      const stage: string | null = m.pipeline_stage ?? null;
      const userStatus: string | null = m.user_status ?? null;

      const isBid =
        (userStatus && BID_STATUSES.has(userStatus)) ||
        (stage && BID_STAGES.has(stage));
      if (isBid) statsMap[agency].bids++;

      if (userStatus === "won" || stage === "won" || stage === "awarded") {
        statsMap[agency].wins++;
        statsMap[agency].total_value += m.award_amount ?? m.opportunities?.estimated_value ?? 0;
      }
      if (userStatus === "lost" || stage === "lost") {
        statsMap[agency].losses++;
      }
    });

    const stats = Object.values(statsMap).map((s) => ({
      ...s,
      win_rate: s.bids > 0 ? (s.wins / s.bids) * 100 : 0,
    }));
    stats.sort((a, b) => b.opps_seen - a.opps_seen);
    setAgencyStats(stats);

    // Fetch loss analyses (also windowed)
    const { data: analyses } = await supabase
      .from("loss_analyses")
      .select("*")
      .eq("organization_id", organization.id)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });
    setLossAnalyses(analyses ?? []);

    setLoading(false);
  }, [organization.id, teamTier, supabase, timeRange]);

  const recomputeInsights = async () => {
    setRecomputing(true);
    try {
      // Best-effort: hit the existing matching/run endpoint to refresh
      // matches, then reload local state. The loss_analyses table is
      // populated by a separate background job; this endpoint exists.
      await fetch("/api/matching/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: organization.id }),
      });
      await loadData();
    } catch {
      // best-effort
    }
    setRecomputing(false);
  };

  useEffect(() => { loadData(); }, [loadData]);

  const winRateColor = (rate: number, bids: number): string => {
    if (bids < 3) return "text-[#94a3b8]";
    if (rate > 40) return "text-[#22c55e]";
    if (rate >= 20) return "text-[#f59e0b]";
    return "text-[#ef4444]";
  };

  const winRateBg = (rate: number, bids: number): string => {
    if (bids < 3) return "bg-[#9ca3af]/5";
    if (rate > 40) return "bg-[#22c55e]/5";
    if (rate >= 20) return "bg-[#f59e0b]/5";
    return "bg-[#ef4444]/5";
  };

  // Summary stats
  const totalLosses = lossAnalyses.length;
  const reasonCounts: Record<string, number> = {};
  lossAnalyses.forEach((la) => {
    const reason = la.primary_reason ?? "Unknown";
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  });
  const mostCommonReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";
  // P3.1: type-safe lowest win rate (could legitimately be null when nothing has 3+ bids)
  const lowestWinRate: AgencyStats | null =
    agencyStats.filter((s) => s.bids >= 3).sort((a, b) => a.win_rate - b.win_rate)[0] ?? null;

  if (!teamTier) {
    return (
      <div className="relative">
      <InlineGuide page="analytics" />
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#e5e7eb] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#94a3b8] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-serif text-[#0f172a] mb-2">Analytics — Team Feature</h2>
            <p className="text-sm text-[#64748b] mb-4">
              Agency heat maps, win rate analysis, and loss pattern insights.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to Team
            </Link>
          </div>
        </div>
        <div className="filter blur-[2px] opacity-40 pointer-events-none select-none" aria-hidden="true">
          <h1 className="ci-page-title">Analytics</h1>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            {[1,2,3].map(i => (
              <div key={i} className="border border-[#e5e7eb] bg-white p-5">
                <div className="h-2 w-1/3 bg-[#f1f5f9] rounded mb-3" />
                <div className="h-8 w-1/2 bg-[#f1f5f9] rounded mb-2" />
                <div className="h-2 w-2/3 bg-[#f1f5f9] rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#d97706"}} />
          <h1 className="ci-page-title">Analytics</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[#e5e7eb] bg-white mr-3">
            <button
              onClick={() => setActiveTab("performance")}
              className={`px-4 py-1.5 text-[12px] font-medium transition-colors ${activeTab === "performance" ? "bg-[#2563eb] text-white" : "text-[#64748b] hover:text-[#0f172a]"}`}
            >
              Performance
            </button>
            <button
              onClick={() => setActiveTab("market")}
              className={`px-4 py-1.5 text-[12px] font-medium transition-colors ${activeTab === "market" ? "bg-[#2563eb] text-white" : "text-[#64748b] hover:text-[#0f172a]"}`}
            >
              Spend Lens
            </button>
          </div>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(parseInt(e.target.value, 10) as 30 | 90 | 365)}
            className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-white text-[#64748b] focus:outline-none focus:border-[#2563eb]"
          >
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 365 days</option>
          </select>
          <button
            onClick={recomputeInsights}
            disabled={recomputing}
            className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-white text-[#64748b] hover:border-[#d1d5db] disabled:opacity-50 transition-colors"
          >
            {recomputing ? "Recomputing..." : "Recompute insights"}
          </button>
        </div>
      </div>

      {activeTab === "market" ? (
        <MarketIntelligence />
      ) : loading ? (
        <div className="text-center text-[#94a3b8] py-12">Loading analytics...</div>
      ) : (
        <>
          {/* Agency Heat Map Table */}
          <div className="border border-[#e5e7eb] bg-white mb-6">
            <div className="p-5 border-b border-[#e5e7eb]">
              <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8]">Agency Heat Map</h2>
            </div>
            {agencyStats.length === 0 ? (
              <div className="p-12 text-center text-[#94a3b8] text-sm">
                No agency data yet. Track opportunities to build analytics.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] border-b border-[#e5e7eb]">
                    <th className="text-left p-3 pl-5">Agency</th>
                    <th className="text-right p-3">Opps</th>
                    <th className="text-right p-3">Bids</th>
                    <th className="text-right p-3">Wins</th>
                    <th className="text-right p-3">Losses</th>
                    <th className="text-right p-3">Win Rate</th>
                    <th className="text-right p-3 pr-5">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyStats.map((s) => (
                    <tr key={s.agency} className={`border-b border-[#e5e7eb] ${winRateBg(s.win_rate, s.bids)}`}>
                      <td className="p-3 pl-5 text-xs text-[#0f172a]">{s.agency}</td>
                      <td className="p-3 text-xs text-[#64748b] text-right font-mono">{s.opps_seen}</td>
                      <td className="p-3 text-xs text-[#64748b] text-right font-mono">{s.bids}</td>
                      <td className="p-3 text-xs text-[#22c55e] text-right font-mono">{s.wins}</td>
                      <td className="p-3 text-xs text-[#ef4444] text-right font-mono">{s.losses}</td>
                      <td className={`p-3 text-xs text-right font-mono ${winRateColor(s.win_rate, s.bids)}`}>
                        {s.bids < 3 ? "N/A" : `${s.win_rate.toFixed(0)}%`}
                      </td>
                      <td className="p-3 pr-5 text-xs text-[#0f172a] text-right font-mono">
                        ${s.total_value.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* Loss Analysis Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-1">Total Losses Analyzed</div>
              <div className="text-2xl font-mono text-[#0f172a]">{totalLosses}</div>
            </div>
            <div className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-1">Most Common Reason</div>
              <div className="text-sm text-[#0f172a] mt-1">{mostCommonReason}</div>
            </div>
            <div className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-1">Lowest Win Rate Agency</div>
              <div className="text-sm text-[#0f172a] mt-1">
                {lowestWinRate ? `${lowestWinRate.agency} (${lowestWinRate.win_rate.toFixed(0)}%)` : "Need more data"}
              </div>
            </div>
          </div>

          {/* Loss Analyses */}
          <div className="border border-[#e5e7eb] bg-white">
            <div className="p-5 border-b border-[#e5e7eb]">
              <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8]">Loss Analysis Insights</h2>
            </div>
            {lossAnalyses.length === 0 ? (
              <div className="p-12 text-center text-[#94a3b8] text-sm">
                No loss analyses yet. Losses will be analyzed automatically.
              </div>
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {lossAnalyses.map((la) => (
                  <div key={la.id} className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-sm text-[#0f172a] font-medium">{la.opportunity_title ?? "Unknown"}</h3>
                        <p className="text-xs text-[#94a3b8] font-mono mt-0.5">{la.agency ?? ""}</p>
                      </div>
                      {la.primary_reason && (
                        <span className="px-2 py-0.5 text-[10px] font-mono bg-[#ef4444]/10 text-[#ef4444]">
                          {la.primary_reason}
                        </span>
                      )}
                    </div>
                    {la.ai_insights && (
                      <p className="text-sm text-[#64748b]">{la.ai_insights}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
