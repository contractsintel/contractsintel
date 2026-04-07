# ContractsIntel Dashboard Audit
Generated: 2026-04-07
Total files: 17

---

## PAGE: /dashboard
### File: app/dashboard/page.tsx
### Lines: 1110

### Full Code:
```tsx
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
      // Hide expired contracts from main feed
      if (opp.status === "expired") return false;
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

```

### Sections (top to bottom):
1. Hero Greeting
2. Profile Completion Banner
3. Demo Banner
4. Stats Bar
5. Source Breakdown
6. Compliance Alert
7. Main Column
8. Filter Bar
9. Row 1: Source toggle pills
10. Row 2: Urgency + Value + Recommendation pills
11. Urgency
12. Value
13. Recommendation
14. Row 3: Sort + Agency search
15. Opportunity Cards
16. Sample opportunity mockup
17. "While you wait" action cards
18. Card 1: Complete profile
19. Card 2: Connect Calendar
20. Card 3: Explore with sample data
21. Match count
22. Collapsed card header
23. One-line AI guidance
24. Status badge (collapsed only)
25. Expanded details
26. Tags
27. Description
28. Details grid
29. AI Recommendation
30. Notes
31. View Original Contract / Fallback Search
32. Full details link
33. Action buttons (only in expanded view)
34. Load More button
35. Right Sidebar
36. Pipeline Summary
37. Compliance Score
38. Upcoming Deadlines
39. Archived Contracts
40. Toast notification
41. Floating Unlock Button

### Custom CSS Classes (ci-* design system):
- `ci-btn`
- `ci-card`
- `ci-mono`
- `ci-section-label`
- `ci-serif`
- `ci-shimmer`
- `ci-stat-label`
- `ci-stat-number`

### Buttons/Actions:
- Button: "setFilters((f) => ({ ...f, source: s.key as SourceFilter }))}
                  "
- Button: "setFilters((f) => ({ ...f, urgency: u.key as UrgencyFilter }))}
                "
- Button: "setFilters((f) => ({ ...f, valueRange: v.key as ValueFilter }))}
               "
- Button: "setFilters((f) => ({ ...f, recommendation: r.key as RecFilter }))}
             "
- Button: "setFilters({ setAside: "", agency: "", minScore: 0, sort: "score", source: "", u"
- Button: "{seedingDemo ? "Loading..." : "Explore with sample data"}
                      "
- Button: "saveNote(match.id)} className="px-3 py-1 text-xs bg-[#2563eb] text-white rounded"
- Button: "setEditingNote(null)} className="text-xs text-[#94a3b8] hover:text-[#4b5563]">Ca"
- Button: "{ setEditingNote(match.id); setNoteText(match.user_notes || ""); }} className="m"
- Button: "{ setEditingNote(match.id); setNoteText(""); }} className="text-xs text-[#94a3b8"
- Button: "navigator.clipboard.writeText(opp.solicitation_number)} className="text-[10px] t"
- Button: "navigator.clipboard.writeText(searchTitle)} className="text-[10px] text-[#2563eb"
- Button: "{
                                    const details = `Title: ${searchTitle}\nAg"
- Button: "updateStatus(match.id, "tracking")} className="px-4 py-1.5 text-xs border border"
- Button: "updateStatus(match.id, "bidding")} className="px-4 py-1.5 text-xs bg-[#2563eb] t"
- Button: "updateStatus(match.id, "skipped")} className="px-4 py-1.5 text-xs text-[#94a3b8]"
- Button: "{loadingMore ? "Loading..." : `Load more (${totalMatchCount - matches.length} re"
- Button: "setArchivedOpen(!archivedOpen)}
                  className="w-full flex items-c"
- Button: "updateStatus(m.id, "new")}
                          className="text-[10px] text"
- Button: "setToast(null)} className="text-[#9ca3af] hover:text-[#111827] text-lg leading-n"
- Link to /dashboard/settings: "Complete your profile
                    
                    
                "
- Link to /dashboard/settings: "Connect Google Calendar
                    
                    
              "
- Link to /dashboard/pipeline: "View Pipeline →"
- Link to /dashboard/compliance: "View Compliance →"

### Known Issues:
- References demo data — ensure demo cleanup works
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard (layout)
### File: app/dashboard/layout.tsx
### Lines: 71

### Full Code:
```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardProvider } from "./context";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { TourWrapper } from "./tour-wrapper";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  // Fetch user profile joined with organization
  const { data: profile } = await supabase
    .from("users")
    .select("*, organizations(*)")
    .eq("auth_id", authUser.id)
    .single();

  // Fallback: try profiles table if users table doesn't exist yet
  const org = profile?.organizations ?? {
    id: profile?.organization_id ?? authUser.id,
    name: profile?.company_name ?? authUser.email?.split("@")[0] ?? "Company",
    uei: null,
    cage_code: null,
    certifications: profile?.certifications ?? [],
    naics_codes: profile?.naics_codes ?? [],
    address: null,
    plan: profile?.plan ?? "discovery",
    subscription_status: profile?.subscription_status ?? "trialing",
    subscription_tier: profile?.subscription_tier ?? "discovery",
    trial_ends_at: profile?.trial_ends_at ?? null,
    stripe_customer_id: null,
    created_at: profile?.created_at ?? new Date().toISOString(),
  };

  const userProfile = {
    id: authUser.id,
    email: authUser.email ?? "",
    full_name: profile?.full_name ?? authUser.user_metadata?.full_name ?? null,
    organization_id: org.id,
    role: profile?.role ?? "owner",
    created_at: profile?.created_at ?? new Date().toISOString(),
  };

  return (
    <DashboardProvider user={userProfile} organization={org}>
      <div className="min-h-screen bg-[#f8f9fb]">
        <TopNav
          companyName={(org.name || "").includes("@") ? (org.name || "").split("@")[0].charAt(0).toUpperCase() + (org.name || "").split("@")[0].slice(1) : (org.name || "").split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
          userEmail={authUser.email ?? ""}
          userName={userProfile.full_name ? userProfile.full_name.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : null}
        />
        <div className="flex pt-16">
          <Sidebar plan={org.plan} />
          <main className="flex-1 ml-[240px] p-8">
            <div className="max-w-dashboard mx-auto">{children}</div>
          </main>
          <TourWrapper />
        </div>
      </div>
    </DashboardProvider>
  );
}

```

### Sections (top to bottom):
(No JSX comment sections found)

### Custom CSS Classes (ci-* design system):
(No ci-* classes used)

### Buttons/Actions:
(No buttons found)

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/get-started
### File: app/dashboard/get-started/page.tsx
### Lines: 1011

### Full Code:
```tsx
"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { isTrialActive } from "@/lib/feature-gate";
import { HelpButton } from "../help-panel";
import { ProductTour } from "../tour";

// ─── Screenshot Mockup Components ───────────────────────────────────────

function MockDigestEmail() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Sample digest email
      </div>
      <div className="border border-[#f0f1f3] bg-[#f8f9fb] p-4 space-y-2">
        <div className="text-xs text-[#2563eb] font-medium">
          ContractsIntel Daily Digest — 7 New Matches
        </div>
        <div className="h-px bg-[#e5e7eb]" />
        {[
          { score: 94, title: "IT Support Services — Fort Belvoir", val: "$847K" },
          { score: 91, title: "Healthcare IT Modernization", val: "$2.1M" },
          { score: 85, title: "Program Support Services", val: "$320K" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <span className="text-xs font-mono text-[#22c55e] w-8">{item.score}</span>
            <span className="text-xs text-[#4b5563] flex-1 truncate">{item.title}</span>
            <span className="text-xs font-mono text-[#111827]">{item.val}</span>
          </div>
        ))}
        <div className="text-[10px] text-[#9ca3af] pt-1">+ 4 more matches</div>
      </div>
    </div>
  );
}

function MockOpportunityCard() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Opportunity card with recommendation
      </div>
      <div className="border border-[#f0f1f3] bg-[#f8f9fb] p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl font-bold font-mono text-[#22c55e]">94</span>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-[#111827]">IT Support Services — Fort Belvoir, VA</span>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 uppercase">
                bid
              </span>
            </div>
            <div className="text-xs text-[#4b5563] mb-2">Department of Defense | DEMO-2026-0001</div>
            <p className="text-xs text-[#9ca3af]">
              Your SDVOSB certification is a direct match for this set-aside, and your NAICS 541512 experience aligns perfectly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockActionButtons() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Action buttons highlighted
      </div>
      <div className="flex items-center gap-2 bg-[#f8f9fb] border border-[#f0f1f3] p-4">
        <div className="px-3 py-1.5 text-xs border border-[#2563eb] text-[#2563eb] bg-[#2563eb]/5">Track</div>
        <div className="px-3 py-1.5 text-xs bg-[#2563eb] text-white">Bid</div>
        <div className="px-3 py-1.5 text-xs text-[#9ca3af]">Skip</div>
        <div className="px-3 py-1.5 text-xs text-[#3b82f6]">SAM.gov</div>
      </div>
    </div>
  );
}

function MockFilterBar() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Filter bar
      </div>
      <div className="flex items-center gap-2 bg-[#f8f9fb] border border-[#f0f1f3] p-3">
        <div className="px-2 py-1 text-[10px] border border-[#f0f1f3] text-[#4b5563] bg-white">
          All Set-Asides &#x25BC;
        </div>
        <div className="px-2 py-1 text-[10px] border border-[#f0f1f3] text-[#4b5563] bg-white">
          Filter agency...
        </div>
        <div className="px-2 py-1 text-[10px] border border-[#f0f1f3] text-[#4b5563] bg-white">
          Min Score: Any &#x25BC;
        </div>
        <div className="px-2 py-1 text-[10px] border border-[#f0f1f3] text-[#4b5563] bg-white">
          Sort: Score &#x25BC;
        </div>
      </div>
    </div>
  );
}

function MockPipeline() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Pipeline page with cards in stages
      </div>
      <div className="flex gap-2">
        {[
          { label: "Monitoring", count: 3, items: ["IT Support", "Facilities Mgmt", "Logistics"] },
          { label: "Preparing Bid", count: 1, items: ["Cybersecurity"] },
          { label: "Submitted", count: 0, items: [] },
          { label: "Won", count: 0, items: [] },
        ].map((col) => (
          <div key={col.label} className="flex-1 bg-[#f8f9fb] border border-[#f0f1f3] p-2">
            <div className="text-[9px] font-mono text-[#9ca3af] uppercase mb-2">
              {col.label} ({col.count})
            </div>
            {col.items.map((item, i) => (
              <div key={i} className="bg-white border border-[#f0f1f3] p-1.5 mb-1 text-[9px] text-[#4b5563] truncate">
                {item}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockComplianceDashboard() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Compliance dashboard with health score
      </div>
      <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4">
        <div className="flex items-center gap-4 mb-3">
          <span className="text-2xl font-bold font-mono text-[#22c55e]">87</span>
          <div className="flex-1">
            <div className="w-full h-2 bg-[#e5e7eb]">
              <div className="h-full bg-[#22c55e]" style={{ width: "87%" }} />
            </div>
          </div>
        </div>
        {[
          { label: "SAM.gov Registration", status: "Active", color: "text-[#22c55e]" },
          { label: "8(a) Certification", due: "90 days", color: "text-[#22c55e]" },
          { label: "CMMC Level 2", status: "In Progress", color: "text-[#f59e0b]" },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between py-1 text-[10px]">
            <span className="text-[#4b5563]">{item.label}</span>
            <span className={`font-mono ${item.color}`}>{item.status ?? `${item.due} left`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCalendarSync() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Google Calendar with synced deadlines
      </div>
      <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4 space-y-1.5">
        {[
          { date: "Apr 9", title: "Bid Due: Program Support Services", color: "border-l-[#ef4444]" },
          { date: "Apr 13", title: "Bid Due: IT Support Services", color: "border-l-[#f59e0b]" },
          { date: "Apr 15", title: "SAM.gov Registration Renewal", color: "border-l-[#2563eb]" },
        ].map((item, i) => (
          <div key={i} className={`flex items-center gap-3 border-l-2 ${item.color} pl-2 py-1`}>
            <span className="text-[10px] font-mono text-[#9ca3af] w-10">{item.date}</span>
            <span className="text-[10px] text-[#4b5563]">{item.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockProposalDraft() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Proposal draft with tabs
      </div>
      <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4">
        <div className="flex gap-1 mb-3">
          <div className="px-2 py-1 text-[9px] bg-[#2563eb] text-white">Technical Approach</div>
          <div className="px-2 py-1 text-[9px] border border-[#f0f1f3] text-[#9ca3af]">Past Performance</div>
          <div className="px-2 py-1 text-[9px] border border-[#f0f1f3] text-[#9ca3af]">Executive Summary</div>
        </div>
        <div className="space-y-1">
          <div className="h-2 bg-[#e5e7eb] w-full" />
          <div className="h-2 bg-[#e5e7eb] w-[90%]" />
          <div className="h-2 bg-[#e5e7eb] w-[95%]" />
          <div className="h-2 bg-[#e5e7eb] w-[70%]" />
        </div>
      </div>
    </div>
  );
}

function MockPastPerformance() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Past performance record with monthly logs
      </div>
      <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4">
        <div className="text-xs text-[#111827] mb-2">VA IT Support Contract</div>
        <div className="text-[10px] text-[#9ca3af] mb-3">DEMO-VA-2025-001 | $320,000</div>
        {["Jan 2026", "Feb 2026", "Mar 2026"].map((month, i) => (
          <div key={i} className="flex items-center justify-between py-1 border-b border-[#e5e7eb] last:border-0">
            <span className="text-[10px] text-[#4b5563]">{month}</span>
            <span className="text-[10px] text-[#22c55e] font-mono">Logged</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockContractDashboard() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Contract delivery dashboard with milestones
      </div>
      <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4">
        {[
          { title: "Kick-off Meeting", status: "Completed", color: "text-[#22c55e]" },
          { title: "Q1 Performance Report", status: "Completed", color: "text-[#22c55e]" },
          { title: "Q2 Performance Report", status: "Overdue", color: "text-[#ef4444]" },
          { title: "Mid-Year Review", status: "14 days", color: "text-[#f59e0b]" },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 text-[10px]">
            <span className="text-[#4b5563]">{item.title}</span>
            <span className={`font-mono ${item.color}`}>{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCpars() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: CPARS rating trends
      </div>
      <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4">
        {["Quality", "Schedule", "Cost Control", "Management"].map((cat, i) => (
          <div key={i} className="flex items-center justify-between py-1 text-[10px]">
            <span className="text-[#4b5563]">{cat}</span>
            <span className="font-mono text-[#22c55e]">
              {["Exceptional", "Very Good", "Satisfactory", "Very Good"][i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockNetwork() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Teaming opportunity matches
      </div>
      <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4 space-y-2">
        {[
          { prime: "Lockheed Martin", need: "SDVOSB Subcontractor", naics: "541512" },
          { prime: "Raytheon", need: "8(a) IT Support", naics: "541511" },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between text-[10px]">
            <div>
              <span className="text-[#111827]">{item.prime}</span>
              <span className="text-[#9ca3af] mx-2">|</span>
              <span className="text-[#4b5563]">{item.need}</span>
            </div>
            <span className="font-mono text-[#9ca3af]">{item.naics}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCompetitors() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Competitor profile with win/loss history
      </div>
      <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4">
        <div className="text-xs text-[#111827] mb-2">Apex Systems Inc.</div>
        <div className="flex gap-4 text-[10px] mb-2">
          <span className="text-[#22c55e]">2 Wins vs them</span>
          <span className="text-[#ef4444]">1 Loss to them</span>
        </div>
        <div className="text-[10px] text-[#9ca3af]">
          Primary agencies: DoD, VA | Focus: IT services, cybersecurity
        </div>
      </div>
    </div>
  );
}

function MockVehicleAlerts() {
  return (
    <div className="border border-[#f0f1f3] bg-white p-4 my-4">
      <div className="text-[10px] font-mono text-[#9ca3af] mb-3 uppercase tracking-wider">
        Screenshot: Contract vehicle alert
      </div>
      <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] px-2 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 font-mono uppercase">
            On-Ramp Open
          </span>
          <span className="text-xs text-[#111827]">GSA Schedule 70</span>
        </div>
        <div className="text-[10px] text-[#4b5563]">
          Application deadline: 45 days | Your NAICS codes qualify
        </div>
      </div>
    </div>
  );
}

// ─── Product Guide Sections ──────────────────────────────────────────────

interface GuideSection {
  num: string;
  id: string;
  title: string;
  maxGuideIndex: number; // Discovery: 5, BD Pro: 11, Team: 16
  whatItDoes: string;
  whyItMatters: string;
  howToUseIt: string[];
  tips: string;
}

const ALL_GUIDES: GuideSection[] = [
  {
    num: "01",
    id: "daily-digest",
    title: "Daily Digest & Opportunity Matching",
    maxGuideIndex: 5,
    whatItDoes:
      "Every night, ContractsIntel scans 100+ government procurement sources — including federal agencies, all 50 state procurement portals, military commands, SBIR programs from 7 agencies, and subcontracting databases. It checks each opportunity against your certifications (like 8(a), SDVOSB, WOSB, or HUBZone) and your NAICS codes. By 7am, a ranked list of your best matches lands in your email inbox with scores and recommendations. Each opportunity shows a colored source badge so you can see where it came from — federal, state, military, SBIR, or recompete.",
    whyItMatters:
      "Most small contractors only check SAM.gov manually every few days, missing state contracts, military RFQs, SBIR grants, and recompete opportunities from expiring contracts. A single missed contract could be worth $150,000 to $2,000,000. ContractsIntel monitors 100+ sources so you never miss an eligible opportunity at any level of government.",
    howToUseIt: [
      "Check your email every morning -- your digest arrives at 7am with your top 10 matches.",
      "Review the match scores -- higher means a better fit for your business.",
      "Read the AI recommendation -- BID (green) means go for it, MONITOR (yellow) means watch it, SKIP (gray) means don't waste time.",
      "Click Track to save an opportunity to your Pipeline.",
      "Click Mark as Bidding when you decide to pursue it.",
      "Use the filters on the Dashboard to narrow by certification, agency, or deadline.",
    ],
    tips: "Focus on opportunities scoring 80 or higher. Check the Urgent count daily -- those close within 7 days. The AI also identifies who currently holds the contract so you know your competition.",
  },
  {
    num: "02",
    id: "pipeline-tracker",
    title: "Pipeline Tracker",
    maxGuideIndex: 5,
    whatItDoes:
      "Your Pipeline organizes every opportunity you're pursuing into stages: Monitoring, Preparing Bid, Submitted, Won, and Lost. It gives you a clear view of your entire business development pipeline with total values and win rates.",
    whyItMatters:
      "Without a pipeline, you lose track of what you're bidding on and what's due when. Most small contractors manage this in spreadsheets and miss deadlines. The Pipeline keeps everything organized and automatically creates records when you win.",
    howToUseIt: [
      "Track opportunities from your Dashboard -- they appear in the Monitoring column.",
      "Move cards to Preparing Bid when you start working on a proposal.",
      "Move to Submitted after you send your proposal.",
      "When you win, enter the award amount -- your delivery dashboard and past performance record are created automatically.",
      "When you lose, enter the reason -- this data helps you improve over time.",
    ],
    tips: "Your win rate is shown at the top. A healthy win rate for small contractors is 20-40%. Always record why you lost -- patterns emerge over time.",
  },
  {
    num: "03",
    id: "compliance-monitor",
    title: "Compliance Monitor",
    maxGuideIndex: 5,
    whatItDoes:
      "Tracks every compliance deadline that could affect your ability to bid on or keep government contracts. It monitors your SAM.gov registration, certification renewals, CMMC requirements, and changes to federal acquisition regulations (FAR). Your health score (0-100) shows your overall compliance status at a glance.",
    whyItMatters:
      "One lapsed SAM.gov registration means you can't get paid on an active contract. One missed certification renewal means you can't bid on set-aside contracts. One FAR change you didn't catch means your proposal language is wrong. ContractsIntel watches all of this so you don't have to.",
    howToUseIt: [
      "Check your health score weekly -- anything below 80 needs attention.",
      "Red items are due within 30 days -- act on these immediately.",
      "Orange items are due within 90 days -- start planning.",
      "Review FAR change alerts -- they tell you what changed and what to update in your proposals.",
      "Check your CMMC status if you work with the Department of Defense.",
    ],
    tips: "A score below 80 means something needs your attention soon. Set up Google Calendar sync so deadline reminders appear on your phone.",
  },
  {
    num: "04",
    id: "google-calendar-sync",
    title: "Google Calendar Sync",
    maxGuideIndex: 5,
    whatItDoes:
      "Pushes deadlines from inside ContractsIntel to your Google Calendar. When you track opportunities, win contracts, or have compliance deadlines, they automatically show up on your phone and desktop with reminders at 14, 7, 3, and 1 day out.",
    whyItMatters:
      "Email alerts are awareness -- you read them and might forget. Calendar events with popup reminders on your phone mean nothing slips. This is the safety net that catches everything.",
    howToUseIt: [
      "Go to Settings and click Connect Google Calendar.",
      "Sign in with your Google account and click Allow.",
      "Choose what to sync: opportunity deadlines, contract milestones, compliance dates.",
      "Deadlines start appearing on your calendar immediately.",
    ],
    tips: "Use your primary work calendar so reminders show up alongside your other meetings. You can disconnect anytime from Settings.",
  },
  {
    num: "05",
    id: "sam-profile-audit",
    title: "SAM.gov Profile Audit",
    maxGuideIndex: 5,
    whatItDoes:
      "Analyzes your SAM.gov registration and scores it from 0-100. Checks your registration status, NAICS codes, certifications, CAGE code, contact info, and entity description. Gives you specific recommendations on what to fix.",
    whyItMatters:
      "An incomplete SAM.gov profile means contracting officers can't find you when searching for contractors. Missing NAICS codes mean you won't match to opportunities you're qualified for. A weak profile costs you contracts you never even see.",
    howToUseIt: [
      "Go to the Audit page (accessible from the homepage too).",
      "Enter your 12-character UEI number.",
      "Review your score and category breakdown.",
      "Follow the recommendations to improve your profile.",
      "Re-run the audit after making changes to see your new score.",
    ],
    tips: "Most contractors score between 60-75. A score above 85 puts you in the top 20% of SAM.gov profiles.",
  },
  {
    num: "06",
    id: "ai-proposal-drafts",
    title: "AI Proposal First Drafts",
    maxGuideIndex: 11,
    whatItDoes:
      "When you mark an opportunity as Bidding, the AI reads the solicitation requirements and writes three proposal sections: Technical Approach, Past Performance narrative, and Executive Summary. It tailors the draft to your company's certifications and experience.",
    whyItMatters:
      "Writing a government proposal from scratch takes 20-40 hours. The AI cuts that to 6-8 hours of review and polish. You respond to more opportunities in less time, which directly increases your win rate.",
    howToUseIt: [
      "Mark an opportunity as Bidding in your Pipeline.",
      "Go to the Proposals page.",
      "Click Generate Draft next to the opportunity.",
      "Wait 30-60 seconds while the AI writes.",
      "Review the three tabs: Technical Approach, Past Performance, Executive Summary.",
      "Copy the text or download as a document, then customize it with your specific details.",
    ],
    tips: "Use the Guidance field when regenerating to give specific instructions like \"focus more on our cybersecurity experience.\" The AI gets better at writing for your company as you build more past performance records.",
  },
  {
    num: "07",
    id: "past-performance-builder",
    title: "Past Performance Builder",
    maxGuideIndex: 11,
    whatItDoes:
      "Stores records of every contract you've delivered, tracks monthly performance, and generates ready-to-use narratives for future proposals. Records are created automatically when you win a contract in the Pipeline.",
    whyItMatters:
      "Past performance is one of the highest-weighted evaluation factors in federal proposals. Most contractors scramble to write past performance narratives at proposal time. With ContractsIntel, you log monthly and the narratives write themselves.",
    howToUseIt: [
      "When you win a contract, a record is created automatically.",
      "Each month, click Log This Month and enter what you delivered (5 minutes).",
      "When you need past performance for a proposal, click Generate PPQ.",
      "The AI creates formatted narratives from your logged data.",
      "Copy and paste directly into your proposal.",
    ],
    tips: "Log your performance every month, even if it feels repetitive. The more data the AI has, the stronger your narratives. A 12-month log produces much better narratives than a 3-month log.",
  },
  {
    num: "08",
    id: "contract-delivery-dashboard",
    title: "Contract Delivery Dashboard",
    maxGuideIndex: 11,
    whatItDoes:
      "Tracks every deliverable, report, invoice, and option period for your active contracts. Sends alerts at 14, 7, 3, and 1 day before each deadline. Flags late government payments under the Prompt Payment Act.",
    whyItMatters:
      "One missed deliverable can end a contract relationship. One late invoice you didn't follow up on is money the government legally owes you. This dashboard makes sure nothing slips and nothing goes unpaid.",
    howToUseIt: [
      "Contracts appear automatically when you win in the Pipeline.",
      "Review your milestone timeline each week.",
      "Add custom milestones for deliverables specific to your contract.",
      "When you submit an invoice, enter the amount and date -- the system tracks the 30-day payment window.",
      "If the government is late paying, click Flag Late Payment to generate a Prompt Payment Act demand letter.",
    ],
    tips: "Check this page weekly, not just when you get an alert. If a payment is more than 15 days late, flag it -- you're legally entitled to interest.",
  },
  {
    num: "09",
    id: "state-local-monitoring",
    title: "State & Local Monitoring",
    maxGuideIndex: 11,
    whatItDoes:
      "Monitors procurement portals across all 50 states plus local government opportunities. Matches state and local contracts to your NAICS codes just like the federal matching engine.",
    whyItMatters:
      "State and local contracts are often less competitive than federal ones. Many small contractors ignore this $500 billion market. Adding state and local to your pipeline diversifies your revenue.",
    howToUseIt: [
      "Your matched state and local opportunities appear in the same daily digest alongside federal ones.",
      "They're tagged with the state/locality name so you can filter them.",
      "Track and bid on them using the same Pipeline workflow.",
    ],
    tips: "Start with your home state -- you'll have a geographic advantage. State contracts often have faster award timelines than federal.",
  },
  {
    num: "10",
    id: "agency-relationship-mapping",
    title: "Agency Relationship Mapping",
    maxGuideIndex: 11,
    whatItDoes:
      "Tracks contracting officers, program managers, and decision-makers at every agency you interact with. Builds a relationship map over time as you bid and win contracts.",
    whyItMatters:
      "Government contracting is relationship-driven. Knowing who the contracting officer is, what they've bought before, and how they evaluate proposals gives you a real advantage.",
    howToUseIt: [
      "Contact information is pulled automatically from SAM.gov opportunity data.",
      "When you interact with agency personnel, add notes to their profile.",
      "Before bidding, check if you've worked with anyone at that agency before.",
      "Reference prior relationships in your proposals where appropriate.",
    ],
    tips: "The best time to build agency relationships is before there's an opportunity. Use this tool to identify agencies where you have connections.",
  },
  {
    num: "11",
    id: "weekly-pipeline-report",
    title: "Weekly Pipeline Report",
    maxGuideIndex: 11,
    whatItDoes:
      "Every Monday morning, you receive an email summarizing your pipeline: total value by stage, upcoming deadlines, win rate trends, and recommended actions.",
    whyItMatters:
      "It's easy to lose track of the big picture when you're focused on individual bids. The weekly report forces you to step back and see your entire pipeline at a glance.",
    howToUseIt: [
      "Check your email every Monday morning.",
      "Review the pipeline summary -- are you tracking enough opportunities?",
      "Check deadlines for the coming week.",
      "Act on the recommended actions.",
    ],
    tips: "If your pipeline total value is less than 3x your annual revenue target, you need to track more opportunities.",
  },
  {
    num: "12",
    id: "cpars-monitor",
    title: "CPARS Monitor",
    maxGuideIndex: 16,
    whatItDoes:
      "Tracks your CPARS (Contractor Performance Assessment Reporting System) ratings -- the government's report card on your work. When you receive a rating below Satisfactory, the AI generates a formal response draft.",
    whyItMatters:
      "CPARS ratings directly affect your ability to win future contracts. A Marginal or Unsatisfactory rating can follow you for years. A well-written response stays in the record and can offset the damage.",
    howToUseIt: [
      "When you receive a CPARS evaluation, enter the ratings here.",
      "Select the category (Quality, Schedule, Cost Control, etc.) and rating level.",
      "If any rating is Marginal or Unsatisfactory, click Generate Response.",
      "Review the AI draft, customize it, then submit through the official CPARS system.",
    ],
    tips: "Always respond to low ratings -- even Satisfactory ratings can benefit from a contractor response highlighting your best work. Reference your monthly performance logs as evidence.",
  },
  {
    num: "13",
    id: "subcontracting-network",
    title: "Subcontracting Network",
    maxGuideIndex: 16,
    whatItDoes:
      "Connects you with prime contractors looking for certified small businesses to join their teams on government bids. You get matched automatically based on your certifications and NAICS codes.",
    whyItMatters:
      "Large primes need certified subs to meet their small business subcontracting goals. This is inbound business development -- primes come to you instead of you cold-calling them. One teaming relationship can generate years of subcontract revenue.",
    howToUseIt: [
      "Browse teaming opportunities that match your certifications.",
      "Check the match score -- higher means better fit.",
      "Click Express Interest to notify the prime contractor.",
      "The prime sees your profile and past performance.",
      "If you're a prime looking for subs, post your own teaming need.",
    ],
    tips: "Respond quickly -- primes often select from the first 5-10 responses. A strong past performance library makes you much more attractive as a teaming partner.",
  },
  {
    num: "14",
    id: "competitor-intelligence",
    title: "Competitor Intelligence",
    maxGuideIndex: 16,
    whatItDoes:
      "Automatically builds profiles of companies you compete against. Tracks your win/loss record against each competitor and identifies their patterns -- which agencies they win at, what NAICS codes they focus on, and whether they tend to win on price or technical merit.",
    whyItMatters:
      "Knowing your competition is half the battle. If you know a competitor wins on price at a specific agency, you can adjust your strategy. If you know they have weak past performance in a certain area, you can emphasize your strength there.",
    howToUseIt: [
      "Competitor profiles are built automatically when you record wins and losses in your Pipeline.",
      "Enter the winner's name when you lose a bid.",
      "View encounter history to see patterns.",
      "Click Analyze for AI-generated competitive strategy recommendations.",
    ],
    tips: "The more bids you track -- wins AND losses -- the more useful this data becomes. Before writing a proposal, always check if you've competed against the incumbent before.",
  },
  {
    num: "15",
    id: "loss-analysis-debriefs",
    title: "Loss Analysis & Debriefs",
    maxGuideIndex: 16,
    whatItDoes:
      "When you lose a bid, the AI analyzes why and generates specific recommendations for next time. It looks at the opportunity details, your approach, the loss reason, and winner information to identify what to change.",
    whyItMatters:
      "Most contractors lose bids and move on without understanding why. The same mistakes repeat. Loss analysis turns every loss into a lesson that makes your next proposal stronger.",
    howToUseIt: [
      "When you move an opportunity to Lost in your Pipeline, enter the loss reason and winner name.",
      "The AI automatically generates a loss analysis.",
      "Review the \"Why you likely lost\" section.",
      "Read the \"What to do differently\" recommendations.",
      "Check the loss trends view to spot patterns across multiple bids.",
    ],
    tips: "Be honest when entering loss reasons -- \"price\" vs \"technical\" vs \"past performance\" helps the AI give better advice. If you lost 3 times at the same agency on price, the AI will tell you.",
  },
  {
    num: "16",
    id: "contract-vehicle-alerts",
    title: "Contract Vehicle Alerts",
    maxGuideIndex: 16,
    whatItDoes:
      "Monitors major government contract vehicles like GSA MAS, OASIS+, CIO-SP4, and Alliant 3. When a vehicle opens for new vendors (called an \"on-ramp\"), you get alerted if your NAICS codes and certifications qualify.",
    whyItMatters:
      "Being on a contract vehicle gives you access to task orders worth billions that non-vehicle holders can't bid on. Missing an on-ramp means waiting years for the next one. These windows are rare and time-sensitive.",
    howToUseIt: [
      "Your eligible vehicles are shown automatically based on your NAICS codes.",
      "You see the status of each vehicle (Open or Closed).",
      "When an on-ramp opens, you get an email alert with the deadline and application link.",
      "The system tracks which vehicles you're on and which you should apply for.",
    ],
    tips: "GSA MAS (Multiple Award Schedule) is the most common starting point -- it's almost always open for new vendors. Start there if you're not on any vehicle yet.",
  },
];

// ─── Main Page Component ────────────────────────────────────────────────

export default function GetStartedPage() {
  const { organization, user } = useDashboard();
  const supabase = createClient();
  const trialActive = isTrialActive(organization);

  const [checklist, setChecklist] = useState({
    account_created: true,
    sam_connected: false,
    first_digest_reviewed: false,
    first_opportunity_tracked: false,
    calendar_connected: false,
    compliance_reviewed: false,
    first_proposal_generated: false,
  });
  const [loading, setLoading] = useState(true);
  const [tourActive, setTourActive] = useState(false);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ "Core Products": true });

  const loadChecklist = useCallback(async () => {
    // Check SAM connected
    const samConnected = !!(organization.uei);

    // Check if any opportunity has been tracked
    const { count: trackedCount } = await supabase
      .from("opportunity_matches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .in("user_status", ["tracking", "bidding"]);

    // Check proposals
    const { count: proposalCount } = await supabase
      .from("proposal_drafts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id);

    setChecklist({
      account_created: true,
      sam_connected: samConnected,
      first_digest_reviewed: false, // checked via preference
      first_opportunity_tracked: (trackedCount ?? 0) > 0,
      calendar_connected: false, // checked via preference
      compliance_reviewed: false, // checked via preference
      first_proposal_generated: (proposalCount ?? 0) > 0,
    });

    // Load preferences
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (prefs) {
      setChecklist((prev) => ({
        ...prev,
        first_digest_reviewed: prefs.checklist_first_digest_reviewed ?? false,
        calendar_connected: prefs.google_calendar_connected ?? prefs.checklist_calendar_connected ?? false,
        compliance_reviewed: prefs.checklist_compliance_reviewed ?? false,
      }));
    }

    setLoading(false);
  }, [organization, user.id, supabase]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  const handleSetHomepage = async () => {
    await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, default_page: "dashboard" },
        { onConflict: "user_id" }
      );
    window.location.href = "/dashboard";
  };

  const handleRestartTour = () => {
    localStorage.removeItem("ci_tour_completed");
    setTourActive(true);
  };

  // Build checklist items
  const items = [
    {
      key: "account_created",
      label: "Create your account",
      done: checklist.account_created,
      detail: `Done — signed up ${new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    },
    {
      key: "sam_connected",
      label: "Connect your SAM.gov profile",
      done: checklist.sam_connected,
      detail: checklist.sam_connected
        ? `Done — UEI verified, ${organization.certifications?.length ?? 0} certifications loaded`
        : "Enter your UEI in Settings to connect",
      link: !checklist.sam_connected ? "/dashboard/settings" : undefined,
      linkLabel: "Go to Settings",
    },
    {
      key: "first_digest_reviewed",
      label: "Review your first daily digest",
      done: checklist.first_digest_reviewed,
      detail: checklist.first_digest_reviewed
        ? "Done"
        : "Your first digest arrives tomorrow at 7am",
    },
    {
      key: "first_opportunity_tracked",
      label: "Track your first opportunity",
      done: checklist.first_opportunity_tracked,
      detail: checklist.first_opportunity_tracked
        ? "Done"
        : 'Go to Dashboard and click "Track" on any opportunity that interests you',
      link: !checklist.first_opportunity_tracked ? "/dashboard" : undefined,
      linkLabel: "Go to Dashboard",
    },
    {
      key: "calendar_connected",
      label: "Connect Google Calendar",
      done: checklist.calendar_connected,
      detail: checklist.calendar_connected
        ? "Done — deadlines syncing"
        : "Push deadlines to your phone automatically",
      link: !checklist.calendar_connected ? "/dashboard/settings" : undefined,
      linkLabel: "Connect Now",
    },
    {
      key: "compliance_reviewed",
      label: "Review your compliance score",
      done: checklist.compliance_reviewed,
      detail: checklist.compliance_reviewed
        ? "Done"
        : "Check your SAM registration, certifications, and CMMC status",
      link: !checklist.compliance_reviewed ? "/dashboard/compliance" : undefined,
      linkLabel: "View Compliance",
    },
  ];

  // Add proposal item for BD Pro+
  const bdPro = trialActive || organization.plan === "bd_pro" || organization.plan === "team";
  if (bdPro) {
    items.push({
      key: "first_proposal_generated",
      label: "Generate your first proposal draft",
      done: checklist.first_proposal_generated,
      detail: checklist.first_proposal_generated
        ? "Done"
        : 'Mark any opportunity as "Bidding" then go to Proposals to generate an AI draft',
      link: !checklist.first_proposal_generated ? "/dashboard/proposals" : undefined,
      linkLabel: "Go to Proposals",
    });
  }

  const completedCount = items.filter((i) => i.done).length;
  const totalItems = items.length;
  const progressPct = Math.round((completedCount / totalItems) * 100);

  // Build guides based on tier
  // During trial: all 16. After trial: Discovery 1-5, BD Pro 1-11, Team 1-16
  const maxGuide = trialActive
    ? 16
    : organization.plan === "team"
      ? 16
      : organization.plan === "bd_pro"
        ? 11
        : 5;

  const visibleGuides = ALL_GUIDES.slice(0, maxGuide);

  return (
    <div>
      {tourActive && (
        <ProductTour onComplete={() => setTourActive(false)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="ci-page-title">Get Started</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#2563eb" }} />
          <p className="text-sm text-[#4b5563] mt-1">
            Welcome to ContractsIntel, {(organization.name || "").split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}. Here is everything
            you need to get up and running.
          </p>
        </div>
        <HelpButton page="dashboard" />
      </div>

      {/* Progress Ring + Step Cards */}
      <div className="mb-6">
        {/* Circular progress ring */}
        <div className="flex flex-col items-center mb-6">
          <svg width={64} height={64} className="-rotate-90">
            <circle
              cx={32}
              cy={32}
              r={28}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={4}
            />
            <circle
              cx={32}
              cy={32}
              r={28}
              fill="none"
              stroke="#059669"
              strokeWidth={4}
              strokeDasharray={2 * Math.PI * 28}
              strokeDashoffset={2 * Math.PI * 28 * (1 - progressPct / 100)}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-lg font-semibold text-[#111827] -mt-10 mb-6">{progressPct}%</span>
          <span className="text-sm text-[#4b5563]">{completedCount} of {totalItems} complete</span>
        </div>

        {/* Step cards */}
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.key}
              className={`border rounded-lg flex items-center gap-4 px-5 py-4 ${
                item.done
                  ? "border-l-[3px] border-l-[#059669] border-[#e5e7eb] bg-[#f0fdf4]"
                  : "border-[#e5e7eb] bg-white"
              }`}
            >
              {/* Number */}
              <span className="text-2xl font-serif text-[#2563eb] shrink-0 w-8 text-center">
                {String(idx + 1).padStart(2, "0")}
              </span>

              {/* Title + description */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[15px] text-[#111827]">{item.label}</p>
                <p className="text-sm text-[#4b5563] mt-0.5">{item.detail}</p>
              </div>

              {/* Status / action */}
              {item.done ? (
                <span className="shrink-0 px-3 py-1 text-xs font-medium rounded bg-[#059669] text-white">
                  Done &#10003;
                </span>
              ) : item.link ? (
                <Link
                  href={item.link}
                  className="shrink-0 px-3 py-1 text-xs font-medium rounded bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors"
                >
                  Go &rarr;
                </Link>
              ) : (
                <span className="shrink-0 px-3 py-1 text-xs font-medium rounded border border-[#f0f1f3] text-[#9ca3af]">
                  Pending
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={handleRestartTour}
          className="border border-[#f0f1f3] text-[#4b5563] px-4 py-2 text-sm hover:border-[#d1d5db] hover:text-[#111827] transition-colors"
        >
          Restart Product Tour
        </button>
        <button
          onClick={handleSetHomepage}
          className="border border-[#f0f1f3] text-[#4b5563] px-4 py-2 text-sm hover:border-[#d1d5db] hover:text-[#111827] transition-colors"
        >
          Set Dashboard as Homepage
        </button>
      </div>

      {/* Quick Start Guide */}
      <div className="border border-[#f0f1f3] bg-white p-6 mb-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-2">Quick Start Guide</h2>
        <p className="text-sm text-[#4b5563]">Written guides for every product, grouped by tier. Each explains what it does, why it matters, and how to use it step by step.</p>
      </div>

      {/* Categorized Product Guides */}
      <div className="space-y-4">
        {[
          { label: "Core Products", badge: null, badgeColor: "", guides: visibleGuides.filter((g) => g.maxGuideIndex <= 5), defaultOpen: true },
          { label: "Business Development Tools", badge: "BD PRO", badgeColor: "text-[#2563eb] border-[#2563eb]/30 bg-[#eff4ff]", guides: visibleGuides.filter((g) => g.maxGuideIndex > 5 && g.maxGuideIndex <= 11), defaultOpen: false },
          { label: "Enterprise & Intelligence", badge: "TEAM", badgeColor: "text-[#7c3aed] border-[#7c3aed]/30 bg-[#f5f3ff]", guides: visibleGuides.filter((g) => g.maxGuideIndex > 11), defaultOpen: false },
        ].filter((cat) => cat.guides.length > 0).map((category) => {
          const catKey = category.label;
          const isCatOpen = expandedCategories[catKey] ?? category.defaultOpen;
          return (
            <div key={catKey} className="border border-[#f0f1f3] rounded-lg overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => setExpandedCategories((prev) => ({ ...prev, [catKey]: !isCatOpen }))}
                className="w-full flex items-center justify-between px-5 py-4 bg-[#f1f5f9] hover:bg-[#e8ecf1] transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-[#111827]">{category.label}</h3>
                  {category.badge && (
                    <span className={`px-2 py-0.5 text-[10px] font-mono uppercase border rounded ${category.badgeColor}`}>{category.badge}</span>
                  )}
                  <span className="text-xs text-[#9ca3af]">({category.guides.length})</span>
                </div>
                <svg className={`w-4 h-4 text-[#9ca3af] transition-transform duration-200 ${isCatOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M19 9l-7 7-7-7" /></svg>
              </button>

              {/* Category content */}
              <div style={{ maxHeight: isCatOpen ? "5000px" : "0", overflow: "hidden", transition: "max-height 300ms ease" }}>
                <div className="divide-y divide-[#e5e7eb]">
                  {category.guides.map((guide) => {
                    const isOpen = expandedGuide === guide.id;
                    return (
                      <div key={guide.id}>
                        <button
                          onClick={() => setExpandedGuide(isOpen ? null : guide.id)}
                          className="w-full flex items-center justify-between px-5 py-3.5 pl-8 text-left hover:bg-[#f8f9fb] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-[#3b82f6] w-5">{guide.num}</span>
                            <h4 className="text-sm font-medium text-[#111827]">{guide.title}</h4>
                          </div>
                          <svg className={`w-3.5 h-3.5 text-[#9ca3af] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {isOpen && (
                          <div className="px-5 pl-16 pb-5 pt-1">
                            <div className="space-y-5">
                              <div>
                                <h5 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-1.5">What it does</h5>
                                <p className="text-sm text-[#4b5563] leading-relaxed">{guide.whatItDoes}</p>
                              </div>
                              <div>
                                <h5 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-1.5">Why it matters</h5>
                                <p className="text-sm text-[#4b5563] leading-relaxed">{guide.whyItMatters}</p>
                              </div>
                              <div>
                                <h5 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-1.5">How to use it</h5>
                                <ol className="space-y-1.5">
                                  {guide.howToUseIt.map((step, i) => (
                                    <li key={i} className="flex gap-2 text-sm text-[#4b5563] leading-relaxed">
                                      <span className="text-[#3b82f6] font-mono shrink-0">{i + 1}.</span>
                                      <span>{step}</span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                              <div>
                                <h5 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-1.5">Tips</h5>
                                <p className="text-sm text-[#4b5563] leading-relaxed">{guide.tips}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

```

### Sections (top to bottom):
1. Header
2. Progress Ring + Step Cards
3. Circular progress ring
4. Step cards
5. Number
6. Title + description
7. Status / action
8. Action Buttons
9. Quick Start Guide
10. Categorized Product Guides
11. Category header
12. Category content

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Button: "Restart Product Tour"
- Button: "Set Dashboard as Homepage"
- Button: "setExpandedCategories((prev) => ({ ...prev, [catKey]: !isCatOpen }))}
          "
- Button: "setExpandedGuide(isOpen ? null : guide.id)}
                          className="

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/search
### File: app/dashboard/search/page.tsx
### Lines: 263

### Full Code:
```tsx
"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "../page-header";

function formatCurrency(n: number | null): string {
  if (!n) return "";
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
  if (d === null) return "";
  if (d < 0) return "Expired";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `${d}d left`;
}

type SortOption = "newest" | "deadline" | "value";
type SourceFilter = "" | "sam_gov" | "usaspending" | "state_local" | "federal_civilian" | "sbir_sttr" | "grants_gov" | "subcontracting" | "forecasts" | "military_defense";

const PAGE_SIZE = 20;

export default function SearchPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const search = useCallback(async (resetOffset = false) => {
    setLoading(true);
    const effectiveOffset = resetOffset ? 0 : offset;
    if (resetOffset) setOffset(0);

    let q = supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .neq("status", "expired");

    if (query.trim()) {
      q = q.or(`title.ilike.%${query.trim()}%,agency.ilike.%${query.trim()}%,solicitation_number.ilike.%${query.trim()}%`);
    }

    if (source) {
      if (source === "state_local") {
        q = q.like("source", "state_%");
      } else {
        q = q.eq("source", source);
      }
    }

    if (sort === "newest") q = q.order("created_at", { ascending: false });
    else if (sort === "deadline") q = q.order("response_deadline", { ascending: true, nullsFirst: false });
    else if (sort === "value") q = q.order("estimated_value", { ascending: false, nullsFirst: false });

    q = q.range(effectiveOffset, effectiveOffset + PAGE_SIZE - 1);

    const { data, count } = await q;
    if (resetOffset) {
      setResults(data ?? []);
    } else {
      setResults((prev) => [...prev, ...(data ?? [])]);
    }
    setTotal(count ?? 0);
    setLoading(false);
  }, [supabase, query, source, sort, offset]);

  useEffect(() => {
    search(true);
  }, [query, source, sort]);

  const loadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    // Trigger search with new offset
    const doSearch = async () => {
      let q = supabase
        .from("opportunities")
        .select("*", { count: "exact" });

      if (query.trim()) {
        q = q.or(`title.ilike.%${query.trim()}%,agency.ilike.%${query.trim()}%,solicitation_number.ilike.%${query.trim()}%`);
      }
      if (source) {
        if (source === "state_local") {
          q = q.like("source", "state_%");
        } else {
          q = q.eq("source", source);
        }
      }
      if (sort === "newest") q = q.order("created_at", { ascending: false });
      else if (sort === "deadline") q = q.order("response_deadline", { ascending: true, nullsFirst: false });
      else if (sort === "value") q = q.order("estimated_value", { ascending: false, nullsFirst: false });

      q = q.range(newOffset, newOffset + PAGE_SIZE - 1);
      const { data } = await q;
      setResults((prev) => [...prev, ...(data ?? [])]);
    };
    doSearch();
  };

  const sourceLabel = (s: string | null) => {
    if (!s) return "Unknown";
    const map: Record<string, string> = {
      sam_gov: "SAM.gov",
      usaspending: "USASpending",
      federal_civilian: "Federal",
      sbir_sttr: "SBIR/STTR",
      grants_gov: "Grants.gov",
      subcontracting: "SubK",
      forecasts: "Forecast",
      military_defense: "Military",
    };
    if (s.startsWith("state_")) return s.replace("state_", "").toUpperCase();
    return map[s] || s;
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader
          title="Search All Contracts"
          subtitle={`${total.toLocaleString()} opportunities in database`}
          accentColor="#059669"
        />
        <Link href="/dashboard" className="text-sm text-[#2563eb] hover:text-[#1d4ed8] ci-btn">Back to Matches</Link>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, agency, or solicitation number..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-[#e5e7eb] rounded-xl bg-white focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20"
          />
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SourceFilter)}
          className="bg-white border border-[#e5e7eb] text-[#4b5563] text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#2563eb]"
        >
          <option value="">All Sources</option>
          <option value="sam_gov">SAM.gov</option>
          <option value="usaspending">USASpending</option>
          <option value="state_local">State & Local</option>
          <option value="federal_civilian">Federal Civilian</option>
          <option value="sbir_sttr">SBIR/STTR</option>
          <option value="grants_gov">Grants.gov</option>
          <option value="military_defense">Military</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="bg-white border border-[#e5e7eb] text-[#4b5563] text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#2563eb]"
        >
          <option value="newest">Newest</option>
          <option value="deadline">Deadline soonest</option>
          <option value="value">Highest value</option>
        </select>
      </div>

      {/* Results */}
      {loading && results.length === 0 ? (
        <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af] rounded-xl">
          Searching...
        </div>
      ) : results.length === 0 ? (
        <div className="border border-[#f0f1f3] bg-white p-12 text-center rounded-xl">
          <p className="text-[#9ca3af]">No opportunities found. Try a different search.</p>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-[11px] font-mono text-[#94a3b8] px-1 mb-2">
            Showing {results.length} of {total.toLocaleString()} results
          </div>
          {results.map((opp) => {
            const days = daysUntil(opp.response_deadline);
            const deadlineColor = days !== null && days <= 3 ? "text-[#ef4444]" : days !== null && days <= 7 ? "text-[#f59e0b]" : "text-[#64748b]";
            return (
              <div
                key={opp.id}
                className="border border-[#f0f1f3] bg-white rounded-lg hover:border-[#e2e8f0] hover:shadow-sm transition-all"
              >
                <div
                  className="px-4 py-2.5 flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === opp.id ? null : opp.id)}
                >
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f8f9fb] text-[#64748b] border border-[#f0f1f3] shrink-0">
                    {sourceLabel(opp.source)}
                  </span>
                  <span className="text-sm text-[#0f172a] font-medium truncate flex-1">{(opp.title || "").replace(/&#\d+;/g, (m: string) => String.fromCharCode(parseInt(m.slice(2, -1)))).replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")}</span>
                  <span className="text-[11px] text-[#64748b] truncate max-w-[200px] hidden md:inline">{opp.agency}</span>
                  {opp.estimated_value ? <span className="text-xs font-mono text-[#111827] shrink-0">{formatCurrency(opp.estimated_value)}</span> : null}
                  <span className={`text-[11px] font-mono shrink-0 w-14 text-right ${deadlineColor}`}>{deadlineLabel(opp.response_deadline)}</span>
                  <svg className={`w-4 h-4 text-[#9ca3af] shrink-0 transition-transform ${expandedId === opp.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {expandedId === opp.id && (
                  <div className="px-4 pb-3 border-t border-[#f0f1f3] pt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {opp.set_aside && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563]">{opp.set_aside}</span>}
                      {opp.naics_code && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] font-mono">NAICS {opp.naics_code}</span>}
                      {opp.place_of_performance && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563]">{opp.place_of_performance}</span>}
                    </div>
                    {opp.description && <p className="text-xs text-[#4b5563] leading-relaxed line-clamp-4">{opp.description}</p>}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      {opp.agency && <div><span className="text-[#9ca3af]">Agency:</span> <span className="text-[#111827]">{opp.agency}</span></div>}
                      {opp.posted_date && <div><span className="text-[#9ca3af]">Posted:</span> <span className="text-[#111827]">{new Date(opp.posted_date).toLocaleDateString()}</span></div>}
                      {opp.response_deadline && <div><span className="text-[#9ca3af]">Deadline:</span> <span className="text-[#111827]">{new Date(opp.response_deadline).toLocaleDateString()}</span></div>}
                      {opp.solicitation_number && <div><span className="text-[#9ca3af]">Solicitation:</span> <span className="text-[#111827] font-mono">{opp.solicitation_number}</span></div>}
                    </div>
                    {(opp.sam_url || opp.source_url) && (
                      <a href={opp.sam_url || opp.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2563eb] bg-[#eff4ff] hover:bg-[#dbeafe] rounded-lg transition-colors">
                        View Original Listing →
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {results.length < total && (
            <div className="flex justify-center pt-4">
              <button
                onClick={loadMore}
                className="px-6 py-2.5 text-sm font-medium border border-[#f0f1f3] text-[#4b5563] bg-white hover:border-[#e2e8f0] hover:text-[#111827] hover:shadow-sm rounded-xl transition-all"
              >
                Load more ({(total - results.length).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

```

### Sections (top to bottom):
1. Search bar
2. Results

### Custom CSS Classes (ci-* design system):
- `ci-btn`

### Buttons/Actions:
- Button: "Load more ({(total - results.length).toLocaleString()} remaining)"
- Link to /dashboard: "Back to Matches"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/pipeline
### File: app/dashboard/pipeline/page.tsx
### Lines: 404

### Full Code:
```tsx
"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { HelpButton } from "../help-panel";
import { InlineGuide } from "../inline-guide";

const STAGES = [
  { key: "monitoring", label: "Monitoring", color: "#6b7280", bg: "bg-[#f1f5f9]", text: "text-[#6b7280]" },
  { key: "preparing_bid", label: "Preparing Bid", color: "#d97706", bg: "bg-[#fffbeb]", text: "text-[#d97706]" },
  { key: "submitted", label: "Submitted", color: "#2563eb", bg: "bg-[#eff4ff]", text: "text-[#2563eb]" },
  { key: "won", label: "Won", color: "#059669", bg: "bg-[#ecfdf5]", text: "text-[#059669]" },
  { key: "lost", label: "Lost", color: "#dc2626", bg: "bg-[#fef2f2]", text: "text-[#dc2626]" },
];

const LOSS_REASONS = [
  "Price too high",
  "Technical score too low",
  "Incumbent won",
  "Cancelled by agency",
  "Did not meet requirements",
  "Other",
];

function formatCurrency(n: number | null): string {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function daysUntil(date: string | null): string {
  if (!date) return "TBD";
  const d = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (d < 0) return "Expired";
  if (d === 0) return "Today";
  return `${d}d`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-[#22c55e]";
  if (score >= 60) return "text-[#3b82f6]";
  if (score >= 40) return "text-[#f59e0b]";
  return "text-[#9ca3af]";
}

export default function PipelinePage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wonModal, setWonModal] = useState<string | null>(null);
  const [lostModal, setLostModal] = useState<string | null>(null);
  const [wonData, setWonData] = useState({ award_amount: "", contract_number: "" });
  const [lostData, setLostData] = useState({ loss_reason: LOSS_REASONS[0], loss_notes: "" });

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from("opportunity_matches")
      .select("*, opportunities(*)")
      .eq("organization_id", organization.id)
      .not("pipeline_stage", "is", null)
      .order("created_at", { ascending: false });
    setMatches(data ?? []);
    setLoading(false);
  }, [organization.id, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const moveToStage = async (matchId: string, stage: string) => {
    if (stage === "won") {
      setWonModal(matchId);
      return;
    }
    if (stage === "lost") {
      setLostModal(matchId);
      return;
    }
    await supabase
      .from("opportunity_matches")
      .update({ pipeline_stage: stage })
      .eq("id", matchId);
    loadData();
  };

  const submitWon = async () => {
    if (!wonModal) return;
    const match = matches.find((m: any) => m.id === wonModal);
    const opp = match?.opportunities;
    const amount = wonData.award_amount ? Number(wonData.award_amount) : null;
    const contractNum = wonData.contract_number || null;

    // 1. Update opportunity match status
    await supabase
      .from("opportunity_matches")
      .update({
        pipeline_stage: "won",
        award_amount: amount,
        contract_number: contractNum,
      })
      .eq("id", wonModal);

    // 2. Auto-create past_performance record
    const { data: ppRecord } = await supabase
      .from("past_performance")
      .insert({
        organization_id: organization.id,
        match_id: wonModal,
        contract_name: opp?.title || "Untitled Contract",
        contract_number: contractNum,
        solicitation_number: opp?.solicitation_number || null,
        agency: opp?.agency || null,
        award_amount: amount,
        naics_code: opp?.naics_code || null,
        description: opp?.description || null,
        period_start: new Date().toISOString().split("T")[0],
        status: "active",
      })
      .select("id")
      .single();

    // 3. Auto-create contract record with milestones
    const { data: contractRecord } = await supabase
      .from("contracts")
      .insert({
        organization_id: organization.id,
        past_performance_id: ppRecord?.id || null,
        contract_number: contractNum,
        title: opp?.title || "Untitled Contract",
        agency: opp?.agency || null,
        value: amount,
        start_date: new Date().toISOString().split("T")[0],
        status: "active",
      })
      .select("id")
      .single();

    // 4. Auto-create default milestones (monthly reports for 12 months)
    if (contractRecord?.id) {
      const milestones = [];
      const now = new Date();
      for (let i = 1; i <= 12; i++) {
        const due = new Date(now.getFullYear(), now.getMonth() + i, 10);
        milestones.push({
          contract_id: contractRecord.id,
          title: `Monthly Report — ${due.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
          due_date: due.toISOString().split("T")[0],
          type: "report",
          status: "upcoming",
        });
      }
      await supabase.from("contract_milestones").insert(milestones);
    }

    // 5. Update agency analytics
    if (opp?.agency) {
      const { data: existing } = await supabase
        .from("agency_analytics")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("agency", opp.agency)
        .single();

      if (existing) {
        const wins = (existing.total_wins || 0) + 1;
        const bids = existing.total_bids_submitted || 1;
        await supabase
          .from("agency_analytics")
          .update({
            total_wins: wins,
            total_value_won: (existing.total_value_won || 0) + (amount || 0),
            win_rate: Math.round((wins / bids) * 100),
            last_updated: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("agency_analytics").insert({
          organization_id: organization.id,
          agency: opp.agency,
          total_wins: 1,
          total_bids_submitted: 1,
          total_value_won: amount || 0,
          win_rate: 100,
        });
      }
    }

    setWonModal(null);
    setWonData({ award_amount: "", contract_number: "" });
    loadData();
  };

  const submitLost = async () => {
    if (!lostModal) return;
    await supabase
      .from("opportunity_matches")
      .update({
        pipeline_stage: "lost",
        loss_reason: lostData.loss_reason,
        loss_notes: lostData.loss_notes || null,
      })
      .eq("id", lostModal);
    setLostModal(null);
    setLostData({ loss_reason: LOSS_REASONS[0], loss_notes: "" });
    loadData();
  };

  const grouped = STAGES.reduce(
    (acc, s) => {
      acc[s.key] = matches.filter((m) => m.pipeline_stage === s.key);
      return acc;
    },
    {} as Record<string, any[]>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#d97706"}} />
          <h1 className="ci-page-title">Pipeline</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#d97706" }} />
            <div className="w-10 h-[3px] rounded-full mt-2" style={{backgroundColor: "#d97706"}} />
        </div>
        <HelpButton page="pipeline" />
      </div>
      <InlineGuide page="pipeline" />

      {/* Summary Bar */}
      <div className="grid grid-cols-5 gap-px bg-[#e5e7eb] border border-[#f0f1f3] mb-6">
        {STAGES.map((s) => {
          const items = grouped[s.key] ?? [];
          const total = items.reduce((sum: number, m: any) => sum + (m.opportunities?.estimated_value ?? 0), 0);
          return (
            <div key={s.key} className="bg-white p-4">
              <div className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: s.color }}>
                {s.label}
              </div>
              <div className="text-lg font-bold text-[#111827] font-mono">{items.length}</div>
              <div className="text-xs text-[#9ca3af] font-mono">{formatCurrency(total)}</div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading pipeline...</div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {STAGES.map((stage) => (
            <div key={stage.key} className="min-h-[400px]">
              <div
                className={`text-xs font-mono uppercase tracking-wider mb-3 px-2 py-1.5 ${stage.bg} ${stage.text}`}
              >
                {stage.label} ({(grouped[stage.key] ?? []).length})
              </div>
              <div className="space-y-2">
                {(grouped[stage.key] ?? []).map((match: any) => {
                  const opp = match.opportunities;
                  return (
                    <div
                      key={match.id}
                      className="border border-[#f0f1f3] bg-white p-3 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200"
                    >
                      <h4 className="text-xs text-[#111827] font-medium truncate mb-1">
                        {opp?.title ?? "Untitled"}
                      </h4>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-[#4b5563]">
                          {formatCurrency(opp?.estimated_value)}
                        </span>
                        <span className={`text-xs font-mono font-bold ${scoreColor(match.match_score)}`}>
                          {match.match_score}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#9ca3af] font-mono mb-2">
                        {daysUntil(opp?.response_deadline)}
                      </div>
                      <select
                        value={match.pipeline_stage}
                        onChange={(e) => moveToStage(match.id, e.target.value)}
                        className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] text-[10px] px-2 py-1 focus:outline-none focus:border-[#2563eb]"
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            Move to {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Won Modal */}
      {wonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md border border-[#f0f1f3] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Award Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">
                  Award Amount
                </label>
                <input
                  type="number"
                  value={wonData.award_amount}
                  onChange={(e) => setWonData((d) => ({ ...d, award_amount: e.target.value }))}
                  placeholder="e.g. 500000"
                  className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">
                  Contract Number
                </label>
                <input
                  type="text"
                  value={wonData.contract_number}
                  onChange={(e) => setWonData((d) => ({ ...d, contract_number: e.target.value }))}
                  placeholder="e.g. GS-35F-0001X"
                  className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={submitWon}
                className="flex-1 bg-[#22c55e] text-white py-2 text-sm font-medium hover:bg-[#16a34a] transition-colors"
              >
                Confirm Win
              </button>
              <button
                onClick={() => setWonModal(null)}
                className="flex-1 border border-[#f0f1f3] text-[#4b5563] py-2 text-sm hover:border-[#d1d5db] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Modal */}
      {lostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md border border-[#f0f1f3] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Loss Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">
                  Reason
                </label>
                <select
                  value={lostData.loss_reason}
                  onChange={(e) => setLostData((d) => ({ ...d, loss_reason: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                >
                  {LOSS_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">
                  Notes
                </label>
                <textarea
                  value={lostData.loss_notes}
                  onChange={(e) => setLostData((d) => ({ ...d, loss_notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={submitLost}
                className="flex-1 bg-[#ef4444] text-white py-2 text-sm font-medium hover:bg-[#dc2626] transition-colors"
              >
                Confirm Loss
              </button>
              <button
                onClick={() => setLostModal(null)}
                className="flex-1 border border-[#f0f1f3] text-[#4b5563] py-2 text-sm hover:border-[#d1d5db] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

```

### Sections (top to bottom):
1. Summary Bar
2. Won Modal
3. Lost Modal

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Button: "Confirm Win"
- Button: "setWonModal(null)}
                className="flex-1 border border-[#f0f1f3] tex"
- Button: "Confirm Loss"
- Button: "setLostModal(null)}
                className="flex-1 border border-[#f0f1f3] te"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/proposals
### File: app/dashboard/proposals/page.tsx
### Lines: 230

### Full Code:
```tsx
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
          <div className="border border-[#f0f1f3] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">AI Proposals — BD Pro Feature</h2>
            <p className="text-sm text-[#4b5563] mb-4">
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
          <h1 className="ci-page-title">AI Proposals</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#7c3aed" }} />
          <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af]">
            Sample proposal content would appear here...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#7c3aed"}} />
          <h1 className="ci-page-title">AI Proposals</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#7c3aed" }} />
        </div>
        <HelpButton page="proposals" />
      </div>
      <InlineGuide page="proposals" />
      <TrialTierBanner page="proposals" />
      <div style={{display:'none'}}>
      </div>

      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading opportunities...</div>
      ) : matches.length === 0 ? (
        <div className="max-w-[480px] mx-auto text-center p-12" style={{background: "linear-gradient(135deg, #f5f3ff, #fff)", borderRadius: "16px", border: "1px solid rgba(124,58,237,0.08)"}}>
          <svg className="w-12 h-12 mx-auto mb-4" style={{color: "#7c3aed"}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <div className="text-[20px] font-bold text-[#0f172a] mb-2">AI proposals at your fingertips</div>
          <p className="text-sm text-[#4b5563] mb-6">Mark any opportunity as &ldquo;Bidding&rdquo; in your Pipeline, then come here to generate an AI-powered first draft in 60 seconds.</p>
          <a href="/dashboard/pipeline" className="inline-block px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 hover:-translate-y-0.5" style={{background: "#7c3aed"}}>Go to Pipeline</a>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Opportunity List */}
          <div className="col-span-1 space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-3">Active Bids</h2>
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMatch(m.id)}
                className={`w-full text-left border p-3 transition-colors ${
                  selectedMatch === m.id
                    ? "border-[#2563eb] bg-[#2563eb]/5"
                    : "border-[#e5e7eb] bg-white hover:border-[#d1d5db]"
                }`}
              >
                <h3 className="text-xs text-[#111827] font-medium truncate">{m.opportunities?.title}</h3>
                <p className="text-[10px] text-[#4b5563] mt-1">{m.opportunities?.agency}</p>
              </button>
            ))}
          </div>

          {/* Proposal Viewer */}
          <div className="col-span-2">
            {selectedMatch ? (
              <div className="border border-[#f0f1f3] bg-white">
                <div className="flex items-center justify-between p-4 border-b border-[#e5e7eb]">
                  <div className="flex gap-1">
                    {TABS.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 text-xs transition-colors ${
                          activeTab === tab
                            ? "bg-[#2563eb] text-white"
                            : "text-[#4b5563] hover:text-[#111827]"
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
                      className="px-3 py-1 text-xs border border-[#f0f1f3] text-[#4b5563] hover:border-[#d1d5db] disabled:opacity-30 transition-colors"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={downloadProposal}
                      disabled={!proposal}
                      className="px-3 py-1 text-xs border border-[#f0f1f3] text-[#4b5563] hover:border-[#d1d5db] disabled:opacity-30 transition-colors"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => selectedMatch && generateDraft(selectedMatch)}
                      disabled={generating}
                      className="px-3 py-1 text-xs bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50 transition-colors"
                    >
                      {generating ? "Generating..." : proposal ? "Regenerate" : "Generate Draft"}
                    </button>
                  </div>
                </div>
                <div className="p-6 min-h-[400px]">
                  {generating ? (
                    <div className="text-center text-[#9ca3af] py-12">
                      <div className="animate-pulse">Generating proposal draft with AI...</div>
                    </div>
                  ) : proposal ? (
                    <div className="text-sm text-[#4b5563] whitespace-pre-wrap leading-relaxed">
                      {proposal[activeTab]}
                    </div>
                  ) : (
                    <div className="text-center text-[#9ca3af] py-12">
                      Click &quot;Generate Draft&quot; to create an AI-powered proposal
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af]">
                Select an opportunity to generate a proposal
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

```

### Sections (top to bottom):
1. Opportunity List
2. Proposal Viewer

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Button: "setSelectedMatch(m.id)}
                className={`w-full text-left border p-3 "
- Button: "setActiveTab(tab)}
                        className={`px-3 py-1.5 text-xs trans"
- Button: "{copied ? "Copied" : "Copy"}"
- Button: "Download"
- Button: "selectedMatch && generateDraft(selectedMatch)}
                      disabled={g"
- Link to /dashboard/settings: "Upgrade to BD Pro"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/compliance
### File: app/dashboard/compliance/page.tsx
### Lines: 230

### Full Code:
```tsx
"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { HelpButton } from "../help-panel";
import { InlineGuide } from "../inline-guide";

const CATEGORIES = [
  { key: "sam", label: "SAM.gov Registration", icon: "S" },
  { key: "certs", label: "Certifications", icon: "C" },
  { key: "cmmc", label: "CMMC Readiness", icon: "M" },
  { key: "compliance", label: "Compliance Items", icon: "F" },
];

function urgencyColor(dueDate: string | null): string {
  if (!dueDate) return "text-[#9ca3af]";
  const d = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (d <= 3) return "text-[#ef4444]";
  if (d <= 7) return "text-[#f59e0b]";
  if (d <= 30) return "text-[#3b82f6]";
  return "text-[#22c55e]";
}

function urgencyBorder(dueDate: string | null): string {
  if (!dueDate) return "border-l-[#9ca3af]";
  const d = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (d <= 3) return "border-l-[#ef4444]";
  if (d <= 7) return "border-l-[#f59e0b]";
  if (d <= 30) return "border-l-[#3b82f6]";
  return "border-l-[#22c55e]";
}

export default function CompliancePage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from("compliance_items")
      .select("*")
      .eq("organization_id", organization.id)
      .order("due_date", { ascending: true });
    setItems(data ?? []);
    setLoading(false);
  }, [organization.id, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate health score
  const totalItems = items.length || 1;
  const completedItems = items.filter((i) => i.status === "complete" || i.status === "passed").length;
  const healthScore = Math.round((completedItems / totalItems) * 100);
  const healthColor =
    healthScore >= 80 ? "text-[#22c55e]" : healthScore >= 60 ? "text-[#f59e0b]" : "text-[#ef4444]";
  const healthBarColor =
    healthScore >= 80 ? "bg-[#22c55e]" : healthScore >= 60 ? "bg-[#f59e0b]" : "bg-[#ef4444]";

  // Group by category
  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category === cat.key),
    complete: items.filter((i) => i.category === cat.key && (i.status === "complete" || i.status === "passed")).length,
    total: items.filter((i) => i.category === cat.key).length,
  }));

  // Upcoming deadlines
  const upcoming = items
    .filter((i) => i.due_date && i.status !== "complete" && i.status !== "passed")
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#059669"}} />
          <h1 className="ci-page-title">Compliance Monitor</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#059669" }} />
        </div>
        <HelpButton page="compliance" />
      </div>
      <InlineGuide page="compliance" />

      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading compliance data...</div>
      ) : (
        <>
          {/* Health Score */}
          <div className="border border-[#f0f1f3] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
            <div className="flex items-center gap-8">
              <div>
                <div className={`text-5xl font-bold font-mono ${healthColor}`}>
                  {items.length > 0 ? healthScore : "--"}
                </div>
                <div className="text-xs text-[#9ca3af] font-mono uppercase tracking-wider mt-1">
                  Health Score
                </div>
              </div>
              <div className="flex-1">
                <div className="w-full h-3 bg-[#f8f9fb]">
                  <div
                    className={`h-full ${healthBarColor} transition-all`}
                    style={{ width: items.length > 0 ? `${healthScore}%` : "0%" }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-xs text-[#9ca3af]">
                    {completedItems} of {items.length} items complete
                  </span>
                  <span className="text-xs text-[#9ca3af]">
                    {items.length - completedItems} pending
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="grid grid-cols-4 gap-px bg-[#e5e7eb] border border-[#f0f1f3] mb-6">
            {grouped.map((cat) => {
              const pct = cat.total > 0 ? Math.round((cat.complete / cat.total) * 100) : 0;
              const catColor =
                pct >= 80 ? "text-[#22c55e]" : pct >= 60 ? "text-[#f59e0b]" : cat.total === 0 ? "text-[#9ca3af]" : "text-[#ef4444]";
              return (
                <div key={cat.key} className="bg-white p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-[#f8f9fb] flex items-center justify-center text-[10px] font-mono text-[#4b5563]">
                      {cat.icon}
                    </div>
                    <span className="text-xs text-[#4b5563]">{cat.label}</span>
                  </div>
                  <div className={`text-2xl font-bold font-mono ${catColor}`}>
                    {cat.total > 0 ? `${pct}%` : "--"}
                  </div>
                  <div className="text-[10px] text-[#9ca3af] font-mono mt-1">
                    {cat.complete}/{cat.total} complete
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upcoming Deadlines */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
                Upcoming Deadlines
              </h2>
              {upcoming.length === 0 ? (
                <div className="border border-[#f0f1f3] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center text-sm text-[#9ca3af]">
                  No pending deadlines
                </div>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((item) => (
                    <div
                      key={item.id}
                      className={`border border-[#f0f1f3] border-l-4 ${urgencyBorder(item.due_date)} bg-white p-4`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm text-[#111827]">{item.title}</h3>
                          <p className="text-xs text-[#9ca3af] mt-0.5">{item.category.toUpperCase()}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-mono ${urgencyColor(item.due_date)}`}>
                            {item.due_date
                              ? new Date(item.due_date).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "TBD"}
                          </span>
                        </div>
                      </div>
                      {item.details && (
                        <p className="text-xs text-[#9ca3af] mt-2">{item.details}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* FAR Change Alerts */}
              <div>
                <h2 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
                  FAR Change Alerts
                </h2>
                <div className="border border-[#f0f1f3] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
                  <div className="text-sm text-[#9ca3af]">No recent FAR changes affecting your profile</div>
                  <p className="text-xs text-[#9ca3af] mt-1">
                    We monitor Federal Acquisition Regulation updates relevant to your certifications.
                  </p>
                </div>
              </div>

              {/* CMMC Tracker */}
              <div>
                <h2 className="text-xs font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
                  CMMC Readiness
                </h2>
                <div className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-[#111827]">Target Level</span>
                    <span className="text-sm font-mono text-[#3b82f6]">
                      {organization.plan === "team" ? "Level 2" : "Level 1"}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#f8f9fb] mb-2">
                    <div className="h-full bg-[#3b82f6] w-0 transition-all" />
                  </div>
                  <p className="text-xs text-[#9ca3af]">
                    Complete your CMMC assessment in Settings to track readiness.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

```

### Sections (top to bottom):
1. Health Score
2. Category Breakdown
3. Upcoming Deadlines
4. FAR Change Alerts
5. CMMC Tracker

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
(No buttons found)

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/contracts
### File: app/dashboard/contracts/page.tsx
### Lines: 372

### Full Code:
```tsx
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

function formatCurrency(n: number | null): string {
  if (!n) return "$0";
  return `$${n.toLocaleString()}`;
}

export default function ContractsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const locked = isDiscovery(organization.plan, organization);

  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMilestoneModal, setShowMilestoneModal] = useState<string | null>(null);
  const [milestoneData, setMilestoneData] = useState({ title: "", due_date: "" });
  const [demandLetter, setDemandLetter] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    const { data } = await supabase
      .from("contracts")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    setContracts(data ?? []);
    setLoading(false);
  }, [organization.id, locked, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addMilestone = async () => {
    if (!showMilestoneModal || !milestoneData.title) return;
    const contract = contracts.find((c) => c.id === showMilestoneModal);
    const milestones = contract?.milestones ?? [];
    milestones.push({
      id: crypto.randomUUID(),
      title: milestoneData.title,
      due_date: milestoneData.due_date,
      status: "pending",
    });
    await supabase
      .from("contracts")
      .update({ milestones })
      .eq("id", showMilestoneModal);
    setShowMilestoneModal(null);
    setMilestoneData({ title: "", due_date: "" });
    loadData();
  };

  const flagLatePayment = async (contractId: string, inv: any, contractTitle: string) => {
    const submittedDate = inv.submitted_date || inv.date || "unknown";
    const dueDate = inv.due_date || "unknown";
    const amount = inv.amount ? `$${Number(inv.amount).toLocaleString()}` : "$0";
    const invoiceNum = inv.invoice_number || inv.number || "N/A";
    const today = new Date();
    const dueDateObj = new Date(dueDate);
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24)));

    const letter = `PROMPT PAYMENT ACT — DEMAND FOR PAYMENT

Contract: ${contractTitle}
Invoice #: ${invoiceNum}
Invoice Amount: ${amount}
Date Submitted: ${submittedDate}
Payment Due Date: ${dueDate}
Days Overdue: ${daysOverdue}

Dear Contracting Officer,

Under the Prompt Payment Act (31 USC §3901–3907) and FAR 52.232-25, the federal government is required to pay proper invoices within 30 calendar days of receipt. Invoice #${invoiceNum} for ${amount} was submitted on ${submittedDate} and payment is now ${daysOverdue} days overdue.

Interest penalties accrue automatically under the Act at the rate established by the Secretary of the Treasury. As of this notice, the accrued interest penalty is calculated from the payment due date of ${dueDate}.

We respectfully request immediate processing and payment of this invoice, along with any applicable interest penalties as required by law.

Please contact us if there are any questions regarding this invoice or if additional documentation is needed to process payment.

Respectfully,
${(organization.name || "[Your Company Name]").split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`;

    setDemandLetter(letter);

    // Mark invoice as flagged in DB
    await supabase
      .from("invoices")
      .update({ demand_letter_sent: true, demand_letter_date: today.toISOString().split("T")[0] })
      .eq("id", inv.id);
    loadData();
  };

  if (locked) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#f0f1f3] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">Contract Delivery — BD Pro Feature</h2>
            <p className="text-sm text-[#4b5563] mb-4">
              Manage active contracts, milestones, invoices, and option periods.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to BD Pro
            </Link>
          </div>
        </div>
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="ci-page-title">Contracts</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#0891b2" }} />
          <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af]">
            Sample contracts content...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#0891b2"}} />
          <h1 className="ci-page-title">Contract Delivery</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#0891b2" }} />
        </div>
        <HelpButton page="contracts" />
      </div>
      <InlineGuide page="contracts" />
      <TrialTierBanner page="contracts" />
      <div style={{display:'none'}}>
      </div>

      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading contracts...</div>
      ) : contracts.length === 0 ? (
        <div className="max-w-[480px] mx-auto text-center p-12" style={{background: "linear-gradient(135deg, #ecfeff, #fff)", borderRadius: "16px", border: "1px solid rgba(8,145,178,0.08)"}}>
          <svg className="w-12 h-12 mx-auto mb-4" style={{color: "#0891b2"}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></svg>
          <div className="text-[20px] font-bold text-[#0f172a] mb-2">Your delivery dashboard awaits</div>
          <p className="text-sm text-[#4b5563] mb-6">When you win a contract in the Pipeline, your delivery dashboard activates automatically with milestones, invoices, and deadline tracking.</p>
          <a href="/dashboard/pipeline" className="inline-block px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 hover:-translate-y-0.5" style={{background: "#0891b2"}}>Go to Pipeline</a>
        </div>
      ) : (
        <div className="space-y-6">
          {contracts.map((contract) => (
            <div key={contract.id} className="border border-[#f0f1f3] bg-white">
              {/* Contract Header */}
              <div className="p-5 border-b border-[#e5e7eb]">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm text-[#111827] font-medium">{contract.title}</h3>
                    <p className="text-xs text-[#4b5563] mt-0.5">{contract.agency}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs font-mono text-[#9ca3af]">{contract.contract_number}</span>
                      <span className="text-xs font-mono text-[#111827]">{formatCurrency(contract.value)}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-mono uppercase ${
                        contract.status === "active"
                          ? "bg-[#22c55e]/10 text-[#22c55e]"
                          : "bg-[#9ca3af]/10 text-[#9ca3af]"
                      }`}>
                        {contract.status}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMilestoneModal(contract.id)}
                    className="px-3 py-1 text-xs bg-[#0891b2] text-white hover:bg-[#0e7490] transition-colors"
                  >
                    Add Milestone
                  </button>
                </div>
              </div>

              {/* Milestones */}
              {contract.milestones && contract.milestones.length > 0 && (
                <div className="p-5 border-b border-[#e5e7eb]">
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
                    Milestones
                  </h4>
                  <div className="space-y-2">
                    {contract.milestones.map((ms: any) => (
                      <div key={ms.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 ${
                            ms.status === "complete" ? "bg-[#22c55e]" : ms.status === "in_progress" ? "bg-[#3b82f6]" : "bg-[#9ca3af]"
                          }`} />
                          <span className="text-xs text-[#111827]">{ms.title}</span>
                        </div>
                        <span className="text-xs font-mono text-[#9ca3af]">
                          {ms.due_date ? new Date(ms.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Option Periods */}
              {contract.option_periods && contract.option_periods.length > 0 && (
                <div className="p-5 border-b border-[#e5e7eb]">
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
                    Option Periods
                  </h4>
                  <div className="space-y-2">
                    {contract.option_periods.map((op: any) => (
                      <div key={op.id} className="flex items-center justify-between">
                        <span className="text-xs text-[#111827]">{op.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-[#9ca3af]">
                            {op.start_date} — {op.end_date}
                          </span>
                          <span className={`text-[10px] font-mono ${op.exercised ? "text-[#22c55e]" : "text-[#9ca3af]"}`}>
                            {op.exercised ? "EXERCISED" : "PENDING"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invoices */}
              {contract.invoices && contract.invoices.length > 0 && (
                <div className="p-5">
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
                    Invoices
                  </h4>
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af]">
                        <th className="text-left pb-2">Invoice #</th>
                        <th className="text-right pb-2">Amount</th>
                        <th className="text-right pb-2">Submitted</th>
                        <th className="text-right pb-2">Status</th>
                        <th className="text-right pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contract.invoices.map((inv: any) => (
                        <tr key={inv.id} className="border-t border-[#e5e7eb]">
                          <td className="py-2 text-xs text-[#111827] font-mono">{inv.number}</td>
                          <td className="py-2 text-xs text-[#111827] font-mono text-right">
                            {formatCurrency(inv.amount)}
                          </td>
                          <td className="py-2 text-xs text-[#9ca3af] font-mono text-right">
                            {inv.submitted_date
                              ? new Date(inv.submitted_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "--"}
                          </td>
                          <td className="py-2 text-right">
                            <span className={`text-[10px] font-mono uppercase ${
                              inv.status === "paid"
                                ? "text-[#22c55e]"
                                : inv.flagged_late
                                ? "text-[#ef4444]"
                                : "text-[#f59e0b]"
                            }`}>
                              {inv.flagged_late ? "LATE" : inv.status}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {inv.status !== "paid" && (
                              <button
                                onClick={() => flagLatePayment(contract.id, inv, contract.title)}
                                className="text-[10px] text-[#ef4444] hover:text-[#f87171] transition-colors"
                              >
                                {inv.demand_letter_sent ? "View Letter" : "Flag Late →"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Milestone Modal */}
      {showMilestoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md border border-[#f0f1f3] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Add Milestone</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">
                  Title
                </label>
                <input
                  type="text"
                  value={milestoneData.title}
                  onChange={(e) => setMilestoneData((d) => ({ ...d, title: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">
                  Due Date
                </label>
                <input
                  type="date"
                  value={milestoneData.due_date}
                  onChange={(e) => setMilestoneData((d) => ({ ...d, due_date: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={addMilestone}
                className="flex-1 bg-[#2563eb] text-white py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
              >
                Add Milestone
              </button>
              <button
                onClick={() => setShowMilestoneModal(null)}
                className="flex-1 border border-[#f0f1f3] text-[#4b5563] py-2 text-sm hover:border-[#d1d5db] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demand Letter Modal */}
      {demandLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-2xl border border-[#f0f1f3] bg-white p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#0f172a]">Prompt Payment Act — Demand Letter</h2>
              <button onClick={() => setDemandLetter(null)} className="text-[#9ca3af] hover:text-[#111827] text-xl">&times;</button>
            </div>
            <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-6 mb-4">
              <pre className="text-xs text-[#111827] font-mono whitespace-pre-wrap leading-relaxed">{demandLetter}</pre>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { navigator.clipboard.writeText(demandLetter); }}
                className="flex-1 bg-[#2563eb] text-white py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setDemandLetter(null)}
                className="flex-1 border border-[#f0f1f3] text-[#4b5563] py-2 text-sm hover:border-[#d1d5db] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

```

### Sections (top to bottom):
1. Contract Header
2. Milestones
3. Option Periods
4. Invoices
5. Milestone Modal
6. Demand Letter Modal

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Button: "setShowMilestoneModal(contract.id)}
                    className="px-3 py-1 tex"
- Button: "flagLatePayment(contract.id, inv, contract.title)}
                             "
- Button: "Add Milestone"
- Button: "setShowMilestoneModal(null)}
                className="flex-1 border border-[#f"
- Button: "setDemandLetter(null)} className="text-[#9ca3af] hover:text-[#111827] text-xl">&"
- Button: "{ navigator.clipboard.writeText(demandLetter); }}
                className="fle"
- Button: "setDemandLetter(null)}
                className="flex-1 border border-[#f0f1f3]"
- Link to /dashboard/settings: "Upgrade to BD Pro"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/past-performance
### File: app/dashboard/past-performance/page.tsx
### Lines: 274

### Full Code:
```tsx
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

export default function PastPerformancePage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const locked = isDiscovery(organization.plan, organization);

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [generatingPpq, setGeneratingPpq] = useState<string | null>(null);
  const [ppqNarrative, setPpqNarrative] = useState<string | null>(null);
  const [ppqRecordId, setPpqRecordId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    const { data } = await supabase
      .from("past_performance")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  }, [organization.id, locked, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const submitLog = async () => {
    if (!selectedRecord || !logText.trim()) return;
    const record = records.find((r) => r.id === selectedRecord);
    const logs = record?.monthly_logs ?? [];
    logs.push({ date: new Date().toISOString(), text: logText });
    await supabase
      .from("past_performance")
      .update({ monthly_logs: logs })
      .eq("id", selectedRecord);
    setShowLogModal(false);
    setLogText("");
    setSelectedRecord(null);
    loadData();
  };

  const generatePpq = async (recordId: string) => {
    setGeneratingPpq(recordId);
    setPpqNarrative(null);
    setPpqRecordId(recordId);
    try {
      const res = await fetch("/api/ppq/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_id: recordId, organization_id: organization.id }),
      });
      const data = await res.json();
      if (data.narrative) {
        setPpqNarrative(data.narrative);
        await supabase
          .from("past_performance")
          .update({ ppq_narrative: data.narrative })
          .eq("id", recordId);
      }
    } catch {
      // handle error
    }
    setGeneratingPpq(null);
  };

  const copyNarrative = () => {
    if (!ppqNarrative) return;
    navigator.clipboard.writeText(ppqNarrative);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (locked) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#f0f1f3] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">Past Performance Builder — BD Pro Feature</h2>
            <p className="text-sm text-[#4b5563] mb-4">
              Build and manage past performance records with AI-generated PPQ narratives.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to BD Pro
            </Link>
          </div>
        </div>
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="ci-page-title">Past Performance</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#dc2626" }} />
          <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af]">
            Sample past performance content...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#dc2626"}} />
          <h1 className="ci-page-title">Past Performance</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#dc2626" }} />
        </div>
        <HelpButton page="past-performance" />
      </div>
      <InlineGuide page="past-performance" />
      <TrialTierBanner page="past-performance" />
      <div style={{display:'none'}}>
      </div>

      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading records...</div>
      ) : records.length === 0 ? (
        <div className="max-w-[480px] mx-auto text-center p-12" style={{background: "linear-gradient(135deg, #fef2f2, #fff)", borderRadius: "16px", border: "1px solid rgba(220,38,38,0.08)"}}>
          <svg className="w-12 h-12 mx-auto mb-4" style={{color: "#dc2626"}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          <div className="text-[20px] font-bold text-[#0f172a] mb-2">Your performance library starts here</div>
          <p className="text-sm text-[#4b5563] mb-6">Win a contract in your Pipeline and a performance record is created automatically. Log monthly to build narratives that win future proposals.</p>
          <a href="/dashboard/pipeline" className="inline-block px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 hover:-translate-y-0.5" style={{background: "#dc2626"}}>Go to Pipeline</a>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <div key={record.id} className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm text-[#111827] font-medium">{record.contract_title}</h3>
                  <p className="text-xs text-[#4b5563] mt-0.5">{record.agency}</p>
                  {record.contract_number && (
                    <p className="text-xs text-[#9ca3af] font-mono mt-0.5">{record.contract_number}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedRecord(record.id);
                      setShowLogModal(true);
                    }}
                    className="px-3 py-1 text-xs border border-[#f0f1f3] text-[#4b5563] hover:border-[#d1d5db] hover:text-[#111827] transition-colors"
                  >
                    Log This Month
                  </button>
                  <button
                    onClick={() => generatePpq(record.id)}
                    disabled={generatingPpq === record.id}
                    className="px-3 py-1 text-xs bg-[#dc2626] text-white hover:bg-[#b91c1c] disabled:opacity-50 transition-colors"
                  >
                    {generatingPpq === record.id ? "Generating..." : "Generate PPQ"}
                  </button>
                </div>
              </div>

              {record.period_of_performance && (
                <div className="text-xs text-[#9ca3af] mb-2">
                  Period: {record.period_of_performance}
                </div>
              )}
              {record.contract_value && (
                <div className="text-xs text-[#9ca3af] mb-2">
                  Value: ${record.contract_value?.toLocaleString()}
                </div>
              )}
              {record.description && (
                <p className="text-xs text-[#4b5563] mb-3">{record.description}</p>
              )}

              {/* Monthly Logs */}
              {record.monthly_logs && record.monthly_logs.length > 0 && (
                <div className="border-t border-[#e5e7eb] pt-3 mt-3">
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-2">
                    Monthly Logs ({record.monthly_logs.length})
                  </h4>
                  <div className="space-y-1">
                    {record.monthly_logs.slice(-3).map((log: any, i: number) => (
                      <div key={i} className="text-xs text-[#4b5563]">
                        <span className="text-[#9ca3af] font-mono">
                          {new Date(log.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}:
                        </span>{" "}
                        {log.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PPQ Narrative Viewer */}
              {ppqRecordId === record.id && ppqNarrative && (
                <div className="border-t border-[#e5e7eb] pt-3 mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af]">
                      PPQ Narrative
                    </h4>
                    <button
                      onClick={copyNarrative}
                      className="text-xs text-[#3b82f6] hover:text-[#111827] transition-colors"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="text-sm text-[#4b5563] whitespace-pre-wrap leading-relaxed bg-[#f8f9fb] p-4 border border-[#f0f1f3]">
                    {ppqNarrative}
                  </div>
                </div>
              )}
              {record.ppq_narrative && ppqRecordId !== record.id && (
                <div className="border-t border-[#e5e7eb] pt-3 mt-3">
                  <button
                    onClick={() => {
                      setPpqRecordId(record.id);
                      setPpqNarrative(record.ppq_narrative);
                    }}
                    className="text-xs text-[#3b82f6] hover:text-[#111827] transition-colors"
                  >
                    View PPQ Narrative
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md border border-[#f0f1f3] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Log Monthly Performance</h2>
            <textarea
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
              rows={6}
              placeholder="Describe key accomplishments, deliverables, metrics, and any challenges this month..."
              className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={submitLog}
                className="flex-1 bg-[#2563eb] text-white py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
              >
                Save Log
              </button>
              <button
                onClick={() => { setShowLogModal(false); setLogText(""); }}
                className="flex-1 border border-[#f0f1f3] text-[#4b5563] py-2 text-sm hover:border-[#d1d5db] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

```

### Sections (top to bottom):
1. Monthly Logs
2. PPQ Narrative Viewer
3. Log Modal

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Button: "{
                      setSelectedRecord(record.id);
                      setS"
- Button: "generatePpq(record.id)}
                    disabled={generatingPpq === record.i"
- Button: "{copied ? "Copied" : "Copy"}"
- Button: "{
                      setPpqRecordId(record.id);
                      setPpqN"
- Button: "Save Log"
- Button: "{ setShowLogModal(false); setLogText(""); }}
                className="flex-1 b"
- Link to /dashboard/settings: "Upgrade to BD Pro"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/cpars
### File: app/dashboard/cpars/page.tsx
### Lines: 314

### Full Code:
```tsx
"use client";

import { useDashboard } from "../context";
import { isTeam } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";

const RATING_CATEGORIES = ["Quality", "Schedule", "Cost Control", "Management", "Small Business"];
const RATING_VALUES = ["Exceptional", "Very Good", "Satisfactory", "Marginal", "Unsatisfactory"];

function ratingColor(value: string): string {
  switch (value) {
    case "Exceptional": return "text-[#22c55e]";
    case "Very Good": return "text-[#3b82f6]";
    case "Satisfactory": return "text-[#111827]";
    case "Marginal": return "text-[#f59e0b]";
    case "Unsatisfactory": return "text-[#ef4444]";
    default: return "text-[#4b5563]";
  }
}

function ratingBg(value: string): string {
  switch (value) {
    case "Exceptional": return "bg-[#22c55e]/10";
    case "Very Good": return "bg-[#3b82f6]/10";
    case "Satisfactory": return "bg-[#111827]/5";
    case "Marginal": return "bg-[#f59e0b]/10";
    case "Unsatisfactory": return "bg-[#ef4444]/10";
    default: return "bg-[#f8f9fb]";
  }
}

export default function CparsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const teamTier = isTeam(organization.plan, organization);

  const [contracts, setContracts] = useState<any[]>([]);
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [responseView, setResponseView] = useState<{ id: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    contract_id: "",
    category: RATING_CATEGORIES[0],
    rating: RATING_VALUES[2],
    narrative: "",
    evaluation_date: "",
  });

  const loadData = useCallback(async () => {
    if (!teamTier) { setLoading(false); return; }
    const [contractsRes, ratingsRes] = await Promise.all([
      supabase.from("contracts").select("id, title, contract_number").eq("organization_id", organization.id),
      supabase.from("cpars_ratings").select("*, contracts(title, contract_number)").eq("organization_id", organization.id).order("created_at", { ascending: false }),
    ]);
    setContracts(contractsRes.data ?? []);
    setRatings(ratingsRes.data ?? []);
    setLoading(false);
  }, [organization.id, teamTier, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contract_id || !form.narrative) return;
    setSubmitting(true);
    await supabase.from("cpars_ratings").insert({
      organization_id: organization.id,
      contract_id: form.contract_id,
      category: form.category,
      rating: form.rating,
      narrative: form.narrative,
      evaluation_date: form.evaluation_date || null,
    });
    setForm({ contract_id: "", category: RATING_CATEGORIES[0], rating: RATING_VALUES[2], narrative: "", evaluation_date: "" });
    setSubmitting(false);
    loadData();
  };

  const generateResponse = async (ratingId: string) => {
    setGeneratingId(ratingId);
    try {
      const res = await fetch("/api/cpars/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating_id: ratingId }),
      });
      const data = await res.json();
      if (data.response) {
        setResponseView({ id: ratingId, text: data.response });
        loadData();
      }
    } catch {
      // silent
    }
    setGeneratingId(null);
  };

  const copyResponse = () => {
    if (responseView) {
      navigator.clipboard.writeText(responseView.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!teamTier) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#f0f1f3] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">CPARS Monitor — Team Feature</h2>
            <p className="text-sm text-[#4b5563] mb-4">
              Track CPARS evaluations, generate AI-powered responses to unfavorable ratings.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to Team
            </Link>
          </div>
        </div>
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="ci-page-title">CPARS Monitor</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#e11d48" }} />
          <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af]">
            Sample CPARS content...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#e11d48"}} />
          <h1 className="ci-page-title">CPARS Monitor</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#e11d48" }} />
        </div>
        <HelpButton page="cpars" />
      </div>
      <InlineGuide page="cpars" />

      {/* Add Rating Form */}
      <div className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
        <h2 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-4">Add CPARS Rating</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Contract</label>
              <select
                value={form.contract_id}
                onChange={(e) => setForm((f) => ({ ...f, contract_id: e.target.value }))}
                className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              >
                <option value="">Select contract...</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>{c.title} ({c.contract_number})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              >
                {RATING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Rating</label>
              <select
                value={form.rating}
                onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              >
                {RATING_VALUES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Evaluation Date</label>
              <input
                type="date"
                value={form.evaluation_date}
                onChange={(e) => setForm((f) => ({ ...f, evaluation_date: e.target.value }))}
                className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Narrative</label>
            <textarea
              value={form.narrative}
              onChange={(e) => setForm((f) => ({ ...f, narrative: e.target.value }))}
              rows={4}
              className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
              placeholder="Enter the evaluator's narrative..."
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !form.contract_id || !form.narrative}
            className="bg-[#e11d48] text-white px-6 py-2 text-sm font-medium hover:bg-[#be123c] transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Add Rating"}
          </button>
        </form>
      </div>

      {/* Ratings List */}
      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading ratings...</div>
      ) : ratings.length === 0 ? (
        <div className="max-w-[480px] mx-auto text-center p-12" style={{background: "linear-gradient(135deg, #fff1f2, #fff)", borderRadius: "16px", border: "1px solid rgba(225,29,72,0.08)"}}>
          <svg className="w-12 h-12 mx-auto mb-4" style={{color: "#e11d48"}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
          <div className="text-[20px] font-bold text-[#0f172a] mb-2">Track your CPARS ratings</div>
          <p className="text-sm text-[#4b5563] mb-6">When you receive a CPARS evaluation from a contracting officer, enter it here. If any rating is below Satisfactory, the AI generates a formal response draft.</p>
          <a href="#" className="inline-block px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 hover:-translate-y-0.5" style={{background: "#e11d48"}}>Add First Rating</a>
        </div>
      ) : (
        <div className="space-y-3">
          {ratings.map((r) => (
            <div key={r.id} className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm text-[#111827] font-medium">
                    {r.contracts?.title ?? "Unknown Contract"}
                  </h3>
                  <p className="text-xs text-[#9ca3af] font-mono mt-0.5">
                    {r.contracts?.contract_number} — {r.category}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.evaluation_date && (
                    <span className="text-xs font-mono text-[#9ca3af]">
                      {new Date(r.evaluation_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 text-[10px] font-mono uppercase ${ratingColor(r.rating)} ${ratingBg(r.rating)}`}>
                    {r.rating}
                  </span>
                </div>
              </div>
              <p className="text-sm text-[#4b5563] mb-3">{r.narrative}</p>
              {(r.rating === "Marginal" || r.rating === "Unsatisfactory") && (
                <div className="flex items-center gap-3">
                  {r.response_draft ? (
                    <button
                      onClick={() => setResponseView({ id: r.id, text: r.response_draft })}
                      className="text-xs text-[#3b82f6] hover:text-[#111827] transition-colors"
                    >
                      View Response Draft
                    </button>
                  ) : (
                    <button
                      onClick={() => generateResponse(r.id)}
                      disabled={generatingId === r.id}
                      className="px-3 py-1 text-xs bg-[#e11d48] text-white hover:bg-[#be123c] transition-colors disabled:opacity-50"
                    >
                      {generatingId === r.id ? "Generating..." : "Generate Response"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Response Viewer Modal */}
      {responseView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-2xl border border-[#f0f1f3] bg-white p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#0f172a]">CPARS Response Draft</h2>
              <button
                onClick={copyResponse}
                className="px-3 py-1 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4 text-sm text-[#111827] whitespace-pre-wrap">
              {responseView.text}
            </div>
            <button
              onClick={() => setResponseView(null)}
              className="mt-4 w-full border border-[#f0f1f3] text-[#4b5563] py-2 text-sm hover:border-[#d1d5db] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

```

### Sections (top to bottom):
1. Add Rating Form
2. Ratings List
3. Response Viewer Modal

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Button: "{submitting ? "Saving..." : "Add Rating"}"
- Button: "setResponseView({ id: r.id, text: r.response_draft })}
                      cla"
- Button: "generateResponse(r.id)}
                      disabled={generatingId === r.id}
 "
- Button: "{copied ? "Copied!" : "Copy"}"
- Button: "setResponseView(null)}
              className="mt-4 w-full border border-[#f0f1"
- Link to /dashboard/settings: "Upgrade to Team"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/network
### File: app/dashboard/network/page.tsx
### Lines: 387

### Full Code:
```tsx
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
          <div className="border border-[#f0f1f3] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">Subcontracting Network — Team Feature</h2>
            <p className="text-sm text-[#4b5563] mb-4">
              Find teaming partners and post subcontracting opportunities.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to Team
            </Link>
          </div>
        </div>
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="ci-page-title">Subcontracting Network</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#2563eb" }} />
          <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af]">
            Sample network content...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#2563eb"}} />
          <h1 className="ci-page-title">Subcontracting Network</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#2563eb" }} />
        </div>
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
            <div className="border border-[#f0f1f3] bg-white p-12 text-center">
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
                  <div key={opp.id} className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
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
          <div className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
            <h2 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-4">Post Teaming Opportunity</h2>
            <form onSubmit={handlePost} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                    placeholder="Opportunity title"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Agency</label>
                  <input
                    type="text"
                    value={form.agency}
                    onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Estimated Value</label>
                  <input
                    type="number"
                    value={form.estimated_value}
                    onChange={(e) => setForm((f) => ({ ...f, estimated_value: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Geography</label>
                  <input
                    type="text"
                    value={form.geography}
                    onChange={(e) => setForm((f) => ({ ...f, geography: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Required Certs (comma-sep)</label>
                  <input
                    type="text"
                    value={form.required_certs}
                    onChange={(e) => setForm((f) => ({ ...f, required_certs: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                    placeholder="8(a), HUBZone, SDVOSB..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">NAICS Codes (comma-sep)</label>
                  <input
                    type="text"
                    value={form.naics_codes}
                    onChange={(e) => setForm((f) => ({ ...f, naics_codes: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                    placeholder="541512, 541519..."
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
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
            <div className="border border-[#f0f1f3] bg-white p-12 text-center">
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
                  <div key={opp.id} className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
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

```

### Sections (top to bottom):
1. Tabs
2. Post Form
3. Posted List

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Button: "setTab("opportunities")}
          className={`px-5 py-2.5 text-sm transition-co"
- Button: "setTab("posted")}
          className={`px-5 py-2.5 text-sm transition-colors bo"
- Button: "expressInterest(opp.id)}
                            disabled={expressingInteres"
- Button: "{submitting ? "Posting..." : "Post Opportunity"}"
- Link to /dashboard/settings: "Upgrade to Team"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/competitors
### File: app/dashboard/competitors/page.tsx
### Lines: 267

### Full Code:
```tsx
"use client";

import { useDashboard } from "../context";
import { isTeam } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";

export default function CompetitorsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const teamTier = isTeam(organization.plan, organization);

  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisView, setAnalysisView] = useState<{ id: string; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({ name: "", uei: "", notes: "" });

  const loadData = useCallback(async () => {
    if (!teamTier) { setLoading(false); return; }
    const { data } = await supabase
      .from("competitors")
      .select("*, competitor_encounters(*)")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    setCompetitors(data ?? []);
    setLoading(false);
  }, [organization.id, teamTier, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSubmitting(true);
    await supabase.from("competitors").insert({
      organization_id: organization.id,
      name: form.name,
      uei: form.uei || null,
      notes: form.notes || null,
    });
    setForm({ name: "", uei: "", notes: "" });
    setShowForm(false);
    setSubmitting(false);
    loadData();
  };

  const analyzeCompetitor = async (competitorId: string) => {
    setAnalyzingId(competitorId);
    try {
      const res = await fetch("/api/competitors/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId }),
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysisView({ id: competitorId, text: data.analysis });
      }
    } catch {
      // silent
    }
    setAnalyzingId(null);
  };

  if (!teamTier) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#f0f1f3] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">Competitor Intelligence — Team Feature</h2>
            <p className="text-sm text-[#4b5563] mb-4">
              Track competitors, analyze win/loss patterns, and get AI-powered competitive insights.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to Team
            </Link>
          </div>
        </div>
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="ci-page-title">Competitor Intelligence</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#7c3aed" }} />
          <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af]">
            Sample competitor content...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#7c3aed"}} />
          <h1 className="ci-page-title">Competitor Intelligence</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#7c3aed" }} />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 text-sm bg-[#7c3aed] text-white hover:bg-[#6d28d9] transition-colors"
          >
            {showForm ? "Cancel" : "Add Competitor"}
          </button>
          <HelpButton page="competitors" />
        </div>
      <InlineGuide page="competitors" />
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Company Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  placeholder="Competitor name"
                />
              </div>
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">UEI (optional)</label>
                <input
                  type="text"
                  value={form.uei}
                  onChange={(e) => setForm((f) => ({ ...f, uei: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full bg-[#f8f9fb] border border-[#f0f1f3] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !form.name}
              className="bg-[#7c3aed] text-white px-6 py-2 text-sm font-medium hover:bg-[#6d28d9] transition-colors disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Competitor"}
            </button>
          </form>
        </div>
      )}

      {/* Competitors List */}
      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading competitors...</div>
      ) : competitors.length === 0 ? (
        <div className="border border-[#f0f1f3] bg-white p-12 text-center">
          <div className="text-[#9ca3af] text-lg mb-2">No competitors tracked</div>
          <p className="text-sm text-[#4b5563]">Add competitors to start building intelligence.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.map((comp) => {
            const encounters = comp.competitor_encounters ?? [];
            const wins = encounters.filter((e: any) => e.outcome === "win").length;
            const losses = encounters.filter((e: any) => e.outcome === "loss").length;
            return (
              <div key={comp.id} className="border border-[#f0f1f3] bg-white">
                <div className="p-5 border-b border-[#e5e7eb]">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm text-[#111827] font-medium">{comp.name}</h3>
                      {comp.uei && <p className="text-xs font-mono text-[#9ca3af] mt-0.5">UEI: {comp.uei}</p>}
                      <div className="flex items-center gap-4 mt-2">
                        {comp.certifications && comp.certifications.length > 0 && (
                          <span className="text-xs text-[#4b5563]">
                            Certs: {comp.certifications.join(", ")}
                          </span>
                        )}
                        {comp.naics_codes && comp.naics_codes.length > 0 && (
                          <span className="text-xs font-mono text-[#9ca3af]">
                            NAICS: {comp.naics_codes.join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-[#22c55e]">{wins}W</span>
                        <span className="text-xs text-[#ef4444]">{losses}L</span>
                        <span className="text-xs text-[#9ca3af]">{encounters.length} encounters</span>
                      </div>
                    </div>
                    <button
                      onClick={() => analyzeCompetitor(comp.id)}
                      disabled={analyzingId === comp.id}
                      className="px-3 py-1 text-xs bg-[#7c3aed] text-white hover:bg-[#6d28d9] transition-colors disabled:opacity-50"
                    >
                      {analyzingId === comp.id ? "Analyzing..." : "AI Analysis"}
                    </button>
                  </div>
                  {comp.notes && <p className="text-sm text-[#4b5563] mt-3">{comp.notes}</p>}
                </div>

                {/* Encounters */}
                {encounters.length > 0 && (
                  <div className="p-5">
                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-3">Encounters</h4>
                    <div className="space-y-2">
                      {encounters.slice(0, 5).map((enc: any) => (
                        <div key={enc.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 ${
                              enc.outcome === "win" ? "bg-[#22c55e]" : enc.outcome === "loss" ? "bg-[#ef4444]" : "bg-[#9ca3af]"
                            }`} />
                            <span className="text-xs text-[#111827]">{enc.opportunity_title ?? "Unknown"}</span>
                          </div>
                          <span className={`text-[10px] font-mono uppercase ${
                            enc.outcome === "win" ? "text-[#22c55e]" : enc.outcome === "loss" ? "text-[#ef4444]" : "text-[#9ca3af]"
                          }`}>
                            {enc.outcome ?? "pending"}
                          </span>
                        </div>
                      ))}
                      {encounters.length > 5 && (
                        <p className="text-xs text-[#9ca3af]">+{encounters.length - 5} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Analysis Modal */}
      {analysisView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-2xl border border-[#f0f1f3] bg-white p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Competitive Analysis</h2>
            <div className="bg-[#f8f9fb] border border-[#f0f1f3] p-4 text-sm text-[#111827] whitespace-pre-wrap">
              {analysisView.text}
            </div>
            <button
              onClick={() => setAnalysisView(null)}
              className="mt-4 w-full border border-[#f0f1f3] text-[#4b5563] py-2 text-sm hover:border-[#d1d5db] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

```

### Sections (top to bottom):
1. Add Form
2. Competitors List
3. Encounters
4. Analysis Modal

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Button: "setShowForm(!showForm)}
            className="px-4 py-2 text-sm bg-[#7c3aed] te"
- Button: "{submitting ? "Adding..." : "Add Competitor"}"
- Button: "analyzeCompetitor(comp.id)}
                      disabled={analyzingId === comp"
- Button: "setAnalysisView(null)}
              className="mt-4 w-full border border-[#f0f1"
- Link to /dashboard/settings: "Upgrade to Team"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/analytics
### File: app/dashboard/analytics/page.tsx
### Lines: 240

### Full Code:
```tsx
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
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="ci-page-title">Analytics</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#d97706" }} />
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
        <div className="ci-accent-line" style={{ backgroundColor: "#d97706" }} />
      </div>

      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading analytics...</div>
      ) : (
        <>
          {/* Agency Heat Map Table */}
          <div className="border border-[#f0f1f3] bg-white mb-6">
            <div className="p-5 border-b border-[#e5e7eb]">
              <h2 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af]">Agency Heat Map</h2>
            </div>
            {agencyStats.length === 0 ? (
              <div className="p-12 text-center text-[#9ca3af] text-sm">
                No agency data yet. Track opportunities to build analytics.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] border-b border-[#e5e7eb]">
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
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-1">Total Losses Analyzed</div>
              <div className="text-2xl font-mono text-[#111827]">{totalLosses}</div>
            </div>
            <div className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-1">Most Common Reason</div>
              <div className="text-sm text-[#111827] mt-1">{mostCommonReason}</div>
            </div>
            <div className="border border-[#f0f1f3] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-1">Lowest Win Rate Agency</div>
              <div className="text-sm text-[#111827] mt-1">
                {lowestWinRate[0] ? `${lowestWinRate[0].agency} (${lowestWinRate[0].win_rate.toFixed(0)}%)` : "N/A"}
              </div>
            </div>
          </div>

          {/* Loss Analyses */}
          <div className="border border-[#f0f1f3] bg-white">
            <div className="p-5 border-b border-[#e5e7eb]">
              <h2 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af]">Loss Analysis Insights</h2>
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

```

### Sections (top to bottom):
1. Agency Heat Map Table
2. Loss Analysis Summary Stats
3. Loss Analyses

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Link to /dashboard/settings: "Upgrade to Team"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/settings
### File: app/dashboard/settings/page.tsx
### Lines: 474

### Full Code:
```tsx
"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { tierLabel } from "@/lib/feature-gate";
import { HelpButton } from "../help-panel";

const CERTIFICATIONS = ["8(a)", "HUBZone", "WOSB", "EDWOSB", "SDVOSB", "Small Business", "Service-Disabled Veteran"];

const CERT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "8(a)": { bg: "bg-[#eff4ff]", text: "text-[#2563eb]", border: "border-[#2563eb]" },
  "HUBZone": { bg: "bg-[#ecfdf5]", text: "text-[#059669]", border: "border-[#059669]" },
  "WOSB": { bg: "bg-[#f5f3ff]", text: "text-[#7c3aed]", border: "border-[#7c3aed]" },
  "EDWOSB": { bg: "bg-[#f5f3ff]", text: "text-[#7c3aed]", border: "border-[#7c3aed]" },
  "SDVOSB": { bg: "bg-[#fef2f2]", text: "text-[#dc2626]", border: "border-[#dc2626]" },
  "Small Business": { bg: "bg-[#fffbeb]", text: "text-[#d97706]", border: "border-[#d97706]" },
  "Service-Disabled Veteran": { bg: "bg-[#fef2f2]", text: "text-[#dc2626]", border: "border-[#dc2626]" },
};
const GEO_OPTIONS = ["Nationwide", "DC Metro", "Northeast", "Southeast", "Midwest", "Southwest", "West Coast", "Pacific"];
const SIZE_OPTIONS = ["Micro (<$150K)", "Small ($150K-$750K)", "Medium ($750K-$5M)", "Large ($5M+)"];

export default function SettingsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const router = useRouter();

  // Company Profile
  const [companyName, setCompanyName] = useState(organization.name ?? "");
  const [uei, setUei] = useState(organization.uei ?? "");
  const [cageCode, setCageCode] = useState(organization.cage_code ?? "");
  const [certs, setCerts] = useState<string[]>(organization.certifications ?? []);
  const [naicsCodes, setNaicsCodes] = useState((organization.naics_codes ?? []).join(", "));
  const [address, setAddress] = useState(organization.address ?? "");

  // Preferences
  const [geography, setGeography] = useState<string[]>([]);
  const [contractSize, setContractSize] = useState<string[]>([]);
  const [agencies, setAgencies] = useState("");
  const [minScore, setMinScore] = useState(50);

  // Notifications
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [complianceAlerts, setComplianceAlerts] = useState(true);
  const [deadlineReminders, setDeadlineReminders] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(true);

  // CMMC
  const [cmmcLevel, setCmmcLevel] = useState("1");

  // Calendar
  const [calendarConnected, setCalendarConnected] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [refreshingSam, setRefreshingSam] = useState(false);

  // Scraper run data
  const [scraperRuns, setScraperRuns] = useState<any[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});

  // Load scraper run data
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("scraper_runs")
          .select("*")
          .order("completed_at", { ascending: false })
          .limit(200);
        setScraperRuns(data ?? []);
      } catch {
        // scraper_runs table may not exist yet
      }

      // Fetch opportunity counts per source
      try {
        const sources = ["sam_gov", "usaspending", "grants_gov", "state_local", "military_defense", "sbir_sttr", "forecasts", "federal_civilian", "fpds_feed"];
        const counts: Record<string, number> = {};
        for (const src of sources) {
          const { count } = await supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("source", src);
          counts[src] = count ?? 0;
        }
        setSourceCounts(counts);
      } catch {
        // opportunities table may not exist yet
      }
    })();
  }, []);

  const toggleCert = (c: string) =>
    setCerts((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const toggleGeo = (g: string) =>
    setGeography((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  const toggleSize = (s: string) =>
    setContractSize((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from("organizations")
      .update({
        name: companyName,
        uei,
        cage_code: cageCode,
        certifications: certs,
        naics_codes: naicsCodes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        address,
      })
      .eq("id", organization.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const refreshFromSam = async () => {
    if (!uei) return;
    setRefreshingSam(true);
    try {
      const res = await fetch(`/api/audit?uei=${uei}`);
      const data = await res.json();
      if (data.entity) {
        setCompanyName(data.entity.legalBusinessName ?? companyName);
        setCageCode(data.entity.cageCode ?? cageCode);
        setAddress(data.entity.physicalAddress ?? address);
      }
    } catch {
      // handle error
    }
    setRefreshingSam(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#6b7280"}} />
          <h1 className="ci-page-title">Settings</h1>
          <div className="ci-accent-line" style={{ backgroundColor: "#6b7280" }} />
        </div>
        <HelpButton page="settings" />
      </div>

      {/* Company Profile */}
      <section className="border border-[#f0f1f3] border-l-[3px] border-l-[#2563eb] bg-white p-6 mb-6">
        <h2 className="text-xs text-[#9ca3af] font-mono uppercase tracking-wider mb-5">Company Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#4b5563] mb-1.5 font-mono uppercase tracking-wider">Company Name</label>
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-white border border-[#f0f1f3] text-[#111827] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#4b5563] mb-1.5 font-mono uppercase tracking-wider">UEI</label>
              <input type="text" value={uei} onChange={(e) => setUei(e.target.value)}
                placeholder="e.g. J7M9HPTGJ1S8"
                className="w-full bg-white border border-[#f0f1f3] text-[#111827] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
            </div>
            <div>
              <label className="block text-xs text-[#4b5563] mb-1.5 font-mono uppercase tracking-wider">CAGE Code</label>
              <input type="text" value={cageCode} onChange={(e) => setCageCode(e.target.value)}
                className="w-full bg-white border border-[#f0f1f3] text-[#111827] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#4b5563] mb-2 font-mono uppercase tracking-wider">Certifications</label>
            <div className="flex flex-wrap gap-2">
              {CERTIFICATIONS.map((c) => {
                const colors = CERT_COLORS[c] ?? { bg: "bg-[#f1f5f9]", text: "text-[#94a3b8]", border: "border-[#e5e7eb]" };
                return (
                  <button key={c} type="button" onClick={() => toggleCert(c)}
                    className={`px-3 py-1.5 text-xs border transition-colors ${certs.includes(c)
                      ? `${colors.border} ${colors.bg} ${colors.text}`
                      : "bg-[#f1f5f9] text-[#94a3b8] border-[#e5e7eb]"}`}>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#4b5563] mb-1.5 font-mono uppercase tracking-wider">NAICS Codes (comma-separated)</label>
            <input type="text" value={naicsCodes} onChange={(e) => setNaicsCodes(e.target.value)}
              placeholder="541511, 541512, 541330"
              className="w-full bg-white border border-[#f0f1f3] text-[#111827] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div>
            <label className="block text-xs text-[#4b5563] mb-1.5 font-mono uppercase tracking-wider">Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-white border border-[#f0f1f3] text-[#111827] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving}
              className="bg-[#2563eb] text-white px-6 py-3 text-sm font-medium hover:bg-[#3b82f6] transition-colors disabled:opacity-50">
              {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
            </button>
            <button onClick={refreshFromSam} disabled={refreshingSam || !uei}
              className="border border-[#f0f1f3] text-[#4b5563] px-6 py-3 text-sm hover:border-[#d1d5db] hover:text-[#111827] transition-colors disabled:opacity-30">
              {refreshingSam ? "Refreshing..." : "Refresh from SAM.gov"}
            </button>
          </div>
        </div>
      </section>

      {/* Opportunity Preferences */}
      <section className="border border-[#f0f1f3] border-l-[3px] border-l-[#d97706] bg-white p-6 mb-6">
        <h2 className="text-xs text-[#9ca3af] font-mono uppercase tracking-wider mb-5">Opportunity Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#4b5563] mb-2 font-mono uppercase tracking-wider">Geography</label>
            <div className="flex flex-wrap gap-2">
              {GEO_OPTIONS.map((g) => (
                <button key={g} type="button" onClick={() => toggleGeo(g)}
                  className={`px-3 py-1.5 text-xs border transition-colors ${geography.includes(g)
                    ? "border-[#2563eb] bg-[#2563eb]/10 text-[#3b82f6]"
                    : "border-[#e5e7eb] text-[#4b5563] hover:border-[#d1d5db]"}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#4b5563] mb-2 font-mono uppercase tracking-wider">Contract Size</label>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map((s) => (
                <button key={s} type="button" onClick={() => toggleSize(s)}
                  className={`px-3 py-1.5 text-xs border transition-colors ${contractSize.includes(s)
                    ? "border-[#2563eb] bg-[#2563eb]/10 text-[#3b82f6]"
                    : "border-[#e5e7eb] text-[#4b5563] hover:border-[#d1d5db]"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#4b5563] mb-1.5 font-mono uppercase tracking-wider">Preferred Agencies (comma-separated)</label>
            <input type="text" value={agencies} onChange={(e) => setAgencies(e.target.value)}
              placeholder="DoD, VA, GSA, DHS..."
              className="w-full bg-white border border-[#f0f1f3] text-[#111827] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div>
            <label className="block text-xs text-[#4b5563] mb-1.5 font-mono uppercase tracking-wider">
              Minimum Match Score: {minScore}
            </label>
            <input type="range" min={0} max={100} step={5} value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-[#2563eb]" />
          </div>
        </div>
      </section>

      {/* Subscription */}
      <section className="border border-[#f0f1f3] border-l-[3px] border-l-[#059669] bg-white p-6 mb-6">
        <h2 className="text-xs text-[#9ca3af] font-mono uppercase tracking-wider mb-4">Subscription</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#111827]">
              Current plan: <span className="text-[#3b82f6] font-medium">{tierLabel(organization.plan)}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {organization.stripe_customer_id && (
              <a href="/api/stripe/portal" className="px-4 py-2 text-xs border border-[#f0f1f3] text-[#4b5563] hover:border-[#d1d5db] transition-colors">
                Manage Billing
              </a>
            )}
            {organization.plan !== "team" && (
              <a href="https://buy.stripe.com/6oUdR95EN3467WHaGS5wI03" target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors">
                Upgrade to BD Pro
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="border border-[#f0f1f3] border-l-[3px] border-l-[#7c3aed] bg-white p-6 mb-6">
        <h2 className="text-xs text-[#9ca3af] font-mono uppercase tracking-wider mb-5">Notifications</h2>
        <div className="space-y-3">
          {[
            { label: "Daily Digest", desc: "Morning email with new matches", value: digestEnabled, set: setDigestEnabled },
            { label: "Compliance Alerts", desc: "Urgent compliance deadline warnings", value: complianceAlerts, set: setComplianceAlerts },
            { label: "Deadline Reminders", desc: "Bid deadline reminders (3d, 1d, same day)", value: deadlineReminders, set: setDeadlineReminders },
            { label: "Weekly Report", desc: "Pipeline summary and win/loss metrics", value: weeklyReport, set: setWeeklyReport },
          ].map((n) => (
            <label key={n.label} className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-[#111827]">{n.label}</span>
                <p className="text-xs text-[#9ca3af]">{n.desc}</p>
              </div>
              <button
                onClick={() => n.set(!n.value)}
                className={`w-10 h-5 flex items-center transition-colors ${n.value ? "bg-[#2563eb]" : "bg-[#e5e7eb]"}`}
              >
                <div className={`w-4 h-4 bg-white transition-transform ${n.value ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </label>
          ))}
        </div>
      </section>

      {/* CMMC Status */}
      <section className="border border-[#f0f1f3] border-l-[3px] border-l-[#dc2626] bg-white p-6 mb-6">
        <h2 className="text-xs text-[#9ca3af] font-mono uppercase tracking-wider mb-4">CMMC Status</h2>
        <div>
          <label className="block text-xs text-[#4b5563] mb-1.5 font-mono uppercase tracking-wider">Target Level</label>
          <select value={cmmcLevel} onChange={(e) => setCmmcLevel(e.target.value)}
            className="bg-white border border-[#f0f1f3] text-[#111827] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]">
            <option value="1">Level 1 — Basic Cyber Hygiene</option>
            <option value="2">Level 2 — Advanced Cyber Hygiene</option>
            <option value="3">Level 3 — Expert</option>
          </select>
        </div>
      </section>

      {/* Google Calendar */}
      <section className="border border-[#f0f1f3] border-l-[3px] border-l-[#0891b2] bg-white p-6 mb-6">
        <h2 className="text-xs text-[#9ca3af] font-mono uppercase tracking-wider mb-4">Google Calendar</h2>
        {calendarConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#22c55e]" />
              <span className="text-sm text-[#111827]">Connected</span>
            </div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-[#4b5563]">Sync bid deadlines</span>
              <div className="w-10 h-5 bg-[#2563eb] flex items-center">
                <div className="w-4 h-4 bg-white translate-x-5" />
              </div>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-[#4b5563]">Sync compliance deadlines</span>
              <div className="w-10 h-5 bg-[#2563eb] flex items-center">
                <div className="w-4 h-4 bg-white translate-x-5" />
              </div>
            </label>
            <button
              onClick={() => setCalendarConnected(false)}
              className="text-xs text-[#ef4444] hover:text-[#f87171] transition-colors"
            >
              Disconnect Calendar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCalendarConnected(true)}
            className="border border-[#f0f1f3] text-[#4b5563] px-4 py-2 text-sm hover:border-[#d1d5db] hover:text-[#111827] transition-colors"
          >
            Connect Google Calendar
          </button>
        )}
      </section>

      {/* Data Sources */}
      <section className="border border-[#f0f1f3] border-l-[3px] border-l-[#f59e0b] bg-white p-6 mb-6">
        <h2 className="text-xs text-[#9ca3af] font-mono uppercase tracking-wider mb-5">Data Sources</h2>
        {(() => {
          const lastRun = scraperRuns.length > 0 ? new Date(scraperRuns[0].completed_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }) : "Not yet run";

          const sourceGroups = [
            { label: "Federal Sources (25+)", key: "federal", sources: ["sam_gov", "usaspending", "grants_gov", "federal_civilian"], color: "#2563eb", intervalHours: 2 },
            { label: "State Sources (55)", key: "state", sources: ["state_local"], color: "#059669", intervalHours: 4 },
            { label: "Military Sources (14)", key: "military", sources: ["military_defense"], color: "#475569", intervalHours: 6 },
            { label: "SBIR/STTR Sources (7)", key: "sbir", sources: ["sbir_sttr"], color: "#7c3aed", intervalHours: 6 },
            { label: "Forecasts & Intel (5)", key: "forecasts", sources: ["forecasts", "fpds_feed"], color: "#d97706", intervalHours: 12 },
            { label: "Subcontracting (2)", key: "subcontracting", sources: ["subcontracting"], color: "#0d9488", intervalHours: 24 },
          ];

          const minutesAgo = (dateStr: string) => {
            const diff = Date.now() - new Date(dateStr).getTime();
            return Math.round(diff / 60000);
          };

          const formatAgo = (mins: number) => {
            if (mins < 1) return "Just now";
            if (mins < 60) return `${mins} min ago`;
            if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
            return `${Math.round(mins / 1440)} days ago`;
          };

          return (
            <div className="space-y-3">
              <p className="text-xs text-[#9ca3af]">Last updated: {lastRun}</p>
              {sourceGroups.map((group) => {
                const runs = scraperRuns.filter((r: any) => group.sources.includes(r.source));
                const latestRun = runs[0];
                const status = latestRun ? (latestRun.status === "success" ? "Active" : latestRun.status === "stub" ? "Pending Setup" : "Error") : "Not yet run";
                const statusColor = latestRun?.status === "success" ? "#22c55e" : latestRun?.status === "stub" ? "#9ca3af" : latestRun ? "#ef4444" : "#9ca3af";
                const totalOpps = group.sources.reduce((s: number, src: string) => s + (sourceCounts[src] || 0), 0);
                const lastScrapedMins = latestRun?.completed_at ? minutesAgo(latestRun.completed_at) : null;
                const isStale = lastScrapedMins !== null && lastScrapedMins > group.intervalHours * 60 * 2;

                return (
                  <button
                    key={group.key}
                    onClick={() => setExpandedSource(expandedSource === group.key ? null : group.key)}
                    className="w-full flex flex-col py-2 px-3 border border-[#f0f1f3] hover:border-[#e2e8f0] transition-colors text-left"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                        <span className="text-sm text-[#111827]">{group.label}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                          <span className="text-xs text-[#4b5563]">{status}</span>
                        </div>
                        <span className="text-xs font-mono text-[#9ca3af]">{totalOpps.toLocaleString()} opportunities</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-1 ml-5">
                      <span className={`text-xs ${isStale ? "text-[#f59e0b] font-medium" : "text-[#9ca3af]"}`}>
                        {lastScrapedMins !== null
                          ? `Last scraped: ${formatAgo(lastScrapedMins)}${isStale ? " (overdue)" : ""}`
                          : "Not yet run"}
                      </span>
                      <span className="text-xs text-[#9ca3af]">
                        Runs every {group.intervalHours < 1 ? `${group.intervalHours * 60} min` : `${group.intervalHours} hr`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </section>

      {/* Onboarding */}
      <section className="border border-[#f0f1f3] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
        <h2 className="text-xs text-[#9ca3af] font-mono uppercase tracking-wider mb-4">Onboarding</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              localStorage.removeItem("ci_tour_completed");
              window.location.href = "/dashboard";
            }}
            className="border border-[#f0f1f3] text-[#4b5563] px-4 py-2 text-sm hover:border-[#d1d5db] hover:text-[#111827] transition-colors"
          >
            Restart Product Tour
          </button>
          <a
            href="/dashboard/get-started"
            className="border border-[#f0f1f3] text-[#4b5563] px-4 py-2 text-sm hover:border-[#d1d5db] hover:text-[#111827] transition-colors"
          >
            View Get Started Guide
          </a>
        </div>
      </section>

      {/* Sign Out */}
      <button onClick={handleSignOut}
        className="text-sm text-[#ef4444] hover:text-[#f87171] transition-colors">
        Sign Out
      </button>
    </div>
  );
}

```

### Sections (top to bottom):
1. Company Profile
2. Opportunity Preferences
3. Subscription
4. Notifications
5. CMMC Status
6. Google Calendar
7. Data Sources
8. Onboarding
9. Sign Out

### Custom CSS Classes (ci-* design system):
- `ci-accent-line`
- `ci-page-title`

### Buttons/Actions:
- Button: "toggleCert(c)}
                    className={`px-3 py-1.5 text-xs border transi"
- Button: "{saving ? "Saving..." : saved ? "Saved" : "Save Changes"}"
- Button: "{refreshingSam ? "Refreshing..." : "Refresh from SAM.gov"}"
- Button: "toggleGeo(g)}
                  className={`px-3 py-1.5 text-xs border transitio"
- Button: "toggleSize(s)}
                  className={`px-3 py-1.5 text-xs border transiti"
- Button: "n.set(!n.value)}
                className={`w-10 h-5 flex items-center transiti"
- Button: "setCalendarConnected(false)}
              className="text-xs text-[#ef4444] hov"
- Button: "setCalendarConnected(true)}
            className="border border-[#f0f1f3] text-"
- Button: "setExpandedSource(expandedSource === group.key ? null : group.key)}
            "
- Button: "{
              localStorage.removeItem("ci_tour_completed");
              wind"
- Button: "Sign Out"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: /dashboard/opportunity/[id]
### File: app/dashboard/opportunity/[id]/page.tsx
### Lines: 399

### Full Code:
```tsx
"use client";

import { useDashboard } from "../../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

function formatCurrency(n: number | null | undefined): string {
  if (!n || n <= 0) return "TBD";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function cleanTitle(s: string): string {
  return (s || "").replace(/^\[[^\]]*\]\s*/, "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n))).replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}

export default function OpportunityDetailPage() {
  const { organization } = useDashboard();
  const params = useParams();
  const oppId = params.id as string;
  const supabase = createClient();

  const [opp, setOpp] = useState<any>(null);
  const [match, setMatch] = useState<any>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      // Load opportunity
      const { data: oppData } = await supabase.from("opportunities").select("*").eq("id", oppId).single();
      setOpp(oppData);

      // Load match for this org
      const { data: matchData } = await supabase
        .from("opportunity_matches")
        .select("*")
        .eq("opportunity_id", oppId)
        .eq("organization_id", organization.id)
        .single();
      setMatch(matchData);
      if (matchData?.user_notes) setNoteText(matchData.user_notes);

      // Load related opportunities (same NAICS or agency)
      if (oppData?.naics_code) {
        const { data: rel } = await supabase
          .from("opportunities")
          .select("id, title, agency, source, response_deadline")
          .eq("naics_code", oppData.naics_code)
          .neq("id", oppId)
          .neq("status", "expired")
          .order("created_at", { ascending: false })
          .limit(5);
        setRelated(rel ?? []);
      }

      setLoading(false);
    })();
  }, [oppId, organization.id, supabase]);

  const updateStatus = async (status: string) => {
    if (!match) return;
    await fetch("/api/opportunities/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: match.id, status }),
    });
    setMatch({ ...match, user_status: status });
    setToast(status === "tracking" ? "Tracking" : status === "bidding" ? "Preparing Bid" : "Skipped");
    setTimeout(() => setToast(""), 3000);
  };

  const saveNote = async () => {
    if (!match) return;
    await fetch("/api/opportunities/update-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: match.id, notes: noteText }),
    });
    setMatch({ ...match, user_notes: noteText });
    setEditingNote(false);
    setToast("Note saved");
    setTimeout(() => setToast(""), 3000);
  };

  if (loading) return <div className="p-12 text-center text-[#94a3b8]">Loading contract details...</div>;
  if (!opp) return <div className="p-12 text-center text-[#94a3b8]">Contract not found</div>;

  const days = daysUntil(opp.response_deadline);
  const deadlineColor = days !== null && days <= 7 ? "text-[#dc2626]" : days !== null && days <= 14 ? "text-[#d97706]" : "text-[#059669]";
  const val = opp.estimated_value ?? opp.value_estimate ?? 0;
  const attachments = (() => { try { return JSON.parse(opp.attachments || "[]"); } catch { return []; } })();

  const sourceLabel: Record<string, string> = {
    sam_gov: "SAM.gov", usaspending: "USASpending", grants_gov: "Grants.gov",
    federal_civilian: "Federal Civilian", sbir_sttr: "SBIR/STTR", military_defense: "Military/Defense",
    subcontracting: "Subcontracting", forecasts: "Forecasts",
  };
  const sourceName = sourceLabel[opp.source] || (opp.source?.startsWith("state_") ? opp.source.replace("state_", "").toUpperCase() : opp.source || "Unknown");
  const sourceSearchUrls: Record<string, string> = {
    sam_gov: "https://sam.gov/search/?index=opp",
    usaspending: "https://www.usaspending.gov/search",
    grants_gov: "https://www.grants.gov/search-grants",
  };
  const hasValidUrl = opp.sam_url || (opp.source_url && !opp.source_url.includes("undefined"));
  const isExpired = opp.status === "expired" || (days !== null && days < 0);
  const isRecompete = opp.source === "usaspending";

  return (
    <div className="max-w-4xl">
      {/* Back link */}
      <Link href="/dashboard" className="text-sm text-[#2563eb] hover:text-[#1d4ed8] mb-4 inline-block">&larr; Back to matches</Link>

      {/* Header */}
      <div className="ci-card p-6 mb-6">
        <div className="flex items-start gap-4">
          {match && (
            <div className={`ci-score-ring text-xl ${match.match_score >= 90 ? "border-[#059669] text-[#059669]" : match.match_score >= 80 ? "border-[#2563eb] text-[#2563eb]" : match.match_score >= 70 ? "border-[#d97706] text-[#d97706]" : "border-[#94a3b8] text-[#94a3b8]"}`}>
              {match.match_score}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="ci-serif text-[24px] tracking-[-0.01em] text-[#0f172a] mb-1">{cleanTitle(opp.title)}</h1>
            <p className="text-[14px] text-[#475569] mb-1">{opp.agency}</p>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#f1f5f9] text-[#475569]">{sourceName}</span>
              {isExpired && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#fef2f2] text-[#dc2626]">Expired</span>}
              {isRecompete && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#fefce8] text-[#a16207]">Recompete Alert</span>}
              {opp.set_aside_type && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#ecfdf5] text-[#059669]">{opp.set_aside_type}</span>}
            </div>
            <div className="flex items-center gap-2">
              {match?.user_status === "tracking" ? (
                <span className="px-3 py-1.5 text-xs text-[#059669] bg-[#ecfdf5] rounded-lg font-medium">Tracking</span>
              ) : match?.user_status === "bidding" ? (
                <span className="px-3 py-1.5 text-xs text-[#2563eb] bg-[#eff6ff] rounded-lg font-medium">Preparing Bid</span>
              ) : match ? (
                <>
                  <button onClick={() => updateStatus("tracking")} className="px-4 py-1.5 text-xs border border-[#e2e8f0] text-[#475569] hover:border-[#059669] hover:text-[#059669] rounded-lg ci-btn">Track</button>
                  <button onClick={() => updateStatus("bidding")} className="px-4 py-1.5 text-xs bg-[#2563eb] text-white hover:bg-[#1d4ed8] rounded-lg ci-btn">Bid</button>
                  <button onClick={() => updateStatus("skipped")} className="px-4 py-1.5 text-xs text-[#94a3b8] hover:text-[#475569] rounded-lg ci-btn">Skip</button>
                </>
              ) : null}
              {opp.response_deadline && (
                <a href={`https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(cleanTitle(opp.title))}&dates=${opp.response_deadline.replace(/-/g,"").substring(0,8)}/${opp.response_deadline.replace(/-/g,"").substring(0,8)}&details=${encodeURIComponent(`Deadline for ${opp.solicitation_number || opp.title}`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs border border-[#e2e8f0] text-[#475569] hover:bg-[#f1f5f9] rounded-lg ci-btn">
                  Add to Calendar
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main content */}
        <div className="col-span-2 space-y-6">
          {/* Key Details */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Key Details</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
              <div><span className="text-[#94a3b8]">Solicitation</span><div className="ci-mono text-[#0f172a] font-medium mt-0.5">{opp.solicitation_number || <span className="text-[#94a3b8] italic font-normal">Not specified</span>}</div></div>
              <div><span className="text-[#94a3b8]">Value</span><div className="text-[#0f172a] font-semibold mt-0.5">{formatCurrency(val)}</div></div>
              <div><span className="text-[#94a3b8]">Set-Aside</span><div className="text-[#0f172a] mt-0.5">{opp.set_aside_description || opp.set_aside_type || <span className="text-[#94a3b8] italic">Full & Open</span>}</div></div>
              <div><span className="text-[#94a3b8]">NAICS Code</span><div className="ci-mono text-[#0f172a] mt-0.5">{opp.naics_code ? `${opp.naics_code}${opp.naics_description ? ` — ${opp.naics_description}` : ""}` : <span className="text-[#94a3b8] italic font-normal">Not specified</span>}</div></div>
              <div><span className="text-[#94a3b8]">Response Deadline</span><div className={`font-medium mt-0.5 ${opp.response_deadline ? deadlineColor : "text-[#94a3b8]"}`}>{opp.response_deadline ? `${new Date(opp.response_deadline).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}${days !== null ? ` (${days > 0 ? days + "d left" : "passed"})` : ""}` : <span className="italic font-normal">Check solicitation</span>}</div></div>
              <div><span className="text-[#94a3b8]">Location</span><div className="text-[#0f172a] mt-0.5">{opp.place_of_performance || <span className="text-[#94a3b8] italic">Not specified</span>}</div></div>
              {opp.contract_type && <div><span className="text-[#94a3b8]">Contract Type</span><div className="text-[#0f172a] mt-0.5">{opp.contract_type}</div></div>}
              {opp.period_of_performance && <div><span className="text-[#94a3b8]">Period of Performance</span><div className="text-[#0f172a] mt-0.5">{opp.period_of_performance}</div></div>}
              <div><span className="text-[#94a3b8]">Posted</span><div className="text-[#0f172a] mt-0.5">{opp.posted_date ? new Date(opp.posted_date).toLocaleDateString() : <span className="text-[#94a3b8] italic">Unknown</span>}</div></div>
              <div><span className="text-[#94a3b8]">Source</span><div className="text-[#0f172a] mt-0.5">{sourceName}</div></div>
              {opp.incumbent_name && <div><span className="text-[#94a3b8]">Incumbent</span><div className="text-[#0f172a] mt-0.5">{opp.incumbent_name}</div></div>}
            </div>
          </div>

          {/* Full Description */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Description</h2>
            {(opp.full_description || opp.description) ? (
              <div className="text-[13px] text-[#475569] leading-relaxed whitespace-pre-wrap max-h-[600px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: (opp.full_description || opp.description).replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/on\w+="[^"]*"/gi, "") }} />
            ) : (
              <p className="text-[13px] text-[#94a3b8] italic">No description available. Check the solicitation documents or the original listing for details.</p>
            )}
          </div>

          {/* Contact Information */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Contact Information</h2>
            {(opp.contact_name || opp.contact_email || opp.contact_phone) ? (
              <div className="text-[13px] space-y-1">
                {opp.contact_name && <div className="text-[#0f172a] font-medium">{opp.contact_name}</div>}
                {opp.contact_email && <a href={`mailto:${opp.contact_email}`} className="text-[#2563eb] hover:text-[#1d4ed8] block">{opp.contact_email}</a>}
                {opp.contact_phone && <a href={`tel:${opp.contact_phone}`} className="text-[#2563eb] hover:text-[#1d4ed8] block">{opp.contact_phone}</a>}
              </div>
            ) : (
              <p className="text-[13px] text-[#94a3b8] italic">Contact information not available. Check the solicitation documents for contracting officer details.</p>
            )}
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="ci-card p-6">
              <h2 className="ci-section-label mb-4">Documents & Attachments</h2>
              <div className="space-y-2">
                {attachments.map((a: any, i: number) => {
                  const isPdf = (a.url || "").toLowerCase().endsWith(".pdf") || (a.name || "").toLowerCase().endsWith(".pdf");
                  const proxyUrl = `https://puppeteer-production-f147.up.railway.app/proxy-document?url=${encodeURIComponent(a.url)}`;
                  return (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-[#f1f5f9] hover:bg-[#f8fafc]">
                      <div className="flex items-center gap-2 text-[13px] min-w-0">
                        <svg className="w-4 h-4 shrink-0 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="text-[#0f172a] truncate">{a.name || "Document"}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isPdf && (
                          <a href={proxyUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#2563eb] hover:text-[#1d4ed8] font-medium">View</a>
                        )}
                        <a href={proxyUrl} target="_blank" rel="noopener noreferrer" download className="text-[11px] text-[#475569] hover:text-[#0f172a] font-medium">Download</a>
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#94a3b8] hover:text-[#475569]">Source</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Response Instructions */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Response Instructions</h2>
            {opp.response_instructions ? (
              <div className="text-[13px] text-[#475569] leading-relaxed whitespace-pre-wrap">{opp.response_instructions}</div>
            ) : (
              <p className="text-[13px] text-[#94a3b8] italic">Check the solicitation documents above for submission instructions, or contact the contracting officer.</p>
            )}
          </div>

          {/* Incumbent Info (for recompetes) */}
          {(opp.incumbent_name || isRecompete) && (
            <div className="ci-card p-6">
              <h2 className="ci-section-label mb-4">Incumbent Information</h2>
              {opp.incumbent_name ? (
                <div className="text-[13px] space-y-1">
                  <div className="text-[#0f172a] font-medium">{opp.incumbent_name}</div>
                  {opp.incumbent_value && <div className="text-[#475569]">Previous award: {formatCurrency(opp.incumbent_value)}</div>}
                </div>
              ) : (
                <p className="text-[13px] text-[#94a3b8] italic">Incumbent information not available. Check USASpending.gov for contract history.</p>
              )}
            </div>
          )}

          {/* Find This Contract fallback (when no valid direct URL) */}
          {!hasValidUrl && (
            <div className="ci-card p-6 border-l-4 border-l-[#d97706]">
              <h2 className="ci-section-label mb-4">Find This Contract</h2>
              <div className="text-[13px] text-[#475569] space-y-3">
                {opp.solicitation_number && (
                  <div><span className="text-[#94a3b8]">Solicitation #:</span> <span className="ci-mono font-medium text-[#0f172a] select-all">{opp.solicitation_number}</span></div>
                )}
                <div className="flex flex-wrap gap-2">
                  {sourceSearchUrls[opp.source] && (
                    <a href={sourceSearchUrls[opp.source]} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs border border-[#e2e8f0] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb] rounded-lg">Search on {sourceName}</a>
                  )}
                  <a href={`https://www.google.com/search?q=${encodeURIComponent((opp.solicitation_number || "") + " " + cleanTitle(opp.title))}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs border border-[#e2e8f0] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb] rounded-lg">Search Google</a>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Timeline</h2>
            <div className="text-[13px] space-y-2">
              {opp.posted_date && <div className="flex justify-between"><span className="text-[#94a3b8]">Posted</span><span className="text-[#0f172a]">{new Date(opp.posted_date).toLocaleDateString()}</span></div>}
              {opp.created_at && <div className="flex justify-between"><span className="text-[#94a3b8]">Scraped</span><span className="text-[#0f172a]">{new Date(opp.created_at).toLocaleDateString()}</span></div>}
              {opp.response_deadline && <div className="flex justify-between"><span className={`${deadlineColor} font-medium`}>Deadline</span><span className={`font-medium ${deadlineColor}`}>{new Date(opp.response_deadline).toLocaleDateString()}{days !== null ? ` (${days > 0 ? days + "d left" : "passed"})` : ""}</span></div>}
              {!opp.posted_date && !opp.response_deadline && <p className="text-[#94a3b8] italic">No date information available.</p>}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* AI Analysis */}
          {match && (
            <div className="ci-card p-5">
              <h2 className="ci-section-label mb-3">Match Analysis</h2>
              <div className="text-[13px] leading-relaxed">
                <div className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold mb-3 ${
                  match.match_score >= 80 ? "bg-[#ecfdf5] text-[#059669]" :
                  match.match_score >= 70 ? "bg-[#eff6ff] text-[#2563eb]" :
                  match.match_score >= 60 ? "bg-[#fffbeb] text-[#d97706]" :
                  "bg-[#f1f5f9] text-[#64748b]"
                }`}>
                  {match.match_score >= 80 ? "Strong Match" :
                   match.match_score >= 70 ? "Good Potential" :
                   match.match_score >= 60 ? "Partial Match" : "Weak Match"} — {match.match_score}/100
                </div>
                {match.recommendation_reasoning && (
                  <p className="text-[#475569] mb-3">{match.recommendation_reasoning}</p>
                )}
                <div className={`text-xs font-medium px-2 py-1 rounded ${
                  match.bid_recommendation === "bid" ? "bg-[#ecfdf5] text-[#059669]" :
                  match.bid_recommendation === "monitor" ? "bg-[#eff6ff] text-[#2563eb]" :
                  match.bid_recommendation === "recompete" ? "bg-[#fefce8] text-[#a16207]" :
                  "bg-[#f1f5f9] text-[#64748b]"
                }`}>
                  {match.bid_recommendation === "bid" ? "Recommended: Bid" :
                   match.bid_recommendation === "monitor" ? "Recommended: Monitor" :
                   match.bid_recommendation === "recompete" ? "Recompete Alert" :
                   "Low Priority"}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="ci-card p-5">
            <h2 className="ci-section-label mb-3">Notes</h2>
            {editingNote ? (
              <div className="space-y-2">
                <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4}
                  className="w-full px-3 py-2 text-[13px] border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-[#2563eb] resize-none" placeholder="Add notes about this contract..." autoFocus />
                <div className="flex gap-2">
                  <button onClick={saveNote} className="px-3 py-1 text-xs bg-[#2563eb] text-white rounded-lg ci-btn">Save</button>
                  <button onClick={() => setEditingNote(false)} className="text-xs text-[#94a3b8]">Cancel</button>
                </div>
              </div>
            ) : match?.user_notes ? (
              <div>
                <p className="text-[13px] text-[#475569] mb-2">{match.user_notes}</p>
                <button onClick={() => setEditingNote(true)} className="text-xs text-[#2563eb]">Edit note</button>
              </div>
            ) : (
              <button onClick={() => setEditingNote(true)} className="text-[13px] text-[#94a3b8] hover:text-[#475569] italic">Add a note...</button>
            )}
          </div>

          {/* Related Opportunities */}
          {related.length > 0 && (
            <div className="ci-card p-5">
              <h2 className="ci-section-label mb-3">Similar Opportunities</h2>
              <div className="space-y-2">
                {related.map((r) => (
                  <Link key={r.id} href={`/dashboard/opportunity/${r.id}`} className="block text-[13px] text-[#475569] hover:text-[#0f172a] py-1.5 border-b border-[#f1f5f9] last:border-0">
                    <div className="font-medium truncate">{cleanTitle(r.title)}</div>
                    <div className="text-[11px] text-[#94a3b8]">{r.agency}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Verification status */}
          {opp.last_verified_at && (
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  (Date.now() - new Date(opp.last_verified_at).getTime()) < 3 * 86400000 ? "bg-[#22c55e]" : "bg-[#f59e0b]"
                }`} />
                Verified active {(() => {
                  const h = Math.floor((Date.now() - new Date(opp.last_verified_at).getTime()) / 3600000);
                  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
                })()}
              </div>
            </div>
          )}

          {/* Original source link (secondary) */}
          {(opp.sam_url || opp.source_url) && (
            <a href={opp.sam_url || opp.source_url} target="_blank" rel="noopener noreferrer"
              className="block text-[12px] text-[#94a3b8] hover:text-[#475569] text-center">
              View original listing on source website &rarr;
            </a>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-[100] px-4 py-3 bg-white rounded-xl shadow-lg border border-[#e2e8f0] text-sm font-medium text-[#0f172a]" style={{ animation: "slideInRight 0.3s ease" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

```

### Sections (top to bottom):
1. Back link
2. Header
3. Main content
4. Key Details
5. Full Description
6. Contact Information
7. Attachments
8. Response Instructions
9. Incumbent Info (for recompetes)
10. Find This Contract fallback (when no valid direct URL)
11. Timeline
12. Right sidebar
13. AI Analysis
14. Notes
15. Related Opportunities
16. Verification status
17. Original source link (secondary)
18. Toast

### Custom CSS Classes (ci-* design system):
- `ci-btn`
- `ci-card`
- `ci-mono`
- `ci-section-label`
- `ci-serif`

### Buttons/Actions:
- Button: "updateStatus("tracking")} className="px-4 py-1.5 text-xs border border-[#e2e8f0]"
- Button: "updateStatus("bidding")} className="px-4 py-1.5 text-xs bg-[#2563eb] text-white "
- Button: "updateStatus("skipped")} className="px-4 py-1.5 text-xs text-[#94a3b8] hover:tex"
- Button: "Save"
- Button: "setEditingNote(false)} className="text-xs text-[#94a3b8]">Cancel"
- Button: "setEditingNote(true)} className="text-xs text-[#2563eb]">Edit note"
- Button: "setEditingNote(true)} className="text-[13px] text-[#94a3b8] hover:text-[#475569]"
- Link to /dashboard: "&larr; Back to matches"

### Known Issues:
- Uses TypeScript 'any' type — weak typing

---

## PAGE: Global Styles
### File: app/globals.css
### Lines: 189

### Full Code:
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ═══════════════════════════════════════════════════════════
   CONTRACTSINTEL DESIGN SYSTEM — Fortune 500 SaaS Quality
   Inspired by: Stripe, Linear, Notion, Apollo, Databox
   ═══════════════════════════════════════════════════════════ */

:root {
  --ci-bg: #f8fafc;
  --ci-surface: #ffffff;
  --ci-border: #e2e8f0;
  --ci-border-light: #f1f5f9;
  --ci-border-hover: #cbd5e1;
  --ci-text: #0f172a;
  --ci-text-secondary: #475569;
  --ci-text-muted: #94a3b8;
  --ci-text-body: #64748b;
  --ci-accent: #2563eb;
  --ci-accent-hover: #1d4ed8;
  --ci-green: #059669;
  --ci-red: #dc2626;
  --ci-amber: #d97706;
  --ci-purple: #7c3aed;
}

body {
  color: var(--ci-text);
  background: var(--ci-bg);
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Typography Classes ───────────────────────────────────── */

.ci-page-title {
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--ci-text);
}

.ci-accent-line {
  width: 40px;
  height: 2px;
  border-radius: 1px;
  margin-top: 8px;
  margin-bottom: 20px;
}

.ci-stat-number {
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: 36px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ci-text);
}

.ci-stat-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ci-text-muted);
}

.ci-section-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ci-text-muted);
}

.ci-mono {
  font-family: 'JetBrains Mono', monospace;
}

.ci-serif {
  font-family: 'DM Serif Display', Georgia, serif;
}

/* ── Card System ──────────────────────────────────────────── */

.ci-card {
  background: var(--ci-surface);
  border: 1px solid var(--ci-border);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03);
  transition: all 0.15s ease;
}

.ci-card:hover,
.ci-card-hover:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  border-color: var(--ci-border-hover);
  transform: translateY(-1px);
}

/* ── Score Ring ───────────────────────────────────────────── */

.ci-score-ring {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: 18px;
  font-weight: 400;
  border: 2px solid var(--ci-border);
  background: transparent;
  flex-shrink: 0;
}

/* ── Buttons ──────────────────────────────────────────────── */

.ci-btn {
  transition: all 0.15s ease;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.ci-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.ci-btn:active {
  transform: translateY(0);
}

/* ── Sidebar ──────────────────────────────────────────────── */

.ci-sidebar-bg {
  background: #fafbfd;
}

/* ── Scrollbar ────────────────────────────────────────────── */

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }

/* ── Animations ───────────────────────────────────────────── */

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(100%); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes shrinkBar {
  from { width: 100%; }
  to { width: 0%; }
}

@keyframes shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.ci-shimmer { animation: shimmer 3s ease infinite; }

@keyframes help-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0.3); }
  50% { box-shadow: 0 0 0 6px rgba(37,99,235,0); }
}
.ci-help-pulse { animation: help-pulse 1s ease 2; }

/* ── Global Hover Polish ──────────────────────────────────── */

button, a { transition: all 0.15s ease; }

@layer utilities {
  .text-balance { text-wrap: balance; }
}

```

### Sections (top to bottom):
(No JSX comment sections found)

### Custom CSS Classes (ci-* design system):
(No ci-* classes used)

### Buttons/Actions:
(No buttons found)

### Known Issues:
- None detected

---

## PAGE: Root Layout
### File: app/layout.tsx
### Lines: 21

### Full Code:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ContractsIntel — Find, Win, and Manage Government Contracts",
  description: "AI-powered government contract intelligence. Find, score, and win federal contracts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-['DM_Sans']">
        {children}
      </body>
    </html>
  );
}

```

### Sections (top to bottom):
(No JSX comment sections found)

### Custom CSS Classes (ci-* design system):
(No ci-* classes used)

### Buttons/Actions:
(No buttons found)

### Known Issues:
- None detected

---

