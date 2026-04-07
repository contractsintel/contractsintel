"use client";

import { useDashboard } from "../context";
import { isTeam } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { InlineGuide } from "../inline-guide";

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
  const teamTier = isTeam(organization.plan, organization);

  const [agencyStats, setAgencyStats] = useState<AgencyStats[]>([]);
  const [lossAnalyses, setLossAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!teamTier) { setLoading(false); return; }

    // Fetch opportunity matches with opportunity details
    const { data: matches } = await supabase
      .from("opportunity_matches")
      .select("*, opportunities(agency, estimated_value)")
      .eq("organization_id", organization.id);

    // Build agency stats
    const statsMap: Record<string, AgencyStats> = {};
    (matches ?? []).forEach((m: any) => {
      const agency = m.opportunities?.agency ?? "Unknown";
      if (!statsMap[agency]) {
        statsMap[agency] = { agency, opps_seen: 0, bids: 0, wins: 0, losses: 0, win_rate: 0, total_value: 0 };
      }
      statsMap[agency].opps_seen++;
      if (m.pipeline_stage && m.pipeline_stage !== "identified") {
        statsMap[agency].bids++;
      }
      if (m.user_status === "won" || m.pipeline_stage === "won") {
        statsMap[agency].wins++;
        statsMap[agency].total_value += m.award_amount ?? m.opportunities?.estimated_value ?? 0;
      }
      if (m.user_status === "lost" || m.pipeline_stage === "lost") {
        statsMap[agency].losses++;
      }
    });

    const stats = Object.values(statsMap).map((s) => ({
      ...s,
      win_rate: s.bids > 0 ? (s.wins / s.bids) * 100 : 0,
    }));
    stats.sort((a, b) => b.opps_seen - a.opps_seen);
    setAgencyStats(stats);

    // Fetch loss analyses
    const { data: analyses } = await supabase
      .from("loss_analyses")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    setLossAnalyses(analyses ?? []);

    setLoading(false);
  }, [organization.id, teamTier, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const winRateColor = (rate: number, bids: number): string => {
    if (bids < 3) return "text-[#9ca3af]";
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
  const lowestWinRate = agencyStats.filter((s) => s.bids >= 3).sort((a, b) => a.win_rate - b.win_rate);

  if (!teamTier) {
    return (
      <div className="relative">
      <InlineGuide page="analytics" />
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#f0f1f3] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-serif text-[#111827] mb-2">Analytics — Team Feature</h2>
            <p className="text-sm text-[#4b5563] mb-4">
              Agency heat maps, win rate analysis, and loss pattern insights.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to Team
            </Link>
          </div>
        </div>
        <div className="filter blur-[2px] opacity-40 pointer-events-none">
          <h1 className="ci-page-title">Analytics</h1>
<div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af]">
            Sample analytics content...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#d97706"}} />
        <h1 className="ci-page-title">Analytics</h1>
</div>

      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading analytics...</div>
      ) : (
        <>
          {/* Agency Heat Map Table */}
          <div className="border border-[#f0f1f3] bg-white mb-6">
            <div className="p-5 border-b border-[#e5e7eb]">
              <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af]">Agency Heat Map</h2>
            </div>
            {agencyStats.length === 0 ? (
              <div className="p-12 text-center text-[#9ca3af] text-sm">
                No agency data yet. Track opportunities to build analytics.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af] border-b border-[#e5e7eb]">
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
                      <td className="p-3 pl-5 text-xs text-[#111827]">{s.agency}</td>
                      <td className="p-3 text-xs text-[#4b5563] text-right font-mono">{s.opps_seen}</td>
                      <td className="p-3 text-xs text-[#4b5563] text-right font-mono">{s.bids}</td>
                      <td className="p-3 text-xs text-[#22c55e] text-right font-mono">{s.wins}</td>
                      <td className="p-3 text-xs text-[#ef4444] text-right font-mono">{s.losses}</td>
                      <td className={`p-3 text-xs text-right font-mono ${winRateColor(s.win_rate, s.bids)}`}>
                        {s.bids < 3 ? "N/A" : `${s.win_rate.toFixed(0)}%`}
                      </td>
                      <td className="p-3 pr-5 text-xs text-[#111827] text-right font-mono">
                        ${s.total_value.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Loss Analysis Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af] mb-1">Total Losses Analyzed</div>
              <div className="text-2xl font-mono text-[#111827]">{totalLosses}</div>
            </div>
            <div className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af] mb-1">Most Common Reason</div>
              <div className="text-sm text-[#111827] mt-1">{mostCommonReason}</div>
            </div>
            <div className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af] mb-1">Lowest Win Rate Agency</div>
              <div className="text-sm text-[#111827] mt-1">
                {lowestWinRate[0] ? `${lowestWinRate[0].agency} (${lowestWinRate[0].win_rate.toFixed(0)}%)` : "N/A"}
              </div>
            </div>
          </div>

          {/* Loss Analyses */}
          <div className="border border-[#f0f1f3] bg-white">
            <div className="p-5 border-b border-[#e5e7eb]">
              <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#9ca3af]">Loss Analysis Insights</h2>
            </div>
            {lossAnalyses.length === 0 ? (
              <div className="p-12 text-center text-[#9ca3af] text-sm">
                No loss analyses yet. Losses will be analyzed automatically.
              </div>
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {lossAnalyses.map((la) => (
                  <div key={la.id} className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-sm text-[#111827] font-medium">{la.opportunity_title ?? "Unknown"}</h3>
                        <p className="text-xs text-[#9ca3af] font-mono mt-0.5">{la.agency ?? ""}</p>
                      </div>
                      {la.primary_reason && (
                        <span className="px-2 py-0.5 text-[10px] font-mono bg-[#ef4444]/10 text-[#ef4444]">
                          {la.primary_reason}
                        </span>
                      )}
                    </div>
                    {la.ai_insights && (
                      <p className="text-sm text-[#4b5563]">{la.ai_insights}</p>
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
