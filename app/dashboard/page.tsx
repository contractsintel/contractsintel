"use client";

import { useDashboard } from "./context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "./help-panel";
import { DemoBanner } from "./demo-banner";
import { InlineGuide } from "./inline-guide";
import { seedDemoData } from "@/lib/demo-data";

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

type SortOption = "score" | "deadline" | "value";
type SourceFilter = "" | "federal" | "state" | "military" | "sbir" | "grants" | "subcontracting" | "recompetes";
type FilterState = {
  setAside: string;
  agency: string;
  minScore: number;
  sort: SortOption;
  source: SourceFilter;
};

function getSourceCategory(source: string | null | undefined, bidRec?: string): string {
  if (bidRec === "recompete_alert") return "recompetes";
  if (!source) return "federal";
  if (source.startsWith("state_")) return "state";
  if (["dla_dibbs", "army_asfi", "army_acc", "navy_neco", "air_force", "marines", "disa", "darpa", "dha", "mda", "space_force", "usace", "socom", "dcsa", "military_defense"].includes(source)) return "military";
  if (source.startsWith("sbir_") || source === "sbir_sttr") return "sbir";
  if (source === "grants_gov") return "grants";
  if (["sba_subnet", "gsa_subcontracting", "subcontracting"].includes(source)) return "subcontracting";
  return "federal";
}

function sourceBadge(source: string | null | undefined, bidRec?: string) {
  const cat = getSourceCategory(source, bidRec);
  const badges: Record<string, { bg: string; text: string; label: string }> = {
    federal: { bg: "bg-[#eff4ff]", text: "text-[#2563eb]", label: "Federal" },
    state: { bg: "bg-[#ecfdf5]", text: "text-[#059669]", label: source?.startsWith("state_") ? source.replace("state_", "") : "State" },
    military: { bg: "bg-[#f1f5f9]", text: "text-[#475569]", label: "Military" },
    sbir: { bg: "bg-[#f5f3ff]", text: "text-[#7c3aed]", label: "SBIR" },
    grants: { bg: "bg-[#fffbeb]", text: "text-[#d97706]", label: "Grant" },
    subcontracting: { bg: "bg-[#f0fdfa]", text: "text-[#0d9488]", label: "SubK" },
    recompetes: { bg: "bg-[#fef2f2]", text: "text-[#dc2626]", label: "Recompete" },
  };
  const b = badges[cat] ?? badges.federal;
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-mono uppercase rounded-full ${b.bg} ${b.text}`}>
      {b.label}
    </span>
  );
}

export default function DashboardPage() {
  const { organization, user } = useDashboard();
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    setAside: "",
    agency: "",
    minScore: 0,
    sort: "score",
    source: "",
  });
  const [complianceAlerts, setComplianceAlerts] = useState<any[]>([]);
  const [seedingDemo, setSeedingDemo] = useState(false);

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

  const [toast, setToast] = useState<string | null>(null);
  const [fadingOut, setFadingOut] = useState<string | null>(null);

  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const updateStatus = async (matchId: string, status: string) => {
    if (status === "skipped") {
      setFadingOut(matchId);
      await new Promise((r) => setTimeout(r, 300));
    }

    try {
      const res = await fetch("/api/opportunities/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, status }),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        console.error("Update failed:", result);
        setToast("Error — " + (result.error || "try again"));
        setFadingOut(null);
        return;
      }

      const msgs: Record<string, string> = {
        tracking: "✓ Tracking — added to Pipeline",
        bidding: "✓ Preparing Bid — added to Pipeline",
        skipped: "Skipped",
      };
      setToast(msgs[status] || "Updated");
    } catch (err) {
      console.error("Network error:", err);
      setToast("Network error — try again");
      setFadingOut(null);
      return;
    }

    setTimeout(() => setToast(null), 3000);
    setFadingOut(null);
    loadData();
  };

  const handleSeedDemo = async () => {
    setSeedingDemo(true);
    try {
      await seedDemoData(supabase, organization.id);
      await loadData();
    } finally {
      setSeedingDemo(false);
    }
  };

  // Filter and sort
  const filtered = matches
    .filter((m) => {
      const opp = m.opportunities;
      if (!opp) return false;
      if (filters.setAside && opp.set_aside !== filters.setAside) return false;
      if (filters.agency && !opp.agency?.toLowerCase().includes(filters.agency.toLowerCase())) return false;
      if (m.match_score < filters.minScore) return false;
      if (filters.source) {
        const cat = getSourceCategory(opp.source, m.bid_recommendation);
        if (cat !== filters.source) return false;
      }
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

  // Source breakdown counts
  const sourceCounts = matches.reduce(
    (acc, m) => {
      const cat = getSourceCategory(m.opportunities?.source, m.bid_recommendation);
      acc[cat] = (acc[cat] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Unique filters
  const setAsides = Array.from(new Set(matches.map((m) => m.opportunities?.set_aside).filter(Boolean)));

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Use user's full name first, then org name, but never show an email address
  const rawName = user.full_name || organization.name || "there";
  const cleanName = rawName.includes("@") ? rawName.split("@")[0] : rawName;
  const displayName = cleanName.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

  return (
    <div>
      {/* Hero Greeting Card */}
      <div className="relative overflow-hidden mb-8 p-8" style={{background: "linear-gradient(135deg, #eff6ff 0%, #f5f3ff 50%, #ecfdf5 100%)", borderRadius: "16px", border: "1px solid rgba(37,99,235,0.08)"}}>
        {/* Decorative blurred circles */}
        <div className="absolute -top-10 -right-10 w-[120px] h-[120px] rounded-full" style={{background: "rgba(37,99,235,0.06)", filter: "blur(40px)"}} />
        <div className="absolute top-20 -right-5 w-[80px] h-[80px] rounded-full" style={{background: "rgba(124,58,237,0.05)", filter: "blur(30px)"}} />
        <div className="absolute -bottom-8 right-20 w-[100px] h-[100px] rounded-full" style={{background: "rgba(5,150,105,0.04)", filter: "blur(35px)"}} />

        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="font-['DM_Serif_Display'] text-[32px] font-bold tracking-[-0.02em] text-[#0f172a]">
              {greeting}, {displayName}
            </h1>
            <p className="text-sm text-[#64748b] mt-2 font-['JetBrains_Mono']">{today}</p>
            {!loading && (
              <p className="text-[15px] text-[#475569] mt-2 font-medium">
                {matches.length > 0
                  ? `You have ${matches.length} new match${matches.length === 1 ? "" : "es"} today`
                  : "Your first digest arrives tomorrow at 7am"}
              </p>
            )}
          </div>
          <HelpButton page="dashboard" />
        </div>
      </div>
      <InlineGuide page="dashboard" />

      {/* Demo Banner */}
      {matches.some((m: any) => m.is_demo) && <DemoBanner />}

      {/* Stats Bar */}
      <div data-tour="stats-bar" className="grid grid-cols-4 gap-4 mb-6">
        {[
          { value: matches.length, label: "New Matches", color: "#2563eb", gradient: "linear-gradient(135deg, #eff6ff, #fff)", icon: <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /> },
          { value: formatCurrency(totalValue), label: "Total Value", color: "#059669", gradient: "linear-gradient(135deg, #ecfdf5, #fff)", icon: <path strokeLinecap="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
          { value: urgentCount, label: "Urgent (<7d)", color: "#dc2626", gradient: "linear-gradient(135deg, #fef2f2, #fff)", icon: <path strokeLinecap="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
          { value: topScore, label: "Top Score", color: "#d97706", gradient: "linear-gradient(135deg, #fffbeb, #fff)", icon: <path strokeLinecap="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /> },
        ].map((stat) => (
          <div key={stat.label} className="relative overflow-hidden min-h-[120px] p-6 border border-[#f0f1f3] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-200 cursor-default" style={{background: stat.gradient, borderTop: `3px solid ${stat.color}`}}>
            <div className="font-['DM_Serif_Display'] text-[44px] font-extrabold tracking-[-0.03em] leading-none" style={{color: stat.color}}>{stat.value}</div>
            <div className="flex items-center gap-1.5 mt-3">
              <svg className="w-3.5 h-3.5" style={{color: stat.color}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>{stat.icon}</svg>
              <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.08em] text-[#94a3b8]">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Source Breakdown */}
      {!loading && matches.length > 0 && (
        <div className="mb-4 px-1">
          <div className="flex items-center gap-3 font-['JetBrains_Mono'] text-[11px] text-[#94a3b8]">
            {sourceCounts.federal ? <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2563eb]" />{sourceCounts.federal} federal</span> : null}
            {sourceCounts.state ? <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#059669]" />{sourceCounts.state} state</span> : null}
            {sourceCounts.military ? <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#475569]" />{sourceCounts.military} military</span> : null}
            {sourceCounts.sbir ? <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#7c3aed]" />{sourceCounts.sbir} SBIR</span> : null}
            {sourceCounts.grants ? <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#d97706]" />{sourceCounts.grants} grants</span> : null}
            {sourceCounts.recompetes ? <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#dc2626]" />{sourceCounts.recompetes} recompetes</span> : null}
          </div>
        </div>
      )}

      {/* Compliance Alert */}
      {complianceAlerts.length > 0 && (
        <div className="border border-[#f0f1f3] border-l-4 border-l-[#f59e0b] bg-white p-4 mb-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
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
              value={filters.source}
              onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value as SourceFilter }))}
              className="bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#2563eb] transition-all duration-200"
            >
              <option value="">All Sources</option>
              <option value="federal">Federal</option>
              <option value="state">State & Local</option>
              <option value="military">Military</option>
              <option value="sbir">SBIR/STTR</option>
              <option value="grants">Grants</option>
              <option value="subcontracting">Subcontracting</option>
              <option value="recompetes">Recompetes</option>
            </select>
            <select
              value={filters.setAside}
              onChange={(e) => setFilters((f) => ({ ...f, setAside: e.target.value }))}
              className="bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#2563eb] transition-all duration-200"
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
              className="bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#2563eb] transition-all duration-200"
            >
              <option value={0}>Min Score: Any</option>
              <option value={50}>50+</option>
              <option value={70}>70+</option>
              <option value={85}>85+</option>
            </select>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortOption }))}
              className="bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#2563eb] transition-all duration-200"
            >
              <option value="score">Sort: Score</option>
              <option value="deadline">Sort: Deadline</option>
              <option value="value">Sort: Value</option>
            </select>
          </div>

          {/* Opportunity Cards */}
          {loading ? (
            <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              Loading matches...
            </div>
          ) : filtered.length === 0 ? (
            /* ── Empty state welcome card ─────────────────────────────── */
            <div className="border border-[#f0f1f3] bg-white rounded-xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-[#111827] mb-2">
                  Your first digest arrives tomorrow at 7am
                </h2>
                <p className="text-sm text-[#4b5563] max-w-lg mx-auto">
                  Every night we scan 100+ government procurement sources and match opportunities to your certifications. Your first ranked digest will be here by morning.
                </p>
              </div>

              {/* Sample opportunity mockup */}
              <div className="ci-shimmer border border-[#f0f1f3] bg-[#f8f9fb] rounded-lg p-5 max-w-xl mx-auto mb-8">
                <div className="text-[10px] font-mono text-[#9ca3af] uppercase tracking-wider mb-3">
                  Sample opportunity preview
                </div>
                <div className="flex items-start gap-4">
                  <div className="text-3xl font-bold font-mono text-[#22c55e] w-14 text-center shrink-0">
                    94
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-[#111827]">
                        DoD IT Support Services — Fort Belvoir, VA
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-mono uppercase border shrink-0 bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20">
                        bid
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#4b5563]">
                      <span>$847,000</span>
                      <span className="text-[#e5e7eb]">|</span>
                      <span>8 days</span>
                      <span className="text-[#e5e7eb]">|</span>
                      <span>SDVOSB Set-Aside</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* "While you wait" action cards */}
              <div className="mb-2">
                <h3 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-4 text-center">
                  While you wait
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Card 1: Complete profile */}
                  <Link
                    href="/dashboard/settings"
                    className="border border-[#f0f1f3] rounded-xl p-5 hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-[#9ca3af] group-hover:text-[#2563eb] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-sm font-semibold text-[#111827]">Complete your profile</span>
                    </div>
                    <p className="text-xs text-[#4b5563]">
                      Add your UEI, certifications, and NAICS codes
                    </p>
                  </Link>

                  {/* Card 2: Connect Calendar */}
                  <Link
                    href="/dashboard/settings"
                    className="border border-[#f0f1f3] rounded-xl p-5 hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-[#9ca3af] group-hover:text-[#2563eb] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-semibold text-[#111827]">Connect Google Calendar</span>
                    </div>
                    <p className="text-xs text-[#4b5563]">
                      Get deadline reminders on your phone
                    </p>
                  </Link>

                  {/* Card 3: Explore with sample data */}
                  <button
                    onClick={handleSeedDemo}
                    disabled={seedingDemo}
                    className="border border-[#f0f1f3] rounded-xl p-5 hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200 group text-left disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-[#9ca3af] group-hover:text-[#2563eb] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-semibold text-[#111827]">
                        {seedingDemo ? "Loading..." : "Explore with sample data"}
                      </span>
                    </div>
                    <p className="text-xs text-[#4b5563]">
                      See how the dashboard looks with real data
                    </p>
                  </button>
                </div>
              </div>
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

                if (match.user_status === "skipped" && fadingOut !== match.id) return null;
                return (
                  <div
                    key={match.id}
                    data-tour={match === filtered[0] ? "opportunity-card" : undefined}
                    className={`border border-[#f0f1f3] bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-300 ${fadingOut === match.id ? "opacity-0 scale-95" : ""}`}
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
                            <h3 className="text-[16px] font-semibold text-[#0f172a] truncate cursor-pointer hover:text-[#2563eb] transition-colors" onClick={() => setExpandedCard(expandedCard === match.id ? null : match.id)}>
                              {opp.title}
                            </h3>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-mono uppercase border shrink-0 ${recBadge(
                                match.bid_recommendation
                              )}`}
                            >
                              {match.bid_recommendation}
                            </span>
                            {sourceBadge(opp.source, match.bid_recommendation)}
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
                              <span className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563]">
                                {opp.set_aside}
                              </span>
                            )}
                            {opp.naics_code && (
                              <span className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] font-mono">
                                NAICS {opp.naics_code}
                              </span>
                            )}
                            {opp.place_of_performance && (
                              <span className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563]">
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
                              {match.user_status === "tracking" ? (
                                <span className="px-3 py-1 text-xs text-[#059669] bg-[#ecfdf5] rounded-lg font-medium">Tracking ✓</span>
                              ) : match.user_status === "bidding" ? (
                                <span className="px-3 py-1 text-xs text-[#2563eb] bg-[#eff4ff] rounded-lg font-medium">Bidding ✓</span>
                              ) : (
                                <>
                                  <button
                                    onClick={() => updateStatus(match.id, "tracking")}
                                    className="px-3 py-1.5 text-xs border border-[#f0f1f3] text-[#4b5563] hover:border-[#e2e8f0] hover:text-[#111827] rounded-lg transition-all duration-200"
                                  >
                                    Track
                                  </button>
                                  <button
                                    onClick={() => updateStatus(match.id, "bidding")}
                                    className="px-3 py-1.5 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] rounded-lg transition-all duration-200"
                                  >
                                    Bid
                                  </button>
                                  <button
                                    onClick={() => updateStatus(match.id, "skipped")}
                                    className="px-3 py-1.5 text-xs text-[#9ca3af] hover:text-[#4b5563] rounded-lg transition-all duration-200"
                                  >
                                    Skip
                                  </button>
                                </>
                              )}
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

                          {/* Expanded details */}
                          {expandedCard === match.id && (
                            <div className="mt-3 pt-3 border-t border-[#f0f1f3] space-y-2 text-sm animate-[fadeInUp_0.2s_ease]">
                              {opp.description && <p className="text-[#4b5563] leading-relaxed">{opp.description.substring(0, 500)}{opp.description.length > 500 ? "..." : ""}</p>}
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                {opp.place_of_performance && <div><span className="text-[#9ca3af]">Location:</span> <span className="text-[#111827]">{opp.place_of_performance}</span></div>}
                                {opp.naics_code && <div><span className="text-[#9ca3af]">NAICS:</span> <span className="text-[#111827] font-mono">{opp.naics_code}</span></div>}
                                {opp.posted_date && <div><span className="text-[#9ca3af]">Posted:</span> <span className="text-[#111827]">{new Date(opp.posted_date).toLocaleDateString()}</span></div>}
                                {opp.response_deadline && <div><span className="text-[#9ca3af]">Deadline:</span> <span className="text-[#111827]">{new Date(opp.response_deadline).toLocaleDateString()}</span></div>}
                                {opp.incumbent_name && <div><span className="text-[#9ca3af]">Incumbent:</span> <span className="text-[#111827]">{opp.incumbent_name}</span></div>}
                                {opp.incumbent_value && <div><span className="text-[#9ca3af]">Prev. Value:</span> <span className="text-[#111827]">{formatCurrency(opp.incumbent_value)}</span></div>}
                              </div>
                              {match.recommendation_reasoning && (
                                <div className="mt-2 p-3 bg-[#eff4ff] rounded-lg border-l-3 border-l-[#2563eb] text-xs text-[#1e40af]">
                                  <strong>AI Recommendation:</strong> {match.recommendation_reasoning}
                                </div>
                              )}
                              {opp.sam_url && (
                                <a href={opp.sam_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#2563eb] hover:text-[#1d4ed8] font-medium mt-1">
                                  View on SAM.gov →
                                </a>
                              )}
                            </div>
                          )}
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
          <div className="border border-[#f0f1f3] bg-white p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[0.06em] text-[#94a3b8] mb-3">
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
          <div className="border border-[#f0f1f3] bg-white p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[0.06em] text-[#94a3b8] mb-3">
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
          <div className="border border-[#f0f1f3] bg-white p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[0.06em] text-[#94a3b8] mb-3">
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

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] px-5 py-3 bg-white text-sm font-medium rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.1)] animate-[fadeInUp_0.3s_ease] border border-[#f0f1f3] flex items-center gap-3 ${toast.includes("Skip") ? "border-l-4 border-l-[#9ca3af]" : "border-l-4 border-l-[#059669]"}`}>
          <span className="text-[#111827]">{toast}</span>
          <button onClick={() => setToast(null)} className="text-[#9ca3af] hover:text-[#111827] text-lg leading-none">&times;</button>
        </div>
      )}
    </div>
  );
}
