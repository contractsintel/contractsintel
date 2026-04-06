"use client";

import { useDashboard } from "./context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "./help-panel";
import { DemoBanner } from "./demo-banner";
import { InlineGuide } from "./inline-guide";

function formatCurrency(n: number | null): string {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function deadlineLabel(date: string | null): string {
  const d = daysUntil(date);
  if (d === null) return "TBD";
  if (d < 0) return "Expired";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `${d}d left`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-[#22c55e]";
  if (score >= 60) return "text-[#3b82f6]";
  if (score >= 40) return "text-[#f59e0b]";
  return "text-[#9ca3af]";
}

function recBadge(rec: string) {
  const map: Record<string, string> = {
    bid: "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20",
    review: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
    skip: "bg-[#9ca3af]/10 text-[#9ca3af] border-[#9ca3af]/20",
  };
  return map[rec] ?? map.skip;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type SortOption = "score" | "deadline" | "value";
type FilterState = {
  setAside: string;
  agency: string;
  minScore: number;
  sort: SortOption;
};

export default function DashboardPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    setAside: "",
    agency: "",
    minScore: 0,
    sort: "score",
  });
  const [complianceAlerts, setComplianceAlerts] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("opportunity_matches")
      .select("*, opportunities(*)")
      .eq("organization_id", organization.id)
      .order("match_score", { ascending: false })
      .limit(50);
    setMatches(data ?? []);

    const { data: compliance } = await supabase
      .from("compliance_items")
      .select("*")
      .eq("organization_id", organization.id)
      .lte("due_date", new Date(Date.now() + 7 * 86400000).toISOString())
      .eq("status", "pending")
      .limit(5);
    setComplianceAlerts(compliance ?? []);

    setLoading(false);
  }, [organization.id, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateStatus = async (matchId: string, status: string) => {
    await supabase
      .from("opportunity_matches")
      .update({ user_status: status, pipeline_stage: status === "bidding" ? "preparing_bid" : status === "tracking" ? "monitoring" : null })
      .eq("id", matchId);
    loadData();
  };

  // Filter and sort
  const filtered = matches
    .filter((m) => {
      const opp = m.opportunities;
      if (!opp) return false;
      if (filters.setAside && opp.set_aside !== filters.setAside) return false;
      if (filters.agency && !opp.agency?.toLowerCase().includes(filters.agency.toLowerCase())) return false;
      if (m.match_score < filters.minScore) return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "score") return (b.match_score ?? 0) - (a.match_score ?? 0);
      if (filters.sort === "value") return (b.opportunities?.estimated_value ?? 0) - (a.opportunities?.estimated_value ?? 0);
      if (filters.sort === "deadline") {
        const da = daysUntil(a.opportunities?.response_deadline) ?? 999;
        const db = daysUntil(b.opportunities?.response_deadline) ?? 999;
        return da - db;
      }
      return 0;
    });

  // Stats
  const totalValue = matches.reduce((s, m) => s + (m.opportunities?.estimated_value ?? 0), 0);
  const urgentCount = matches.filter((m) => {
    const d = daysUntil(m.opportunities?.response_deadline);
    return d !== null && d >= 0 && d <= 7;
  }).length;
  const topScore = matches.length ? Math.max(...matches.map((m) => m.match_score ?? 0)) : 0;

  // Pipeline summary
  const pipelineCounts = matches.reduce(
    (acc, m) => {
      const stage = m.pipeline_stage ?? "new";
      acc[stage] = (acc[stage] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Unique filters
  const setAsides = Array.from(new Set(matches.map((m) => m.opportunities?.set_aside).filter(Boolean)));

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-serif text-[#111827]">
            {greeting()}, {organization.name}
          </h1>
          <p className="text-sm text-[#9ca3af] mt-1 font-mono">{today}</p>
        </div>
        <HelpButton page="dashboard" />
      </div>
      <InlineGuide page="dashboard" />

      {/* Demo Banner */}
      {matches.some((m: any) => m.is_demo) && <DemoBanner />}

      {/* Stats Bar */}
      <div data-tour="stats-bar" className="grid grid-cols-4 gap-px bg-[#e5e7eb] border border-[#e5e7eb] mb-6">
        <div className="bg-white p-5">
          <div className="text-2xl font-bold text-[#111827] font-mono">{matches.length}</div>
          <div className="text-xs text-[#9ca3af] mt-1 font-mono uppercase tracking-wider">New Matches</div>
        </div>
        <div className="bg-white p-5">
          <div className="text-2xl font-bold text-[#3b82f6] font-mono">{formatCurrency(totalValue)}</div>
          <div className="text-xs text-[#9ca3af] mt-1 font-mono uppercase tracking-wider">Total Value</div>
        </div>
        <div className="bg-white p-5">
          <div className="text-2xl font-bold text-[#f59e0b] font-mono">{urgentCount}</div>
          <div className="text-xs text-[#9ca3af] mt-1 font-mono uppercase tracking-wider">Urgent (&lt;7d)</div>
        </div>
        <div className="bg-white p-5">
          <div className="text-2xl font-bold text-[#22c55e] font-mono">{topScore}</div>
          <div className="text-xs text-[#9ca3af] mt-1 font-mono uppercase tracking-wider">Top Score</div>
        </div>
      </div>

      {/* Compliance Alert */}
      {complianceAlerts.length > 0 && (
        <div className="border border-[#e5e7eb] border-l-4 border-l-[#f59e0b] bg-white p-4 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-[#f59e0b]" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium text-[#f59e0b]">
              {complianceAlerts.length} compliance item{complianceAlerts.length > 1 ? "s" : ""} due within 7 days
            </span>
          </div>
          <p className="text-xs text-[#4b5563]">
            {complianceAlerts.map((a) => a.title).join(", ")}
          </p>
        </div>
      )}

      <div className="flex gap-6">
        {/* Main Column */}
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={filters.setAside}
              onChange={(e) => setFilters((f) => ({ ...f, setAside: e.target.value }))}
              className="bg-[#f8f9fb] border border-[#e5e7eb] text-[#4b5563] text-xs px-3 py-2 focus:outline-none focus:border-[#2563eb]"
            >
              <option value="">All Set-Asides</option>
              {setAsides.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Filter agency..."
              value={filters.agency}
              onChange={(e) => setFilters((f) => ({ ...f, agency: e.target.value }))}
              className="bg-[#f8f9fb] border border-[#e5e7eb] text-[#4b5563] text-xs px-3 py-2 w-40 focus:outline-none focus:border-[#2563eb]"
            />
            <select
              value={filters.minScore}
              onChange={(e) => setFilters((f) => ({ ...f, minScore: Number(e.target.value) }))}
              className="bg-[#f8f9fb] border border-[#e5e7eb] text-[#4b5563] text-xs px-3 py-2 focus:outline-none focus:border-[#2563eb]"
            >
              <option value={0}>Min Score: Any</option>
              <option value={50}>50+</option>
              <option value={70}>70+</option>
              <option value={85}>85+</option>
            </select>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortOption }))}
              className="bg-[#f8f9fb] border border-[#e5e7eb] text-[#4b5563] text-xs px-3 py-2 focus:outline-none focus:border-[#2563eb]"
            >
              <option value="score">Sort: Score</option>
              <option value="deadline">Sort: Deadline</option>
              <option value="value">Sort: Value</option>
            </select>
          </div>

          {/* Opportunity Cards */}
          {loading ? (
            <div className="border border-[#e5e7eb] bg-white p-12 text-center text-[#9ca3af]">
              Loading matches...
            </div>
          ) : filtered.length === 0 ? (
            <div className="border border-[#e5e7eb] bg-white p-12 text-center">
              <div className="text-[#9ca3af] text-lg mb-2">No matches found</div>
              <p className="text-[#4b5563] text-sm">
                Try adjusting your filters or{" "}
                <Link href="/dashboard/settings" className="text-[#3b82f6]">
                  update your profile
                </Link>{" "}
                for better matches.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((match) => {
                const opp = match.opportunities;
                if (!opp) return null;
                const days = daysUntil(opp.response_deadline);
                const deadlineColor =
                  days !== null && days <= 3
                    ? "text-[#ef4444]"
                    : days !== null && days <= 7
                    ? "text-[#f59e0b]"
                    : "text-[#4b5563]";

                return (
                  <div
                    key={match.id}
                    data-tour={match === filtered[0] ? "opportunity-card" : undefined}
                    className="border border-[#e5e7eb] bg-white hover:border-[#d1d5db] transition-colors"
                  >
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Score */}
                        <div className={`text-3xl font-bold font-mono ${scoreColor(match.match_score)} w-14 text-center shrink-0`}>
                          {match.match_score}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-[#111827] font-medium text-sm truncate">
                              {opp.title}
                            </h3>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-mono uppercase border shrink-0 ${recBadge(
                                match.bid_recommendation
                              )}`}
                            >
                              {match.bid_recommendation}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-[#4b5563] mb-2">
                            <span>{opp.agency}</span>
                            {opp.solicitation_number && (
                              <>
                                <span className="text-[#e5e7eb]">|</span>
                                <span className="font-mono">{opp.solicitation_number}</span>
                              </>
                            )}
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {opp.set_aside && (
                              <span className="px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#e5e7eb] text-[#4b5563]">
                                {opp.set_aside}
                              </span>
                            )}
                            {opp.naics_code && (
                              <span className="px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#e5e7eb] text-[#4b5563] font-mono">
                                NAICS {opp.naics_code}
                              </span>
                            )}
                            {opp.place_of_performance && (
                              <span className="px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#e5e7eb] text-[#4b5563]">
                                {opp.place_of_performance}
                              </span>
                            )}
                          </div>

                          {/* AI Reasoning */}
                          {match.reasoning && (
                            <p data-tour={match === filtered[0] ? "ai-recommendation" : undefined} className="text-xs text-[#9ca3af] mb-3 line-clamp-2">{match.reasoning}</p>
                          )}

                          {/* Bottom row: value, deadline, actions */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              {opp.estimated_value && (
                                <span className="text-sm font-mono text-[#111827]">
                                  {formatCurrency(opp.estimated_value)}
                                </span>
                              )}
                              <span className={`text-xs font-mono ${deadlineColor}`}>
                                {deadlineLabel(opp.response_deadline)}
                              </span>
                            </div>
                            <div data-tour={match === filtered[0] ? "action-buttons" : undefined} className="flex items-center gap-2">
                              <button
                                onClick={() => updateStatus(match.id, "tracking")}
                                className="px-3 py-1 text-xs border border-[#e5e7eb] text-[#4b5563] hover:border-[#d1d5db] hover:text-[#111827] transition-colors"
                              >
                                Track
                              </button>
                              <button
                                onClick={() => updateStatus(match.id, "bidding")}
                                className="px-3 py-1 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors"
                              >
                                Bid
                              </button>
                              <button
                                onClick={() => updateStatus(match.id, "skipped")}
                                className="px-3 py-1 text-xs text-[#9ca3af] hover:text-[#4b5563] transition-colors"
                              >
                                Skip
                              </button>
                              {opp.sam_url && (
                                <a
                                  href={opp.sam_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1 text-xs text-[#3b82f6] hover:text-[#111827] transition-colors"
                                >
                                  SAM.gov
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-[300px] shrink-0 hidden lg:block space-y-4">
          {/* Pipeline Summary */}
          <div className="border border-[#e5e7eb] bg-white p-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
              Pipeline Summary
            </h3>
            {[
              { label: "Monitoring", key: "monitoring" },
              { label: "Preparing Bid", key: "preparing_bid" },
              { label: "Submitted", key: "submitted" },
              { label: "Won", key: "won" },
              { label: "Lost", key: "lost" },
            ].map((s) => (
              <div key={s.key} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-[#4b5563]">{s.label}</span>
                <span className="text-xs font-mono text-[#111827]">{pipelineCounts[s.key] ?? 0}</span>
              </div>
            ))}
            <Link
              href="/dashboard/pipeline"
              className="block mt-3 text-xs text-[#3b82f6] hover:text-[#111827] transition-colors"
            >
              View Pipeline →
            </Link>
          </div>

          {/* Compliance Score */}
          <div className="border border-[#e5e7eb] bg-white p-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
              Compliance Health
            </h3>
            <div className="text-3xl font-bold font-mono text-[#22c55e] mb-2">--</div>
            <div className="w-full h-1.5 bg-[#f8f9fb]">
              <div className="h-full bg-[#22c55e] w-0" />
            </div>
            <Link
              href="/dashboard/compliance"
              className="block mt-3 text-xs text-[#3b82f6] hover:text-[#111827] transition-colors"
            >
              View Compliance →
            </Link>
          </div>

          {/* Upcoming Deadlines */}
          <div className="border border-[#e5e7eb] bg-white p-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
              Upcoming Deadlines
            </h3>
            {matches
              .filter((m) => {
                const d = daysUntil(m.opportunities?.response_deadline);
                return d !== null && d >= 0 && d <= 14;
              })
              .sort(
                (a, b) =>
                  (daysUntil(a.opportunities?.response_deadline) ?? 999) -
                  (daysUntil(b.opportunities?.response_deadline) ?? 999)
              )
              .slice(0, 5)
              .map((m) => {
                const d = daysUntil(m.opportunities?.response_deadline);
                const color = d !== null && d <= 3 ? "text-[#ef4444]" : d !== null && d <= 7 ? "text-[#f59e0b]" : "text-[#4b5563]";
                return (
                  <div key={m.id} className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-[#4b5563] truncate mr-2">
                      {m.opportunities?.title}
                    </span>
                    <span className={`text-xs font-mono shrink-0 ${color}`}>
                      {deadlineLabel(m.opportunities?.response_deadline)}
                    </span>
                  </div>
                );
              })}
            {matches.filter((m) => {
              const d = daysUntil(m.opportunities?.response_deadline);
              return d !== null && d >= 0 && d <= 14;
            }).length === 0 && (
              <p className="text-xs text-[#9ca3af]">No upcoming deadlines</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
