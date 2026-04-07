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

    // Load source counts from a small sample (lightweight query — 100 rows)
    const { data: sourceSample } = await supabase
      .from("opportunity_matches")
      .select("opportunities(source)")
      .eq("organization_id", organization.id)
      .limit(100);
    if (sourceSample) {
      const counts: Record<string, number> = {};
      const sampleSize = sourceSample.length;
      for (const m of sourceSample) {
        const src = (m as any).opportunities?.source;
        const cat = getSourceCategory(src);
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
      // Extrapolate from sample to total
      if (sampleSize > 0 && (count ?? 0) > sampleSize) {
        const ratio = (count ?? 0) / sampleSize;
        for (const k of Object.keys(counts)) counts[k] = Math.round(counts[k] * ratio);
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
      // Hide expired and paused contracts from main feed
      if (opp.status === "expired" || opp.status === "paused") return false;
      // Only show SAM.gov and USASpending (other sources paused)
      if (opp.source !== "sam_gov" && opp.source !== "usaspending") return false;
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
      {/* Hero Greeting — slim topbar, no background */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-medium text-[#111827] tracking-[-0.01em]"
                style={{fontFamily: "'DM Sans', sans-serif"}}>
              {greeting}, {displayName}
            </h1>
            <p className="text-[13px] text-[#6b7280] mt-0.5">
              {today} · {totalMatchCount > 0
                ? `${totalMatchCount.toLocaleString()} opportunities matched`
                : "Your first digest arrives tomorrow at 7am"}
            </p>
          </div>
          <HelpButton page="dashboard" />
        </div>
      </div>
      <InlineGuide page="dashboard" />

      {/* Profile Completion Banner */}
      <ProfileBanner />

      {/* Demo Banner */}
      {matches.some((m: any) => m.is_demo) && <DemoBanner />}

      {/* Stats Bar — KPI Row */}
      <div data-tour="stats-bar" className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {[
          { value: totalMatchCount > 0 ? totalMatchCount.toLocaleString() : String(matches.length), label: "Matches", urgent: false },
          { value: formatCurrency(totalValue), label: "Total Value", urgent: false },
          { value: String(urgentCount), label: "Due < 7 days", urgent: urgentCount > 0 },
          { value: String(topScore), label: "Top Score", urgent: false },
        ].map((stat) => (
          <div key={stat.label} className={`p-5 bg-white border border-[#e5e7eb] rounded-xl ${stat.urgent ? "border-l-[3px] border-l-[#dc2626]" : ""}`}>
            <div className="ci-stat-number text-[28px]">{stat.value}</div>
            <div className="ci-stat-label mt-2">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Source Breakdown — removed per design v2 (duplicates filter dropdown) */}

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
        <div className="flex-1 min-w-0 w-full">
          {/* Filter Bar */}
          <div className="space-y-3 mb-4 sm:mb-5 overflow-x-auto">
            {/* Row 1: Source toggle pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="ci-section-label mr-1">Contract Type</span>
              {([
                { key: "", label: "All Types", count: totalMatchCount },
                { key: "federal", label: "Federal Solicitations", count: sourceCounts.federal ?? 0 },
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
            <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-[#f3f4f6]">
                  <div className="w-12 h-12 rounded-full bg-[#f3f4f6] animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/5 bg-[#f3f4f6] rounded animate-pulse" />
                    <div className="h-3 w-2/5 bg-[#f3f4f6] rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-16 bg-[#f3f4f6] rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 && totalMatchCount === 0 ? (
            /* ── Empty state welcome card — only when truly no matches ── */
            <div className="border border-[#f0f1f3] bg-white rounded-xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-[#111827] mb-2">
                  Your first digest arrives tomorrow at 7am
                </h2>
                <p className="text-sm text-[#4b5563] max-w-lg mx-auto">
                  Every night we scan official federal procurement databases and match opportunities to your certifications. Your first ranked digest will be here by morning.
                </p>
              </div>

              {/* Sample opportunity mockup */}
              <div className="border border-dashed border-[#e5e7eb] bg-[#f9fafb] rounded-lg p-5 max-w-xl mx-auto mb-8">
                <div className="text-[10px] text-[#9ca3af] font-medium uppercase tracking-wide mb-3">
                  Example
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
                <h3 className="text-xs font-medium uppercase tracking-wide text-[#9ca3af] mb-4 text-center">
                  While you wait
                </h3>
                <div className="grid grid-cols-1 max-w-md mx-auto gap-3">
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
            <div>
              {/* Match count */}
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[12px] text-[#9ca3af]">
                  {filtered.length} of {totalMatchCount.toLocaleString()}
                </span>
              </div>
              <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
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
                    className={`${isArchiving ? "opacity-30 translate-x-[200px] transition-all duration-400" : ""}`}
                  >
                    {/* Compact list row */}
                    <div
                      className={`flex items-center gap-4 px-4 py-3.5 border-b border-[#f3f4f6] cursor-pointer
                                  transition-colors hover:bg-[#f9fafb] group
                                  ${match.bid_recommendation === "bid" ? "border-l-[3px] border-l-[#059669]" :
                                    match.bid_recommendation === "recompete_alert" ? "border-l-[3px] border-l-[#dc2626]" : ""}`}
                      onClick={() => setExpandedCard(isExpanded ? null : match.id)}
                    >
                      {/* Score ring */}
                      <div className={`ci-score-ring ${
                        match.match_score >= 80 ? "border-[#059669] text-[#059669]" :
                        match.match_score >= 70 ? "border-[#2563eb] text-[#2563eb]" :
                        match.match_score >= 60 ? "border-[#d97706] text-[#d97706]" :
                        "border-[#9ca3af] text-[#9ca3af]"}`}>
                        {match.match_score}
                      </div>

                      {/* Title + Agency */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[14px] font-semibold text-[#111827] truncate">{cleanTitle(opp.title)}</h3>
                        <p className="text-[12px] text-[#6b7280] mt-0.5 truncate">{opp.agency}</p>
                      </div>

                      {/* Value */}
                      <span className="text-[13px] font-semibold text-[#111827] font-mono w-[72px] text-right shrink-0">
                        {getVal(opp) > 0 ? formatCurrency(getVal(opp)) : "TBD"}
                      </span>

                      {/* Deadline */}
                      <span className={`text-[12px] font-mono w-[52px] text-right shrink-0 ${deadlineColor}`}>
                        {deadlineLabel(opp.response_deadline) || "TBD"}
                      </span>

                      {/* Recommendation badge */}
                      <span className={`px-2 py-1 text-[10px] font-semibold uppercase rounded shrink-0 ${recBadge(match.bid_recommendation)}`}>
                        {match.bid_recommendation}
                      </span>

                      {/* Quick actions — visible on hover */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); updateStatus(match.id, "tracking"); }}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-[#6b7280] hover:bg-[#ecfdf5] hover:text-[#059669] transition-colors"
                          title="Track">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); updateStatus(match.id, "bidding"); }}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-[#6b7280] hover:bg-[#eff6ff] hover:text-[#2563eb] transition-colors"
                          title="Start Bid">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                        </button>
                      </div>

                      {/* Chevron */}
                      <svg className={`w-4 h-4 text-[#9ca3af] shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* Expanded section */}
                    {isExpanded && (
                      <div className="px-5 py-5 pl-[76px] border-b border-[#e5e7eb] bg-[#fafbfc]"
                           onClick={(e) => e.stopPropagation()}
                           style={{animation: "fadeInUp 0.15s ease"}}>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1.5 mb-4">
                            {opp.set_aside && <span className="px-2.5 py-1 text-[11px] rounded-full bg-[#f3f4f6] text-[#4b5563] border border-[#e5e7eb]">{opp.set_aside}</span>}
                            {opp.naics_code && <span className="px-2.5 py-1 text-[11px] rounded-full bg-[#f3f4f6] text-[#4b5563] border border-[#e5e7eb] font-mono">NAICS {opp.naics_code}</span>}
                            {opp.place_of_performance && <span className="px-2.5 py-1 text-[11px] rounded-full bg-[#f3f4f6] text-[#4b5563] border border-[#e5e7eb]">{opp.place_of_performance}</span>}
                            {sourceBadge(opp.source, match.bid_recommendation)}
                          </div>

                          {/* Description */}
                          {opp.description && (
                            <p className="text-[13px] text-[#4b5563] leading-relaxed mb-4 line-clamp-3">
                              {decodeHtml(opp.description.substring(0, 500))}
                            </p>
                          )}

                          {/* Details grid */}
                          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-4">
                            {opp.solicitation_number && (
                              <div>
                                <div className="text-[11px] text-[#9ca3af] font-medium mb-0.5">Solicitation</div>
                                <div className="text-[13px] text-[#111827] font-mono">{opp.solicitation_number}</div>
                              </div>
                            )}
                            {getVal(opp) > 0 && (
                              <div>
                                <div className="text-[11px] text-[#9ca3af] font-medium mb-0.5">Estimated Value</div>
                                <div className="text-[13px] text-[#111827] font-semibold">{formatCurrency(getVal(opp))}</div>
                              </div>
                            )}
                            {opp.response_deadline && (
                              <div>
                                <div className="text-[11px] text-[#9ca3af] font-medium mb-0.5">Response Deadline</div>
                                <div className={`text-[13px] font-semibold ${deadlineColor}`}>
                                  {new Date(opp.response_deadline).toLocaleDateString()} ({deadlineLabel(opp.response_deadline)})
                                </div>
                              </div>
                            )}
                            {opp.place_of_performance && (
                              <div>
                                <div className="text-[11px] text-[#9ca3af] font-medium mb-0.5">Location</div>
                                <div className="text-[13px] text-[#111827]">{opp.place_of_performance}</div>
                              </div>
                            )}
                            {opp.posted_date && (
                              <div>
                                <div className="text-[11px] text-[#9ca3af] font-medium mb-0.5">Posted</div>
                                <div className="text-[13px] text-[#111827]">{new Date(opp.posted_date).toLocaleDateString()}</div>
                              </div>
                            )}
                            <div>
                              <div className="text-[11px] text-[#9ca3af] font-medium mb-0.5">Source</div>
                              <div className="text-[13px] text-[#111827]">{getSourceLabel(opp.source, opp.agency)}</div>
                            </div>
                          </div>

                          {/* AI Recommendation */}
                          <div className="p-4 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg mb-4">
                            <div className="text-[11px] font-semibold text-[#1d4ed8] uppercase tracking-wide mb-1">AI Recommendation</div>
                            <p className="text-[13px] text-[#1e40af] leading-relaxed">{match.recommendation_reasoning || getRecText(match.bid_recommendation)}</p>
                          </div>

                          {/* Notes */}
                          <div className="mb-4">
                            {editingNote === match.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={noteText}
                                  onChange={(e) => setNoteText(e.target.value)}
                                  rows={3}
                                  className="w-full px-3 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 resize-none"
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

                          {/* Links and actions */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Link href={`/dashboard/opportunity/${opp.id}`}
                                className="text-[13px] font-medium text-[#2563eb] hover:text-[#1d4ed8]">
                                Full Details →
                              </Link>
                            </div>
                            <div className="flex items-center gap-2">
                              {match.user_status === "tracking" ? (
                                <span className="px-3 py-1.5 text-[12px] text-[#059669] bg-[#ecfdf5] rounded-lg font-medium">Tracking</span>
                              ) : match.user_status === "bidding" ? (
                                <span className="px-3 py-1.5 text-[12px] text-[#2563eb] bg-[#eff6ff] rounded-lg font-medium">Bidding</span>
                              ) : (
                                <>
                                  <button onClick={() => updateStatus(match.id, "tracking")}
                                    className="px-4 py-2 text-[13px] font-medium border border-[#e5e7eb] text-[#4b5563] rounded-lg hover:border-[#059669] hover:text-[#059669] hover:bg-[#ecfdf5] transition-all">
                                    Track
                                  </button>
                                  <button onClick={() => updateStatus(match.id, "bidding")}
                                    className="px-4 py-2 text-[13px] font-medium bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8] transition-all">
                                    Start Bid
                                  </button>
                                  <button onClick={() => updateStatus(match.id, "skipped")}
                                    className="px-4 py-2 text-[13px] text-[#9ca3af] hover:text-[#6b7280] transition-colors">
                                    Archive
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
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

        {/* Right Sidebar — hidden on mobile/tablet */}
        <div className="w-[260px] shrink-0 hidden xl:block space-y-4 right-sidebar-desktop">
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
          className="fixed bottom-6 right-6 z-[100] px-5 py-3 bg-[#111827] text-white rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] text-[13px] font-medium flex items-center gap-3"
          style={{ animation: "fadeInUp 0.2s ease" }}
        >
          <span style={{ color: toast.color }}>●</span>
          <span>{toast.message}</span>
          {toast.link && (
            <a href={toast.link} className="text-[#93c5fd] underline ml-1">{toast.linkText || "View"}</a>
          )}
          <button onClick={() => setToast(null)} className="text-[#6b7280] hover:text-white ml-2">&times;</button>
        </div>
      )}

      {/* Floating Unlock Button */}
      <UnlockButton />
    </div>
  );
}
