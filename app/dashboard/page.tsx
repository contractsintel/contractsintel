"use client";

import { useDashboard } from "./context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "./help-panel";
import { DemoBanner } from "./demo-banner";
import { InlineGuide } from "./inline-guide";
import { seedDemoData } from "@/lib/demo-data";
import { UnlockButton, ProfileBanner } from "./unlock-panel";

function cleanTitle(s: string): string {
  // Remove bracket prefixes like "[NE]", "[California]", "[Tennessee RFP]"
  return decodeHtml(s.replace(/^\[[^\]]*\]\s*/, ""));
}

function decodeHtml(s: string): string {
  if (!s) return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function formatCurrency(n: number | null | undefined): string {
  if (!n || n <= 0) return "TBD";
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
    bid: "bg-[#ecfdf5] text-[#059669] border-[#059669]/20",
    monitor: "bg-[#fffbeb] text-[#d97706] border-[#d97706]/20",
    review: "bg-[#fffbeb] text-[#d97706] border-[#d97706]/20",
    skip: "bg-[#f1f5f9] text-[#94a3b8] border-[#94a3b8]/20",
  };
  return map[rec] ?? map.skip;
}

type SortOption = "score" | "deadline" | "value" | "newest";
type SourceFilter = "" | "federal" | "state" | "military" | "sbir" | "grants" | "subcontracting" | "recompetes";
type UrgencyFilter = "" | "week" | "2weeks" | "month";
type ValueFilter = "" | "under100k" | "100k-500k" | "500k-1m" | "over1m";
type RecFilter = "" | "bid" | "monitor" | "skip";
type FilterState = {
  setAside: string;
  agency: string;
  minScore: number;
  sort: SortOption;
  source: SourceFilter;
  urgency: UrgencyFilter;
  valueRange: ValueFilter;
  recommendation: RecFilter;
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
    federal: { bg: "bg-[#eff6ff]", text: "text-[#2563eb]", label: "Federal" },
    state: { bg: "bg-[#ecfdf5]", text: "text-[#059669]", label: source?.startsWith("state_") ? source.replace("state_", "").toUpperCase() : "State" },
    military: { bg: "bg-[#f1f5f9]", text: "text-[#475569]", label: "Military" },
    sbir: { bg: "bg-[#f5f3ff]", text: "text-[#7c3aed]", label: "SBIR" },
    grants: { bg: "bg-[#fffbeb]", text: "text-[#d97706]", label: "Grant" },
    subcontracting: { bg: "bg-[#ecfeff]", text: "text-[#0891b2]", label: "SubK" },
    recompetes: { bg: "bg-[#fef2f2]", text: "text-[#dc2626]", label: "Recompete" },
  };
  const b = badges[cat] ?? badges.federal;
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] ci-mono uppercase rounded ${b.bg} ${b.text}`}>
      {b.label}
    </span>
  );
}

export default function DashboardPage() {
  const { organization, user } = useDashboard();
  const supabase = createClient();
  const PAGE_SIZE = 20;
  const profileIncomplete = !organization.naics_codes?.length || !organization.certifications?.length;
  const [matches, setMatches] = useState<any[]>([]);
  const [totalMatchCount, setTotalMatchCount] = useState(0);
  const [matchLimit, setMatchLimit] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    setAside: "",
    agency: "",
    minScore: 0,
    sort: "score",
    source: "",
    urgency: "",
    valueRange: "",
    recommendation: "",
  });
  const [complianceAlerts, setComplianceAlerts] = useState<any[]>([]);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [dbSourceCounts, setDbSourceCounts] = useState<Record<string, number>>({});

  const loadData = useCallback(async (limit?: number) => {
    const effectiveLimit = limit ?? matchLimit;
    setLoading(true);
    const { data, count, error } = await supabase
      .from("opportunity_matches")
      .select("id, organization_id, opportunity_id, match_score, bid_recommendation, recommendation_reasoning, user_status, is_demo, created_at, opportunities(*)", { count: "exact" })
      .eq("organization_id", organization.id)
      .order("match_score", { ascending: false })
      .range(0, effectiveLimit - 1);
    if (error) console.error("Dashboard query error:", error.message);
    setMatches(data ?? []);
    setTotalMatchCount(count ?? 0);

    // Load source counts from a larger sample for accurate filter pills
    const { data: sourceSample } = await supabase
      .from("opportunity_matches")
      .select("opportunities(source)")
      .eq("organization_id", organization.id)
      .limit(5000);
    if (sourceSample) {
      const counts: Record<string, number> = {};
      for (const m of sourceSample) {
        const src = (m as any).opportunities?.source;
        const cat = getSourceCategory(src);
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
      setDbSourceCounts(counts);
    }

    const { data: compliance } = await supabase
      .from("compliance_items")
      .select("*")
      .eq("organization_id", organization.id)
      .lte("due_date", new Date(Date.now() + 7 * 86400000).toISOString())
      .eq("status", "pending")
      .limit(5);
    setComplianceAlerts(compliance ?? []);

    setLoading(false);
  }, [organization.id, supabase, matchLimit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset pagination when filters change
  useEffect(() => {
    setMatchLimit(PAGE_SIZE);
  }, [filters.source, filters.setAside, filters.agency, filters.minScore, filters.urgency, filters.valueRange, filters.recommendation]);

  const handleLoadMore = async () => {
    const newLimit = matchLimit + PAGE_SIZE;
    setMatchLimit(newLimit);
    setLoadingMore(true);
    await loadData(newLimit);
    setLoadingMore(false);
  };

  const [toast, setToast] = useState<{ message: string; color: string; link?: string; linkText?: string } | null>(null);
  const [fadingOut, setFadingOut] = useState<string | null>(null);
  const [archiveAnim, setArchiveAnim] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);

  const showToast = (message: string, color: string, link?: string, linkText?: string) => {
    setToast({ message, color, link, linkText });
    setTimeout(() => setToast(null), 4000);
  };

  const updateStatus = async (matchId: string, status: string) => {
    if (status === "skipped") {
      setArchiveAnim(matchId);
      await new Promise((r) => setTimeout(r, 400));
      setArchiveAnim(null);
    }

    try {
      const res = await fetch("/api/opportunities/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, status }),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        showToast("Error — " + (result.error || "try again"), "#dc2626");
        setFadingOut(null);
        return;
      }

      if (status === "tracking") {
        showToast("Tracking — Added to Pipeline", "#059669", "/dashboard/pipeline", "View in Pipeline");
      } else if (status === "bidding") {
        showToast("Preparing Bid — Added to Pipeline", "#2563eb", "/dashboard/pipeline", "View in Pipeline");
      } else if (status === "skipped") {
        showToast("Archived — Moved to Archived Contracts", "#94a3b8");
      }
    } catch (err) {
      showToast("Network error — try again", "#dc2626");
      setFadingOut(null);
      return;
    }

    setFadingOut(null);
    loadData();
  };

  const saveNote = async (matchId: string) => {
    await fetch("/api/opportunities/update-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, notes: noteText }),
    });
    setEditingNote(null);
    loadData();
  };

  const STATE_NAMES: Record<string, string> = {
    al:"Alabama",ak:"Alaska",az:"Arizona",ar:"Arkansas",ca:"California",co:"Colorado",ct:"Connecticut",
    de:"Delaware",dc:"Washington DC",fl:"Florida",ga:"Georgia",hi:"Hawaii",id:"Idaho",il:"Illinois",
    in:"Indiana",ia:"Iowa",ks:"Kansas",ky:"Kentucky",la:"Louisiana",me:"Maine",md:"Maryland",
    ma:"Massachusetts",mi:"Michigan",mn:"Minnesota",ms:"Mississippi",mo:"Missouri",mt:"Montana",
    ne:"Nebraska",nv:"Nevada",nh:"New Hampshire",nj:"New Jersey",nm:"New Mexico",ny:"New York",
    nc:"North Carolina",nd:"North Dakota",oh:"Ohio",ok:"Oklahoma",or:"Oregon",pa:"Pennsylvania",
    ri:"Rhode Island",sc:"South Carolina",sd:"South Dakota",tn:"Tennessee",tx:"Texas",ut:"Utah",
    vt:"Vermont",va:"Virginia",wa:"Washington",wv:"West Virginia",wi:"Wisconsin",wy:"Wyoming",
    pr:"Puerto Rico",vi:"Virgin Islands",gu:"Guam",
  };
  const getSourceLabel = (source: string | null, agency?: string) => {
    if (!source) return "Government Website";
    const map: Record<string, string> = {
      sam_gov: "SAM.gov", usaspending: "USASpending", federal_civilian: agency || "Federal Agency",
      sbir_sttr: agency ? `${agency} SBIR` : "SBIR.gov", grants_gov: "Grants.gov",
      subcontracting: "SBA SubNet", forecasts: "SAM.gov Forecasts", military_defense: agency || "Military Procurement",
    };
    if (source.startsWith("state_")) {
      const code = source.replace("state_", "").toLowerCase();
      return `${STATE_NAMES[code] || code.toUpperCase()} Procurement`;
    }
    return map[source] || "Source Portal";
  };

  const getRecText = (rec: string) => {
    const texts: Record<string, string> = {
      bid: "Bid — Strong match to your profile. Review the solicitation details and prepare a bid.",
      monitor: "Monitor — Worth tracking for future developments and deadline updates.",
      skip: "Low Priority — May not be a strong fit for your current capabilities.",
      recompete_alert: "Recompete Alert — This contract is expiring and will be re-competed.",
    };
    return texts[rec] || "Review this opportunity for potential match.";
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

  const getVal = (opp: any) => opp?.estimated_value ?? opp?.value_estimate ?? 0;

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
      // Urgency filter
      if (filters.urgency) {
        const d = daysUntil(opp.response_deadline);
        if (d === null || d < 0) return false;
        if (filters.urgency === "week" && d > 7) return false;
        if (filters.urgency === "2weeks" && d > 14) return false;
        if (filters.urgency === "month" && d > 30) return false;
      }
      // Value filter
      if (filters.valueRange) {
        const v = getVal(opp) ?? 0;
        if (filters.valueRange === "under100k" && v >= 100000) return false;
        if (filters.valueRange === "100k-500k" && (v < 100000 || v >= 500000)) return false;
        if (filters.valueRange === "500k-1m" && (v < 500000 || v >= 1000000)) return false;
        if (filters.valueRange === "over1m" && v < 1000000) return false;
      }
      // Recommendation filter
      if (filters.recommendation && m.bid_recommendation !== filters.recommendation) return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "score") return (b.match_score ?? 0) - (a.match_score ?? 0);
      if (filters.sort === "value") return (b.opportunities?.estimated_value ?? 0) - (a.opportunities?.estimated_value ?? 0);
      if (filters.sort === "newest") return new Date(b.opportunities?.posted_date ?? 0).getTime() - new Date(a.opportunities?.posted_date ?? 0).getTime();
      if (filters.sort === "deadline") {
        const da = daysUntil(a.opportunities?.response_deadline) ?? 999;
        const db = daysUntil(b.opportunities?.response_deadline) ?? 999;
        return da - db;
      }
      return 0;
    });

  // Recommendation counts
  const recCounts = matches.reduce(
    (acc, m) => {
      const rec = m.bid_recommendation || "skip";
      acc[rec] = (acc[rec] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Stats (getVal defined above filter section)
  const totalValue = matches.reduce((s, m) => s + getVal(m.opportunities), 0);
  const urgentCount = matches.filter((m) => {
    const d = daysUntil(m.opportunities?.response_deadline);
    return d !== null && d >= 0 && d <= 7;
  }).length;
  const topScore = matches.length ? Math.max(...matches.map((m) => m.match_score ?? 0)) : 0;

  // Pipeline summary (use user_status since pipeline_stage may not exist)
  const pipelineCounts = matches.reduce(
    (acc, m) => {
      const status = m.user_status ?? "new";
      const stageMap: Record<string, string> = { tracking: "monitoring", bidding: "preparing_bid", new: "new", skipped: "skipped" };
      const stage = stageMap[status] ?? status;
      acc[stage] = (acc[stage] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Source breakdown counts (use DB counts when available, fall back to page-level)
  const pageCounts = matches.reduce(
    (acc, m) => {
      const cat = getSourceCategory(m.opportunities?.source, m.bid_recommendation);
      acc[cat] = (acc[cat] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const sourceCounts = Object.keys(dbSourceCounts).length > 0 ? dbSourceCounts : pageCounts;

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
      {/* Hero Greeting */}
      <div className="mb-8 py-7 px-8 rounded-2xl border border-[#e2e8f0]" style={{background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)"}}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="ci-serif text-[28px] tracking-[-0.02em] text-[#0f172a]">
              {greeting}, {displayName}
            </h1>
            <p className="ci-mono text-[12px] text-[#94a3b8] mt-1">{today}</p>
            {!loading && (
              <p className="text-[14px] text-[#475569] mt-1.5">
                {totalMatchCount > 0
                  ? `${totalMatchCount.toLocaleString()} matched opportunities`
                  : "Your first digest arrives tomorrow at 7am"}
              </p>
            )}
          </div>
          <HelpButton page="dashboard" />
        </div>
      </div>
      <InlineGuide page="dashboard" />

      {/* Profile Completion Banner */}
      <ProfileBanner />

      {/* Demo Banner */}
      {matches.some((m: any) => m.is_demo) && <DemoBanner />}

      {/* Stats Bar */}
      <div data-tour="stats-bar" className="grid grid-cols-4 gap-3 mb-6">
        {[
          { value: totalMatchCount > 0 ? totalMatchCount.toLocaleString() : String(matches.length), label: "Matches", tint: "rgba(37,99,235,0.03)" },
          { value: formatCurrency(totalValue), label: "Total Value", tint: "rgba(5,150,105,0.03)" },
          { value: String(urgentCount), label: "Due < 7 days", tint: "rgba(220,38,38,0.03)" },
          { value: String(topScore), label: "Top Score", tint: "rgba(124,58,237,0.03)" },
        ].map((stat) => (
          <div key={stat.label} className="ci-card p-5 cursor-default" style={{ background: stat.tint }}>
            <div className="ci-stat-number">{stat.value}</div>
            <div className="ci-stat-label mt-2">{stat.label}</div>
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
          {/* Filter Bar */}
          <div className="space-y-3 mb-5">
            {/* Row 1: Source toggle pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="ci-section-label mr-1">Contract Type</span>
              {([
                { key: "", label: "All Types", count: totalMatchCount },
                { key: "federal", label: "Federal Contracts", count: sourceCounts.federal ?? 0 },
                { key: "state", label: "State & Local", count: sourceCounts.state ?? 0 },
                { key: "grants", label: "Grants", count: sourceCounts.grants ?? 0 },
                { key: "sbir", label: "SBIR/STTR", count: sourceCounts.sbir ?? 0 },
                { key: "military", label: "Military/Defense", count: sourceCounts.military ?? 0 },
                { key: "subcontracting", label: "Subcontracting", count: sourceCounts.subcontracting ?? 0 },
                { key: "recompetes", label: "Recompete Alerts", count: sourceCounts.recompetes ?? 0 },
              ] as const).filter(s => s.key === "" || s.count > 0).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setFilters((f) => ({ ...f, source: s.key as SourceFilter }))}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-md border transition-all duration-150 ${
                    filters.source === s.key
                      ? "bg-[#0f172a] text-white border-[#0f172a]"
                      : "bg-white text-[#475569] border-[#e2e8f0] hover:border-[#cbd5e1]"
                  }`}
                >
                  {s.label}{s.count > 0 ? ` (${s.count >= 1000 ? `${(s.count/1000).toFixed(1)}K` : s.count})` : ""}
                </button>
              ))}
            </div>

            {/* Row 2: Urgency + Value + Recommendation pills */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Urgency */}
              <div className="flex items-center gap-1.5">
                <span className="ci-section-label mr-0.5">Urgency</span>
                {([
                  { key: "", label: "All" },
                  { key: "week", label: "This week" },
                  { key: "2weeks", label: "2 weeks" },
                  { key: "month", label: "This month" },
                ] as const).map((u) => (
                  <button
                    key={u.key}
                    onClick={() => setFilters((f) => ({ ...f, urgency: u.key as UrgencyFilter }))}
                    className={`px-2 py-0.5 text-[11px] rounded-full border transition-all duration-150 ${
                      filters.urgency === u.key
                        ? "bg-[#0f172a] text-white border-[#0f172a]"
                        : "bg-white text-[#475569] border-[#e2e8f0] hover:border-[#cbd5e1]"
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>

              {/* Value */}
              <div className="flex items-center gap-1.5">
                <span className="ci-section-label mr-0.5">Value</span>
                {([
                  { key: "", label: "All" },
                  { key: "under100k", label: "<$100K" },
                  { key: "100k-500k", label: "$100K-$500K" },
                  { key: "500k-1m", label: "$500K-$1M" },
                  { key: "over1m", label: ">$1M" },
                ] as const).map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setFilters((f) => ({ ...f, valueRange: v.key as ValueFilter }))}
                    className={`px-2 py-0.5 text-[11px] rounded-full border transition-all duration-150 ${
                      filters.valueRange === v.key
                        ? "bg-[#0f172a] text-white border-[#0f172a]"
                        : "bg-white text-[#475569] border-[#e2e8f0] hover:border-[#cbd5e1]"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              {/* Recommendation */}
              <div className="flex items-center gap-1.5">
                <span className="ci-section-label mr-0.5">Rec</span>
                {([
                  { key: "", label: "All" },
                  { key: "bid", label: `Bid${recCounts.bid ? ` (${recCounts.bid})` : ""}`, color: "#22c55e" },
                  { key: "monitor", label: `Monitor${recCounts.monitor ? ` (${recCounts.monitor})` : ""}`, color: "#f59e0b" },
                  { key: "skip", label: `Skip${recCounts.skip ? ` (${recCounts.skip})` : ""}`, color: "#9ca3af" },
                ] as const).map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setFilters((f) => ({ ...f, recommendation: r.key as RecFilter }))}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-md border transition-all duration-150 ${
                      filters.recommendation === r.key
                        ? "bg-[#0f172a] text-white border-[#0f172a]"
                        : "bg-white text-[#475569] border-[#e2e8f0] hover:border-[#cbd5e1]"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Sort + Agency search */}
            <div className="flex items-center gap-3">
              <select
                value={filters.sort}
                onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortOption }))}
                className="bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-[#2563eb] transition-all duration-200"
              >
                <option value="score">Best match</option>
                <option value="newest">Newest</option>
                <option value="deadline">Deadline soonest</option>
                <option value="value">Value highest</option>
              </select>
              <input
                type="text"
                placeholder="Search agency..."
                value={filters.agency}
                onChange={(e) => setFilters((f) => ({ ...f, agency: e.target.value }))}
                className="bg-[#f8f9fb] border border-[#e5e7eb] text-[#4b5563] text-xs px-3 py-1.5 w-48 rounded-lg focus:outline-none focus:border-[#2563eb]"
              />
              {(filters.source || filters.urgency || filters.valueRange || filters.recommendation || filters.agency || filters.minScore > 0) && (
                <button
                  onClick={() => setFilters({ setAside: "", agency: "", minScore: 0, sort: "score", source: "", urgency: "", valueRange: "", recommendation: "" })}
                  className="text-[11px] text-[#dc2626] hover:text-[#991b1b] font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Opportunity Cards */}
          {loading ? (
            <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              Loading matches...
            </div>
          ) : filtered.length === 0 && totalMatchCount === 0 ? (
            /* ── Empty state welcome card — only when truly no matches ── */
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
          ) : filtered.length === 0 ? (
            <div className="border border-[#f0f1f3] bg-white rounded-xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[#9ca3af]">No matches for current filters. Try adjusting your filters above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Match count */}
              <div className="flex items-center justify-between px-1">
                <span className="ci-mono text-[10px] text-[#94a3b8]">
                  {filtered.length} of {totalMatchCount.toLocaleString()}
                </span>
              </div>
              {filtered.map((match) => {
                const opp = match.opportunities;
                if (!opp) return null;
                const days = daysUntil(opp.response_deadline);
                const deadlineColor =
                  days !== null && days <= 3 ? "text-[#ef4444]"
                    : days !== null && days <= 7 ? "text-[#f59e0b]"
                    : "text-[#4b5563]";
                const isExpanded = expandedCard === match.id;
                const isArchiving = archiveAnim === match.id;

                if (match.user_status === "skipped" && !isArchiving) return null;
                return (
                  <div
                    key={match.id}
                    data-tour={match === filtered[0] ? "opportunity-card" : undefined}
                    className={`ci-card cursor-pointer ${isArchiving ? "opacity-30 scale-75 translate-x-[200px]" : ""}`}
                    style={{ borderLeft: match.bid_recommendation === "bid" ? "3px solid #059669" : match.bid_recommendation === "recompete_alert" ? "3px solid #dc2626" : undefined }}
                    onClick={() => setExpandedCard(isExpanded ? null : match.id)}
                  >
                    {/* Collapsed card header */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`ci-score-ring ${match.match_score >= 90 ? "border-[#059669] text-[#059669]" : match.match_score >= 80 ? "border-[#2563eb] text-[#2563eb]" : match.match_score >= 70 ? "border-[#d97706] text-[#d97706]" : "border-[#94a3b8] text-[#94a3b8]"}`}>
                          {match.match_score}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-[#0f172a] truncate">{cleanTitle(opp.title)}</h3>
                            <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase border shrink-0 rounded ${recBadge(match.bid_recommendation)}`}>{match.bid_recommendation}</span>
                            {sourceBadge(opp.source, match.bid_recommendation)}
                            {match.user_notes && <span className="text-[11px] shrink-0" title="Has notes">&#128221;</span>}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-[#64748b] ci-mono">
                            <span className="truncate max-w-[200px]" style={{fontFamily: "'DM Sans', sans-serif"}}>{opp.agency}</span>
                            <span className="text-[#e2e8f0]">&middot;</span>
                            <span>{getVal(opp) > 0 ? formatCurrency(getVal(opp)) : "TBD"}</span>
                            <span className="text-[#e2e8f0]">&middot;</span>
                            <span className={deadlineColor}>{deadlineLabel(opp.response_deadline) || "TBD"}</span>
                            {opp.place_of_performance && <><span className="text-[#e2e8f0]">&middot;</span><span>{opp.place_of_performance}</span></>}
                          </div>
                          {/* One-line AI guidance */}
                          {!isExpanded && (
                            <p className={`text-[11px] mt-0.5 ${match.bid_recommendation === "bid" ? "text-[#059669]" : match.bid_recommendation === "recompete_alert" ? "text-[#dc2626]" : "text-[#94a3b8]"}`}>
                              {match.bid_recommendation === "bid" ? "Strong match — consider bidding" : match.bid_recommendation === "recompete_alert" ? "Recompete alert — incumbent contract expiring" : match.bid_recommendation === "monitor" ? "Worth monitoring" : "Review opportunity"}
                            </p>
                          )}
                        </div>
                        {/* Status badge (collapsed only) */}
                        {!isExpanded && match.user_status === "tracking" && (
                          <span className="px-2 py-1 text-[10px] text-[#059669] bg-[#ecfdf5] rounded font-medium shrink-0">Tracking</span>
                        )}
                        {!isExpanded && match.user_status === "bidding" && (
                          <span className="px-2 py-1 text-[10px] text-[#2563eb] bg-[#eff4ff] rounded font-medium shrink-0">Bidding</span>
                        )}
                        <svg className={`w-4 h-4 text-[#94a3b8] shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-[#f0f1f3] animate-[fadeInUp_0.2s_ease]" onClick={(e) => e.stopPropagation()}>
                        <div className="pt-3 space-y-3">
                          {/* Tags */}
                          <div className="flex flex-wrap gap-1.5">
                            {opp.set_aside && <span className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563]">{opp.set_aside}</span>}
                            {opp.naics_code && <span className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] font-mono">NAICS {opp.naics_code}</span>}
                            {opp.place_of_performance && <span className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563]">{opp.place_of_performance}</span>}
                          </div>

                          {/* Description */}
                          {opp.description && (
                            <div className="max-h-[200px] overflow-y-auto text-xs text-[#4b5563] leading-relaxed pr-2">
                              {decodeHtml(opp.description.substring(0, 2000))}
                            </div>
                          )}

                          {/* Details grid */}
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                            {opp.solicitation_number && <div><span className="text-[#9ca3af]">Solicitation:</span> <span className="text-[#111827] font-mono">{opp.solicitation_number}</span></div>}
                            {getVal(opp) > 0 && <div><span className="text-[#9ca3af]">Value:</span> <span className="text-[#111827] font-bold">{formatCurrency(getVal(opp))}</span></div>}
                            {opp.set_aside && <div><span className="text-[#9ca3af]">Set-Aside:</span> <span className="text-[#111827]">{opp.set_aside}</span></div>}
                            {opp.naics_code && <div><span className="text-[#9ca3af]">NAICS:</span> <span className="text-[#111827] font-mono">{opp.naics_code}</span></div>}
                            {opp.response_deadline && <div><span className="text-[#9ca3af]">Deadline:</span> <span className={`font-bold ${deadlineColor}`}>{new Date(opp.response_deadline).toLocaleDateString()} ({deadlineLabel(opp.response_deadline)})</span></div>}
                            {opp.place_of_performance && <div><span className="text-[#9ca3af]">Location:</span> <span className="text-[#111827]">{opp.place_of_performance}</span></div>}
                            {opp.posted_date && <div><span className="text-[#9ca3af]">Posted:</span> <span className="text-[#111827]">{new Date(opp.posted_date).toLocaleDateString()}</span></div>}
                            <div><span className="text-[#9ca3af]">Source:</span> <span className="text-[#111827]">{getSourceLabel(opp.source, opp.agency)}</span></div>
                          </div>

                          {/* AI Recommendation */}
                          <div className="p-3 bg-[#eff4ff] rounded-lg text-xs text-[#1e40af]">
                            <strong>Recommended action:</strong> {getRecText(match.bid_recommendation)}
                          </div>

                          {/* Notes */}
                          <div className="border-t border-[#f0f1f3] pt-3">
                            {editingNote === match.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={noteText}
                                  onChange={(e) => setNoteText(e.target.value)}
                                  rows={3}
                                  className="w-full px-3 py-2 text-xs border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-[#2563eb] resize-none"
                                  placeholder="Add your notes about this contract..."
                                  autoFocus
                                />
                                <div className="flex items-center gap-2">
                                  <button onClick={() => saveNote(match.id)} className="px-3 py-1 text-xs bg-[#2563eb] text-white rounded-lg hover:bg-[#3b82f6]">Save Note</button>
                                  <button onClick={() => setEditingNote(null)} className="text-xs text-[#94a3b8] hover:text-[#4b5563]">Cancel</button>
                                </div>
                              </div>
                            ) : match.user_notes ? (
                              <div>
                                <p className="text-xs text-[#4b5563] mb-1">{match.user_notes}</p>
                                {match.notes_updated_at && <span className="text-[10px] text-[#94a3b8]">Note added {new Date(match.notes_updated_at).toLocaleDateString()}</span>}
                                <button onClick={() => { setEditingNote(match.id); setNoteText(match.user_notes || ""); }} className="ml-2 text-[10px] text-[#2563eb] hover:text-[#1d4ed8]">Edit</button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingNote(match.id); setNoteText(""); }} className="text-xs text-[#94a3b8] hover:text-[#4b5563] italic">Add a note...</button>
                            )}
                          </div>

                          {/* View Original Contract / Fallback Search */}
                          {(() => {
                            const url = opp.sam_url || opp.source_url;
                            const isFileDownload = url && /\.(xlsx|csv|pdf|doc|docx|zip)$/i.test(url);
                            const isValidUrl = url && !isFileDownload && url.startsWith("http");
                            const srcLabel = getSourceLabel(opp.source, opp.agency);
                            const searchTitle = cleanTitle(opp.title).substring(0, 80);
                            const googleQuery = encodeURIComponent(`"${opp.solicitation_number || searchTitle}" ${opp.agency || ""} government contract`);

                            if (isValidUrl) {
                              return (
                                <a href={url} target="_blank" rel="noopener noreferrer"
                                  className="block w-full text-center px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors ci-btn"
                                  style={{ backgroundColor: opp.source === "sam_gov" ? "#2563eb" : opp.source?.startsWith("state_") ? "#059669" : opp.source === "grants_gov" ? "#d97706" : "#475569" }}>
                                  View on {srcLabel} &rarr;
                                </a>
                              );
                            }
                            // Fallback: search instructions
                            return (
                              <div className="border border-[#e2e8f0] rounded-lg p-3 space-y-2 bg-[#f8fafc]">
                                <div className="ci-section-label">Find this contract</div>
                                {opp.solicitation_number && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-[#64748b]">Solicitation:</span>
                                    <span className="ci-mono text-[#0f172a] font-medium">{opp.solicitation_number}</span>
                                    <button onClick={() => navigator.clipboard.writeText(opp.solicitation_number)} className="text-[10px] text-[#2563eb] hover:text-[#1d4ed8]">Copy</button>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-[#64748b]">Title:</span>
                                  <span className="text-[#0f172a] truncate">{searchTitle}</span>
                                  <button onClick={() => navigator.clipboard.writeText(searchTitle)} className="text-[10px] text-[#2563eb] hover:text-[#1d4ed8] shrink-0">Copy</button>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <a href={`https://www.google.com/search?q=${googleQuery}`} target="_blank" rel="noopener noreferrer"
                                    className="px-3 py-1.5 text-xs font-medium text-[#2563eb] border border-[#e2e8f0] rounded-lg hover:bg-[#eff6ff] ci-btn">
                                    Search Google &rarr;
                                  </a>
                                  <button onClick={() => {
                                    const details = `Title: ${searchTitle}\nAgency: ${opp.agency || "N/A"}\nSolicitation: ${opp.solicitation_number || "N/A"}\nValue: ${formatCurrency(getVal(opp))}\nDeadline: ${opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : "TBD"}`;
                                    navigator.clipboard.writeText(details);
                                  }} className="px-3 py-1.5 text-xs font-medium text-[#475569] border border-[#e2e8f0] rounded-lg hover:bg-[#f1f5f9] ci-btn">
                                    Copy details
                                  </button>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Full details link */}
                          <Link href={`/dashboard/opportunity/${opp.id}`} className="block text-center text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8] py-2">
                            View Full Details &rarr;
                          </Link>

                          {/* Action buttons (only in expanded view) */}
                          <div className="flex items-center gap-2 pt-1">
                            {match.user_status === "tracking" ? (
                              <span className="px-3 py-1.5 text-xs text-[#059669] bg-[#ecfdf5] rounded-lg font-medium">Tracking</span>
                            ) : match.user_status === "bidding" ? (
                              <span className="px-3 py-1.5 text-xs text-[#2563eb] bg-[#eff4ff] rounded-lg font-medium">Bidding</span>
                            ) : (
                              <>
                                <button onClick={() => updateStatus(match.id, "tracking")} className="px-4 py-1.5 text-xs border border-[#e5e7eb] text-[#4b5563] hover:border-[#059669] hover:text-[#059669] hover:bg-[#ecfdf5] rounded-lg transition-all ci-btn">Track</button>
                                <button onClick={() => updateStatus(match.id, "bidding")} className="px-4 py-1.5 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] rounded-lg transition-all ci-btn">Bid</button>
                                <button onClick={() => updateStatus(match.id, "skipped")} className="px-4 py-1.5 text-xs text-[#94a3b8] hover:text-[#4b5563] hover:bg-[#f1f5f9] rounded-lg transition-all">Skip</button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Load More button */}
              {matches.length < totalMatchCount && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-6 py-2.5 text-sm font-medium border border-[#f0f1f3] text-[#4b5563] bg-white hover:border-[#e2e8f0] hover:text-[#111827] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] rounded-xl transition-all duration-200 disabled:opacity-50"
                  >
                    {loadingMore ? "Loading..." : `Load more (${totalMatchCount - matches.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-[300px] shrink-0 hidden lg:block space-y-4">
          {/* Pipeline Summary */}
          <div className="ci-card p-5">
            <h3 className="ci-section-label mb-3">
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
          <div className="ci-card p-5">
            <h3 className="ci-section-label mb-3">
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
          <div className="ci-card p-5">
            <h3 className="ci-section-label mb-3">
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

          {/* Archived Contracts */}
          {(() => {
            const archived = matches.filter((m) => m.user_status === "skipped");
            if (!archived.length) return null;
            return (
              <div className="border border-[#f0f1f3] bg-white p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <button
                  onClick={() => setArchivedOpen(!archivedOpen)}
                  className="w-full flex items-center justify-between"
                >
                  <h3 className="ci-section-label">
                    Archived Contracts
                  </h3>
                  <span className="text-[10px] font-mono bg-[#f1f5f9] text-[#64748b] px-1.5 py-0.5 rounded-full">
                    {archived.length}
                  </span>
                </button>
                {archivedOpen && (
                  <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
                    {archived.slice(0, 20).map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-[#f8f9fb] last:border-0 group">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs text-[#4b5563] truncate block">{decodeHtml(m.opportunities?.title || "")}</span>
                          <span className="text-[10px] text-[#94a3b8]">{m.opportunities?.agency}</span>
                        </div>
                        <button
                          onClick={() => updateStatus(m.id, "new")}
                          className="text-[10px] text-[#2563eb] hover:text-[#1d4ed8] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed top-5 right-5 z-[100] max-w-[360px] bg-white rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.1)] border border-[#f0f1f3] overflow-hidden"
          style={{ animation: "slideInRight 0.3s ease", borderLeft: `4px solid ${toast.color}` }}
        >
          <div className="px-4 py-3 flex items-start gap-3">
            <div className="flex-1">
              <span className="text-sm font-medium text-[#111827]">{toast.message}</span>
              {toast.link && (
                <a href={toast.link} className="block text-xs text-[#2563eb] hover:text-[#1d4ed8] mt-0.5">{toast.linkText || "View"} &rarr;</a>
              )}
            </div>
            <button onClick={() => setToast(null)} className="text-[#9ca3af] hover:text-[#111827] text-lg leading-none shrink-0">&times;</button>
          </div>
          <div className="h-0.5 bg-[#f1f5f9]">
            <div className="h-full" style={{ backgroundColor: toast.color, animation: "shrinkBar 4s linear forwards" }} />
          </div>
        </div>
      )}

      {/* Floating Unlock Button */}
      <UnlockButton />
    </div>
  );
}
