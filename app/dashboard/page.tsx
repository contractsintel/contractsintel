"use client";

import { useDashboard } from "./context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HelpButton } from "./help-panel";
import { DemoBanner } from "./demo-banner";
import { InlineGuide } from "./inline-guide";
import { seedDemoData } from "@/lib/demo-data";
import { UnlockButton, ProfileBanner } from "./unlock-panel";
import { ReadinessScore } from "./readiness-score";

function cleanTitle(s: string): string {
  // Remove bracket prefixes and "Recompete: " prefix
  return decodeHtml(s.replace(/^\[[^\]]*\]\s*/, "").replace(/^Recompete:\s*/i, ""));
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
  if (!n || n <= 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
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
  if (d === null) return "No deadline";
  if (d < 0) return "Expired";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `${d}d left`;
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-[#22c55e]";  // Strong Match
  if (score >= 55) return "text-[#3b82f6]";  // Good Match
  if (score >= 40) return "text-[#f59e0b]";  // Worth a Look
  return "text-[#94a3b8]";
}

function scoreTier(score: number): string {
  if (score >= 75) return "Strong Match";
  if (score >= 55) return "Good Match";
  if (score >= 40) return "Worth a Look";
  return "";
}

function recBadge(rec: string) {
  const map: Record<string, string> = {
    bid: "bg-[#ecfdf5] text-[#059669]",
    monitor: "bg-[#fffbeb] text-[#d97706]",
    review: "bg-[#f1f5f9] text-[#64748b]",
    skip: "bg-[#f1f5f9] text-[#94a3b8]",
    recompete: "bg-[#fef2f2] text-[#dc2626]",
    recompete_alert: "bg-[#fef2f2] text-[#dc2626]",
  };
  return map[rec] ?? map.skip;
}

type SortOption = "recommended" | "score" | "deadline" | "value" | "newest";
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
  if (bidRec === "recompete_alert" || bidRec === "recompete") return "recompetes";
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
    federal: { bg: "bg-[rgba(37,99,235,0.12)]", text: "text-[#2563eb]", label: "Federal" },
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
  const router = useRouter();

  // Redirect to onboarding if not complete — use window.location for full reload
  useEffect(() => {
    if (organization.onboarding_complete === false) {
      window.location.href = "/dashboard/onboarding";
    }
  }, [organization.onboarding_complete]);

  const PAGE_SIZE = 50;
  const profileIncomplete = !organization.naics_codes?.length || !organization.certifications?.length;
  const [matches, setMatches] = useState<Record<string, any>[]>([]);
  const [totalMatchCount, setTotalMatchCount] = useState(0);
  const [matchLimit, setMatchLimit] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    setAside: "",
    agency: "",
    minScore: 0,
    sort: "recommended",
    source: "",
    urgency: "",
    valueRange: "",
    recommendation: "",
  });
  const [complianceAlerts, setComplianceAlerts] = useState<Record<string, any>[]>([]);
  const [highSeverityAlerts, setHighSeverityAlerts] = useState<Record<string, any>[]>([]);
  const [upcomingComplianceDeadlines, setUpcomingComplianceDeadlines] = useState<Record<string, any>[]>([]);
  const [stripDismissed, setStripDismissed] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [dbSourceCounts, setDbSourceCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(organization.has_seen_dashboard !== true);
  const [showFilters, setShowFilters] = useState(false);

  // If the user picked "show only matching set-asides" in onboarding, default
  // the recommendation filter to "bid" so they only see strong-fit opportunities.
  useEffect(() => {
    const pref = (organization.address as Record<string, any> | null)?.set_aside_preference;
    if (pref === "matching") {
      setFilters(f => f.recommendation ? f : { ...f, recommendation: "bid" });
    }
  }, [organization.address]);

  const loadData = useCallback(async () => {
    setLoading(true);
    // PERF: Fetch matches with only the columns needed for display.
    const OPP_COLS = "id,title,agency,naics_code,set_aside_type,estimated_value,value_estimate,response_deadline,posted_date,source,notice_type,contract_type,incumbent_name,incumbent_value,source_url,solicitation_number,place_of_performance";
    const SELECT_COLS = `id, opportunity_id, match_score, bid_recommendation, user_status, pipeline_stage, is_demo, created_at, opportunities(${OPP_COLS})`;

    const now = new Date().toISOString();
    const filterActive = (data: any[]) =>
      data.filter((m: Record<string, any>) => {
        const dl = m.opportunities?.response_deadline;
        if (!dl) return true;
        if (m.bid_recommendation === "recompete") return true;
        return dl >= now;
      });

    // PERF: Fetch first page (1000 rows) immediately so the UI renders fast.
    // Then background-fetch remaining pages without blocking the render.
    const { data: firstPage, error: pgErr } = await supabase
      .from("opportunity_matches")
      .select(SELECT_COLS, { count: "estimated" })
      .eq("organization_id", organization.id)
      .order("match_score", { ascending: false })
      .range(0, 999);
    if (pgErr) { console.error("[dashboard] query error", pgErr.message); }
    const firstActive = filterActive(firstPage ?? []);
    setMatches(firstActive);
    setTotalMatchCount(firstActive.length);

    // Compute source counts from the first page
    const counts: Record<string, number> = {};
    for (const m of firstActive) {
      const src = (m as Record<string, any>).opportunities?.source;
      const cat = getSourceCategory(src, (m as Record<string, any>).bid_recommendation);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    setDbSourceCounts(counts);

    // PERF: run compliance queries in parallel with the rest
    const in7Days = new Date(Date.now() + 7 * 86400000).toISOString();
    const in30Days = new Date(Date.now() + 30 * 86400000).toISOString();
    const [complianceRes, highSevRes, upcomingRes] = await Promise.all([
      supabase
        .from("compliance_items")
        .select("id, title, due_date, category")
        .eq("organization_id", organization.id)
        .lte("due_date", in7Days)
        .eq("status", "pending")
        .limit(5),
      supabase
        .from("compliance_items")
        .select("id, title, due_date, severity, category")
        .eq("organization_id", organization.id)
        .eq("severity", "high")
        .lte("due_date", in30Days)
        .neq("status", "complete")
        .neq("status", "passed")
        .order("due_date", { ascending: true })
        .limit(5),
      supabase
        .from("compliance_items")
        .select("id, title, due_date, category")
        .eq("organization_id", organization.id)
        .neq("status", "complete")
        .neq("status", "passed")
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(3),
    ]);
    setComplianceAlerts(complianceRes.data ?? []);
    setHighSeverityAlerts(highSevRes.data ?? []);
    setUpcomingComplianceDeadlines(upcomingRes.data ?? []);

    setLoading(false);

    // PERF: Background-fetch remaining pages AFTER first render.
    // The user sees top matches instantly; rest streams in behind the scenes.
    const totalRows = (firstPage as any)?.length ?? 0;
    if (totalRows === 1000) {
      // There might be more pages — fetch them in background
      let bgOffset = 1000;
      let bgHasMore = true;
      let bgAll = [...firstActive];
      while (bgHasMore) {
        const { data: bgPage, error: bgErr } = await supabase
          .from("opportunity_matches")
          .select(SELECT_COLS)
          .eq("organization_id", organization.id)
          .order("match_score", { ascending: false })
          .range(bgOffset, bgOffset + 999);
        if (bgErr || !bgPage?.length) break;
        const bgActive = filterActive(bgPage);
        bgAll = bgAll.concat(bgActive);
        bgHasMore = bgPage.length === 1000;
        bgOffset += 1000;
      }
      if (bgAll.length > firstActive.length) {
        setMatches(bgAll);
        setTotalMatchCount(bgAll.length);
        // Update source counts with full data
        const fullCounts: Record<string, number> = {};
        for (const m of bgAll) {
          const src = (m as Record<string, any>).opportunities?.source;
          const cat = getSourceCategory(src, (m as Record<string, any>).bid_recommendation);
          fullCounts[cat] = (fullCounts[cat] ?? 0) + 1;
        }
        setDbSourceCounts(fullCounts);
      }
    }
  }, [organization.id, supabase]);

  // Restore session-level dismiss for the high-severity strip
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = sessionStorage.getItem("ci_high_sev_strip_dismissed");
    if (dismissed === "true") setStripDismissed(true);
  }, []);

  const dismissHighSevStrip = () => {
    setStripDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("ci_high_sev_strip_dismissed", "true");
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset pagination when filters change
  useEffect(() => {
    setMatchLimit(PAGE_SIZE);
  }, [filters.source, filters.setAside, filters.agency, filters.minScore, filters.urgency, filters.valueRange, filters.recommendation]);

  const handleLoadMore = () => {
    setMatchLimit(prev => prev + PAGE_SIZE);
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
        // Find the opportunity_id for the proposals link
        const m = matches.find((x) => x.id === matchId);
        const oppId = m?.opportunity_id || "";
        showToast("Preparing Bid — Added to Pipeline", "#2563eb", `/dashboard/proposals?opportunity_id=${oppId}`, "Generate AI Proposal →");
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
      recompete: "Recompete Alert — This contract is expiring and will be re-competed.",
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

  const getVal = (opp: Record<string, any> | null) => {
    if (!opp) return 0;
    // B2: widen search across all possible value fields from different scrapers
    const candidates = [
      opp.estimated_value,
      opp.value_estimate,
      opp.award_amount,
      opp.total_award_amount,
      opp.base_and_all_options_value,
      opp.base_and_exercised_options_value,
      opp.current_total_value,
      opp.potential_total_value,
      opp.max_award_value,
      opp.contract_value,
    ];
    for (const v of candidates) {
      const n = typeof v === "string" ? parseFloat(v) : v;
      if (typeof n === "number" && !isNaN(n) && n > 0) return n;
    }
    return 0;
  };

  // PERF: Memoize filter+sort — only recompute when matches or filters change,
  // not on every render (saves O(n log n) sort on 3000+ items).
  const filtered = useMemo(() => matches
    .filter((m) => {
      const opp = m.opportunities;
      if (!opp) return false;
      // Hide expired and paused contracts from main feed
      if (opp.status === "expired" || opp.status === "paused") return false;
      if (filters.setAside && (opp.set_aside_type || opp.set_aside_description) !== filters.setAside) return false;
      if (filters.agency && opp.agency !== filters.agency) return false;
      if (m.match_score < filters.minScore) return false;
      if (filters.source) {
        const cat = getSourceCategory(opp.source, m.bid_recommendation);
        if (cat !== filters.source) return false;
      }
      // Urgency filter — only show contracts with a known deadline in range.
      // Contracts with no deadline are excluded (user wants time-specific results).
      if (filters.urgency) {
        const d = daysUntil(opp.response_deadline);
        if (d === null || d < 0) return false;
        if (filters.urgency === "week" && d > 7) return false;
        if (filters.urgency === "2weeks" && d > 14) return false;
        if (filters.urgency === "month" && d > 30) return false;
      }
      // Value filter — only show contracts with a known value in the selected range.
      // Contracts with no disclosed value are excluded when filtering by value.
      if (filters.valueRange) {
        const v = getVal(opp);
        if (v <= 0) return false; // Exclude undisclosed when filtering by value
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
      if (filters.sort === "recommended") {
        // Base = match_score (0-100), then add bonus points for actionability:
        //   +5 if contract value is known (revenue intel)
        //   +3/+2/+1 for urgency tiers (≤7d / ≤14d / ≤30d)
        // Capped at 100 so the score ring never exceeds the natural range.
        const bonusA = (getVal(a.opportunities) > 0 ? 5 : 0)
          + ((() => { const d = daysUntil(a.opportunities?.response_deadline); return d !== null && d >= 0 ? (d <= 7 ? 3 : d <= 14 ? 2 : d <= 30 ? 1 : 0) : 0; })());
        const bonusB = (getVal(b.opportunities) > 0 ? 5 : 0)
          + ((() => { const d = daysUntil(b.opportunities?.response_deadline); return d !== null && d >= 0 ? (d <= 7 ? 3 : d <= 14 ? 2 : d <= 30 ? 1 : 0) : 0; })());
        const compA = Math.min(100, (a.match_score ?? 0) + bonusA);
        const compB = Math.min(100, (b.match_score ?? 0) + bonusB);
        return compB - compA;
      }
      if (filters.sort === "score") return (b.match_score ?? 0) - (a.match_score ?? 0);
      if (filters.sort === "value") {
        const va = getVal(a.opportunities);
        const vb = getVal(b.opportunities);
        // Push unknowns (0) to the bottom, sort known values descending
        if (va === 0 && vb === 0) return 0;
        if (va === 0) return 1;
        if (vb === 0) return -1;
        return vb - va;
      }
      if (filters.sort === "newest") return new Date(b.opportunities?.posted_date ?? 0).getTime() - new Date(a.opportunities?.posted_date ?? 0).getTime();
      if (filters.sort === "deadline") {
        const da = daysUntil(a.opportunities?.response_deadline) ?? 999;
        const db = daysUntil(b.opportunities?.response_deadline) ?? 999;
        return da - db;
      }
      return 0;
    }), [matches, filters]);

  const hasActiveFilter = !!(filters.source || filters.urgency || filters.valueRange || filters.agency || filters.setAside || filters.recommendation || filters.minScore > 0);

  // PERF: Memoize all derived data so it only recomputes when matches change.
  const recCounts = useMemo(() => matches.reduce(
    (acc, m) => {
      const rec = m.bid_recommendation || "skip";
      acc[rec] = (acc[rec] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ), [matches]);

  // Stats — computed from the FILTERED list so they update when filters change
  const { totalValue, urgentCount, topScore } = useMemo(() => {
    let tv = 0;
    let uc = 0;
    let ts = 0;
    for (const m of filtered) {
      tv += getVal(m.opportunities);
      const d = daysUntil(m.opportunities?.response_deadline);
      if (d !== null && d >= 0 && d <= 7) uc++;
      const s = m.match_score ?? 0;
      if (s > ts) ts = s;
    }
    return { totalValue: tv, urgentCount: uc, topScore: ts };
  }, [filtered]);

  // Pipeline summary
  const pipelineCounts = useMemo(() => matches.reduce(
    (acc, m) => {
      const stageMap: Record<string, string> = { tracking: "monitoring", bidding: "preparing_bid", new: "new", skipped: "skipped" };
      const stage = m.pipeline_stage ?? stageMap[m.user_status ?? "new"] ?? (m.user_status ?? "new");
      acc[stage] = (acc[stage] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ), [matches]);

  // Source breakdown counts
  const pageCounts = useMemo(() => matches.reduce(
    (acc, m) => {
      const cat = getSourceCategory(m.opportunities?.source, m.bid_recommendation);
      acc[cat] = (acc[cat] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ), [matches]);
  const sourceCounts = Object.keys(dbSourceCounts).length > 0 ? dbSourceCounts : pageCounts;

  // Unique filters
  const setAsides = useMemo(() => Array.from(new Set(matches.map((m) => m.opportunities?.set_aside_type || m.opportunities?.set_aside_description).filter(Boolean))), [matches]);

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
            <h1 className="text-[22px] font-medium text-[#0f172a] tracking-[-0.01em]"
                style={{fontFamily: "'DM Sans', sans-serif"}}>
              {greeting}, {displayName}
            </h1>
            <p className="text-[13px] text-[#64748b] mt-0.5">
              {today} · {totalMatchCount > 0
                ? `${totalMatchCount.toLocaleString()} opportunities matched`
                : "Your first digest arrives tomorrow at 7am"}
            </p>
          </div>
          <button onClick={async () => {
            setRefreshing(true);
            try {
              const res = await fetch("/api/matching/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: organization.id }) });
              const data = await res.json().catch(() => null);
              if (res.ok && data?.success) {
                showToast(`Matched ${data.matched ?? 0} opportunities · top score ${data.topScore ?? 0}`, "#059669");
                await loadData();
                setRefreshing(false);
              } else {
                showToast(data?.error || "Matching failed — try again", "#dc2626");
                setRefreshing(false);
              }
            } catch (err: unknown) {
              showToast(err instanceof Error ? err.message : "Network error", "#dc2626");
              setRefreshing(false);
            }
          }}
            disabled={refreshing}
            className={`text-[12px] font-medium px-3 py-1.5 border rounded-lg transition-colors ${
              refreshing ? "text-[#94a3b8] border-[#e5e7eb] cursor-wait" : "text-[#4f46e5] hover:text-[#4338ca] border-[#e5e7eb] hover:border-[#c7d2fe]"
            }`}>
            {refreshing ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
                Matching...
              </span>
            ) : "↻ Refresh Matches"}
          </button>
        </div>
      </div>
      {/* Personalized welcome banner — shows once after onboarding */}
      {showWelcome && totalMatchCount > 0 && (
        <div className="mb-6 p-5 bg-[#ffffff] border border-[#e5e7eb] flex items-center justify-between"
             style={{animation: "fadeInUp 0.4s ease both"}}>
          <div>
            <h2 className="text-[16px] font-semibold text-[#0f172a]">
              Your personalized matches are ready
            </h2>
            <p className="text-[14px] text-[#64748b] mt-1">
              We scored {totalMatchCount.toLocaleString()} contracts based on your {(organization.certifications || []).join(", ")} certification{(organization.certifications || []).length > 1 ? "s" : ""} and NAICS codes. Your best matches are at the top.
            </p>
          </div>
          <button onClick={async () => {
            setShowWelcome(false);
            await supabase.from("organizations").update({ has_seen_dashboard: true }).eq("id", organization.id);
          }} className="text-[13px] text-[#64748b] hover:text-[#0f172a] shrink-0 ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Profile Completion Banner */}
      <ProfileBanner />

      {/* GovCon Readiness Score */}
      <div className="mb-6">
        <ReadinessScore compact />
      </div>

      {/* Demo Banner */}
      {matches.some((m) => m.is_demo) && <DemoBanner />}

      {/* Stats Bar — KPI Row (D1: always show 4th Total Value card) */}
      <div data-tour="stats-bar" className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {[
          {value: String(recCounts.bid ?? 0), label: "Bid-Ready", urgent: false },
          { value: totalValue > 0 ? formatCurrency(totalValue) : "—", label: "Pipeline Value", urgent: false },
          { value: String(filtered.filter(m => { const d = daysUntil(m.opportunities?.response_deadline); return d !== null && d >= 0 && d <= 14; }).length), label: "Closing < 14d", urgent: filtered.some(m => { const d = daysUntil(m.opportunities?.response_deadline); return d !== null && d >= 0 && d <= 14; }) },
          { value: String(sourceCounts.recompetes ?? 0), label: "Recompetes", urgent: false },
        ].map((stat) => (
          <div key={stat.label} className={`p-5 bg-[#ffffff] border border-[#e5e7eb] ${stat.urgent ? "border-l-[3px] border-l-[#ef4444]" : ""}`}>
            <div className="ci-serif text-[28px] text-[#0f172a]">{stat.value}</div>
            <div className="ci-stat-label mt-2">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* D2: ComplianceAlertStrip — only one strip (removed the legacy duplicate) */}
      {!stripDismissed && highSeverityAlerts.length > 0 && (
        <div className="border border-[#e5e7eb] border-l-4 border-l-[#f59e0b] bg-[#ffffff] p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-[#f59e0b] shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-[#f59e0b]">
                {highSeverityAlerts.length} high-severity compliance item{highSeverityAlerts.length > 1 ? "s" : ""} due within 30 days
              </span>
            </div>
            <p className="text-xs text-[#64748b] truncate">
              {highSeverityAlerts.map((a) => a.title).join(" · ")}
            </p>
          </div>
          <Link
            href="/dashboard/compliance"
            className="text-xs font-medium text-[#f59e0b] hover:text-[#d97706] whitespace-nowrap shrink-0"
          >
            Fix Now →
          </Link>
          <button
            onClick={dismissHighSevStrip}
            aria-label="Dismiss"
            className="text-[#94a3b8] hover:text-[#64748b] shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main Column */}
        <div className="min-w-0 w-full">
          {/* D3: Horizontal filter bar — always visible, single row of compact controls */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <select value={filters.source}
              onChange={(e) => setFilters((f) => ({...f, source: e.target.value as SourceFilter}))}
              className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-[#ffffff] text-[#0f172a] focus:outline-none focus:border-[#2563eb]">
              <option value="">All Types ({matches.length})</option>
              <option value="federal">Federal ({sourceCounts.federal ?? 0})</option>
              <option value="military">Military / Defense ({sourceCounts.military ?? 0})</option>
              <option value="state">State &amp; Local ({sourceCounts.state ?? 0})</option>
              <option value="sbir">SBIR / STTR ({sourceCounts.sbir ?? 0})</option>
              <option value="grants">Grants ({sourceCounts.grants ?? 0})</option>
              <option value="subcontracting">Subcontracting ({sourceCounts.subcontracting ?? 0})</option>
              <option value="recompetes">Recompete Alerts ({sourceCounts.recompetes ?? 0})</option>
            </select>
            <select value={filters.urgency}
              onChange={(e) => setFilters((f) => ({...f, urgency: e.target.value as UrgencyFilter}))}
              className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-[#ffffff] text-[#0f172a] focus:outline-none focus:border-[#2563eb]">
              <option value="">Any Deadline</option>
              <option value="week">This Week</option>
              <option value="2weeks">Next 2 Weeks</option>
              <option value="month">This Month</option>
            </select>
            <select value={filters.valueRange}
              onChange={(e) => setFilters((f) => ({...f, valueRange: e.target.value as ValueFilter}))}
              className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-[#ffffff] text-[#0f172a] focus:outline-none focus:border-[#2563eb]">
              <option value="">Any Value</option>
              <option value="under100k">&lt;$100K</option>
              <option value="100k-500k">$100K–$500K</option>
              <option value="500k-1m">$500K–$1M</option>
              <option value="over1m">&gt;$1M</option>
            </select>
            <select value={filters.sort}
              onChange={(e) => setFilters((f) => ({...f, sort: e.target.value as SortOption}))}
              className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-[#ffffff] text-[#0f172a] focus:outline-none focus:border-[#2563eb]">
              <option value="recommended">Recommended</option>
              <option value="score">Best Match</option>
              <option value="deadline">Deadline</option>
              <option value="value">Value</option>
              <option value="newest">Newest</option>
            </select>
            <select
              value={filters.agency}
              onChange={(e) => setFilters((f) => ({...f, agency: e.target.value}))}
              className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-[#ffffff] text-[#0f172a] focus:outline-none focus:border-[#2563eb]">
              <option value="">All agencies</option>
              {Array.from(new Set(matches.map(m => m.opportunities?.agency).filter(Boolean))).sort().map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {(filters.source || filters.urgency || filters.valueRange || filters.agency) && (
              <button onClick={() => setFilters({setAside:"",agency:"",minScore:0,sort:"recommended",source:"",urgency:"",valueRange:"",recommendation:""})}
                className="text-[13px] text-[#2563eb] hover:text-[#1d4ed8] font-medium">
                Clear
              </button>
            )}
          </div>

          {/* Opportunity Cards */}
          {loading ? (
            <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-[#e5e7eb]">
                  <div className="w-12 h-12 rounded-full bg-[#f1f5f9] animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/5 bg-[#f1f5f9] rounded animate-pulse" />
                    <div className="h-3 w-2/5 bg-[#f1f5f9] rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-16 bg-[#f1f5f9] rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 && totalMatchCount === 0 ? (
            /* ── Empty state welcome card — only when truly no matches ── */
            <div className="border border-[#e5e7eb] bg-white rounded-xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-[#0f172a] mb-2">
                  Your first digest arrives tomorrow at 7am
                </h2>
                <p className="text-sm text-[#64748b] max-w-lg mx-auto">
                  Every night we scan official federal procurement databases and match opportunities to your certifications. Your first ranked digest will be here by morning.
                </p>
              </div>

              {/* Sample opportunity mockup */}
              <div className="border border-dashed border-[#e5e7eb] bg-[#f8f9fb] rounded-lg p-5 max-w-xl mx-auto mb-8">
                <div className="text-[10px] text-[#94a3b8] font-medium uppercase tracking-wide mb-3">
                  Example
                </div>
                <div className="flex items-start gap-4">
                  <div className="text-3xl font-bold font-mono text-[#22c55e] w-14 text-center shrink-0">
                    94
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-[#0f172a]">
                        DoD IT Support Services — Fort Belvoir, VA
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-mono uppercase border shrink-0 bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20">
                        bid
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#64748b]">
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
                <h3 className="text-xs font-medium uppercase tracking-wide text-[#94a3b8] mb-4 text-center">
                  While you wait
                </h3>
                <div className="grid grid-cols-1 max-w-md mx-auto gap-3">
                  {/* Card 1: Complete profile */}
                  <Link
                    href="/dashboard/settings"
                    className="border border-[#e5e7eb] rounded-xl p-5 hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-[#94a3b8] group-hover:text-[#2563eb] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-sm font-semibold text-[#0f172a]">Complete your profile</span>
                    </div>
                    <p className="text-xs text-[#64748b]">
                      Add your UEI, certifications, and NAICS codes
                    </p>
                  </Link>

                  {/* Card 2: Connect Calendar */}
                  <Link
                    href="/dashboard/settings"
                    className="border border-[#e5e7eb] rounded-xl p-5 hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-[#94a3b8] group-hover:text-[#2563eb] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-semibold text-[#0f172a]">Connect Google Calendar</span>
                    </div>
                    <p className="text-xs text-[#64748b]">
                      Get deadline reminders on your phone
                    </p>
                  </Link>

                  {/* Card 3: Explore with sample data */}
                  <button
                    onClick={handleSeedDemo}
                    disabled={seedingDemo}
                    className="border border-[#e5e7eb] rounded-xl p-5 hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200 group text-left disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-[#94a3b8] group-hover:text-[#2563eb] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-semibold text-[#0f172a]">
                        {seedingDemo ? "Loading..." : "Explore with sample data"}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748b]">
                      See how the dashboard looks with real data
                    </p>
                  </button>
                </div>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="border border-[#e5e7eb] bg-white rounded-xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[#94a3b8]">No matches for current filters. Try adjusting your filters above.</p>
            </div>
          ) : (
            <div>
              {/* Match count */}
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[12px] text-[#94a3b8]">
                  Showing {Math.min(matchLimit, filtered.length)} of {filtered.length.toLocaleString()} matches
                </span>
              </div>
              <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
              {filtered.slice(0, matchLimit).map((match) => {
                const opp = match.opportunities;
                if (!opp) return null;
                const days = daysUntil(opp.response_deadline);
                const deadlineColor =
                  days !== null && days <= 3 ? "text-[#ef4444]"
                    : days !== null && days <= 7 ? "text-[#f59e0b]"
                    : "text-[#64748b]";
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
                      className={`flex items-center gap-4 px-4 py-3.5 border-b border-[#e5e7eb] cursor-pointer
                                  transition-colors hover:bg-[#f8f9fb] group
                                  ${match.bid_recommendation === "bid" ? "border-l-[3px] border-l-[#059669]" :
                                    match.bid_recommendation === "recompete_alert" || match.bid_recommendation === "recompete" ? "border-l-[3px] border-l-[#dc2626]" : ""}`}
                      onClick={() => setExpandedCard(isExpanded ? null : match.id)}
                    >
                      {/* Score ring — show composite when Recommended sort active */}
                      {(() => {
                        const raw = match.match_score ?? 0;
                        let displayScore = raw;
                        if (filters.sort === "recommended") {
                          const bonus = (getVal(opp) > 0 ? 5 : 0)
                            + ((() => { const d = daysUntil(opp.response_deadline); return d !== null && d >= 0 ? (d <= 7 ? 3 : d <= 14 ? 2 : d <= 30 ? 1 : 0) : 0; })());
                          displayScore = Math.min(100, raw + bonus);
                        }
                        return (
                          <div className={`ci-score-ring ${
                            displayScore >= 80 ? "border-[#059669] text-[#059669]" :
                            displayScore >= 60 ? "border-[#2563eb] text-[#2563eb]" :
                            displayScore >= 40 ? "border-[#d97706] text-[#d97706]" :
                            "border-[#9ca3af] text-[#94a3b8]"}`}>
                            {displayScore}
                          </div>
                        );
                      })()}

                      {/* Title + Agency — clickable to opportunity detail */}
                      <Link
                        href={`/dashboard/opportunity/${opp.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 group/title"
                      >
                        <h3 className="text-[14px] font-semibold text-[#0f172a] truncate group-hover/title:text-[#3b82f6] transition-colors">{cleanTitle(opp.title)}</h3>
                        <p className="text-[12px] text-[#64748b] mt-0.5 truncate">{opp.agency}</p>
                        {opp.incumbent_name && <p className="text-[11px] text-[#d97706] mt-0.5 truncate">⚔ Incumbent: {opp.incumbent_name}</p>}
                      </Link>

                      {/* Value */}
                      <div className="w-[88px] text-right shrink-0 leading-none">
                        <div className="text-[9px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Value</div>
                        <div className="text-[13px] font-semibold font-mono">
                          {getVal(opp) > 0
                            ? <span className="text-[#0f172a]">{formatCurrency(getVal(opp))}</span>
                            : <span className="text-[#cbd5e1] text-[12px]">Value TBD</span>}
                        </div>
                      </div>

                      {/* Deadline */}
                      <div className="w-[60px] text-right shrink-0 leading-none">
                        <div className="text-[9px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Due</div>
                        <div className={`text-[12px] font-mono ${deadlineColor}`}>
                          {deadlineLabel(opp.response_deadline)}
                        </div>
                      </div>

                      {/* Recommendation badge */}
                      <span className={`px-2 py-1 text-[10px] font-semibold uppercase rounded shrink-0 ${recBadge(match.bid_recommendation)}`}>
                        {match.bid_recommendation}
                      </span>

                      {/* D4: BID / MONITOR / SKIP action buttons — always visible */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(match.id, "bidding"); }}
                          className={`h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider border transition-colors ${
                            match.user_status === "bidding"
                              ? "bg-[#2563eb] text-white border-[#2563eb]"
                              : "bg-[#ffffff] text-[#64748b] border-[#e5e7eb] hover:border-[#2563eb] hover:text-[#2563eb]"
                          }`}
                        >
                          Bid
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(match.id, "tracking"); }}
                          className={`h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider border transition-colors ${
                            match.user_status === "tracking"
                              ? "bg-[#22c55e] text-white border-[#22c55e]"
                              : "bg-[#ffffff] text-[#64748b] border-[#e5e7eb] hover:border-[#22c55e] hover:text-[#22c55e]"
                          }`}
                        >
                          Monitor
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(match.id, "skipped"); }}
                          className={`h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider border transition-colors ${
                            match.user_status === "skipped"
                              ? "bg-[#94a3b8] text-white border-[#94a3b8]"
                              : "bg-[#ffffff] text-[#64748b] border-[#e5e7eb] hover:border-[#ef4444] hover:text-[#ef4444]"
                          }`}
                        >
                          Skip
                        </button>
                      </div>

                      {/* Chevron */}
                      <svg className={`w-4 h-4 text-[#94a3b8] shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
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
                            {(opp.set_aside_type || opp.set_aside_description) && <span className="px-2.5 py-1 text-[11px] rounded-full bg-[#f1f5f9] text-[#64748b] border border-[#e5e7eb]">{opp.set_aside_type || opp.set_aside_description}</span>}
                            {opp.naics_code && <span className="px-2.5 py-1 text-[11px] rounded-full bg-[#f1f5f9] text-[#64748b] border border-[#e5e7eb] font-mono">NAICS {opp.naics_code}</span>}
                            {opp.place_of_performance && <span className="px-2.5 py-1 text-[11px] rounded-full bg-[#f1f5f9] text-[#64748b] border border-[#e5e7eb]">{opp.place_of_performance}</span>}
                            {sourceBadge(opp.source, match.bid_recommendation)}
                          </div>

                          {/* Description */}
                          {opp.description && (
                            <p className="text-[13px] text-[#64748b] leading-relaxed mb-4 line-clamp-3">
                              {decodeHtml(opp.description.substring(0, 500))}
                            </p>
                          )}

                          {/* Incumbent Intel — only for recompetes */}
                          {opp.incumbent_name && (
                            <div className="p-3 bg-[#fffbeb] border border-[#fde68a] rounded-lg mb-4">
                              <div className="text-[11px] font-semibold text-[#92400e] uppercase tracking-wide mb-2">Recompete Intelligence</div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <div className="text-[11px] text-[#92400e]/70">Current Incumbent</div>
                                  <div className="text-[13px] text-[#92400e] font-semibold">{opp.incumbent_name}</div>
                                </div>
                                {(opp.incumbent_value || getVal(opp) > 0) && (
                                  <div>
                                    <div className="text-[11px] text-[#92400e]/70">Contract Value</div>
                                    <div className="text-[13px] text-[#92400e] font-semibold">{formatCurrency(opp.incumbent_value || getVal(opp))}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Details grid */}
                          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-4">
                            {opp.solicitation_number && (
                              <div>
                                <div className="text-[11px] text-[#94a3b8] font-medium mb-0.5">Solicitation</div>
                                <div className="text-[13px] text-[#0f172a] font-mono">{opp.solicitation_number}</div>
                              </div>
                            )}
                            {getVal(opp) > 0 && (
                              <div>
                                <div className="text-[11px] text-[#94a3b8] font-medium mb-0.5">Estimated Value</div>
                                <div className="text-[13px] text-[#0f172a] font-semibold">{formatCurrency(getVal(opp))}</div>
                              </div>
                            )}
                            {opp.response_deadline && (
                              <div>
                                <div className="text-[11px] text-[#94a3b8] font-medium mb-0.5">Response Deadline</div>
                                <div className={`text-[13px] font-semibold ${deadlineColor}`}>
                                  {new Date(opp.response_deadline).toLocaleDateString()} ({deadlineLabel(opp.response_deadline)})
                                </div>
                              </div>
                            )}
                            {opp.place_of_performance && (
                              <div>
                                <div className="text-[11px] text-[#94a3b8] font-medium mb-0.5">Location</div>
                                <div className="text-[13px] text-[#0f172a]">{opp.place_of_performance}</div>
                              </div>
                            )}
                            {opp.posted_date && (
                              <div>
                                <div className="text-[11px] text-[#94a3b8] font-medium mb-0.5">Posted</div>
                                <div className="text-[13px] text-[#0f172a]">{new Date(opp.posted_date).toLocaleDateString()}</div>
                              </div>
                            )}
                            <div>
                              <div className="text-[11px] text-[#94a3b8] font-medium mb-0.5">Source</div>
                              <div className="text-[13px] text-[#0f172a]">{getSourceLabel(opp.source, opp.agency)}</div>
                            </div>
                          </div>

                          {/* AI Recommendation */}
                          <div className="p-4 bg-[rgba(37,99,235,0.12)] border border-[#bfdbfe] rounded-lg mb-4">
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
                                  <button onClick={() => setEditingNote(null)} className="text-xs text-[#94a3b8] hover:text-[#64748b]">Cancel</button>
                                </div>
                              </div>
                            ) : match.user_notes ? (
                              <div>
                                <p className="text-xs text-[#64748b] mb-1">{match.user_notes}</p>
                                {match.notes_updated_at && <span className="text-[10px] text-[#94a3b8]">Note added {new Date(match.notes_updated_at).toLocaleDateString()}</span>}
                                <button onClick={() => { setEditingNote(match.id); setNoteText(match.user_notes || ""); }} className="ml-2 text-[10px] text-[#2563eb] hover:text-[#1d4ed8]">Edit</button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingNote(match.id); setNoteText(""); }} className="text-xs text-[#94a3b8] hover:text-[#64748b] italic">Add a note...</button>
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
                                    className="px-3 py-1.5 text-xs font-medium text-[#2563eb] border border-[#e2e8f0] rounded-lg hover:bg-[rgba(37,99,235,0.12)] ci-btn">
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
                                <span className="px-3 py-1.5 text-[12px] text-[#2563eb] bg-[rgba(37,99,235,0.12)] rounded-lg font-medium">Bidding</span>
                              ) : (
                                <>
                                  <button onClick={() => updateStatus(match.id, "tracking")}
                                    className="px-4 py-2 text-[13px] font-medium border border-[#e5e7eb] text-[#64748b] rounded-lg hover:border-[#059669] hover:text-[#059669] hover:bg-[#ecfdf5] transition-all">
                                    Track
                                  </button>
                                  <button onClick={() => updateStatus(match.id, "bidding")}
                                    className="px-4 py-2 text-[13px] font-medium bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8] transition-all">
                                    Start Bid
                                  </button>
                                  <button onClick={() => updateStatus(match.id, "skipped")}
                                    className="px-4 py-2 text-[13px] text-[#94a3b8] hover:text-[#64748b] transition-colors">
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
              {matchLimit < filtered.length && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={handleLoadMore}
                    className="px-6 py-2.5 text-sm font-medium border border-[#e5e7eb] text-[#64748b] bg-white hover:border-[#e2e8f0] hover:text-[#0f172a] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] rounded-xl transition-all duration-200"
                  >
                    Load 50 More
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar — full width on mobile (below main), 320px column at lg+ */}
        <div className="w-full lg:w-auto space-y-4 right-sidebar-desktop">
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
                <span className="text-xs text-[#64748b]">{s.label}</span>
                <span className="text-xs font-mono text-[#0f172a]">{pipelineCounts[s.key] ?? 0}</span>
              </div>
            ))}
            <Link
              href="/dashboard/pipeline"
              className="block mt-3 text-xs text-[#3b82f6] hover:text-[#0f172a] transition-colors"
            >
              View Pipeline →
            </Link>
          </div>

          {/* Compliance Health — derived from outstanding compliance_items */}
          {(() => {
            const profileFields = [
              !!organization.uei,
              !!organization.cage_code,
              (organization.naics_codes?.length ?? 0) > 0,
              (organization.certifications?.length ?? 0) > 0,
              (organization.keywords?.length ?? 0) > 0,
              organization.serves_nationwide !== undefined,
            ];
            const profilePct = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);
            const alertPenalty = Math.min(complianceAlerts.length * 10, 40);
            const health = Math.max(0, profilePct - alertPenalty);
            const color = health >= 80 ? "#22c55e" : health >= 50 ? "#f59e0b" : "#ef4444";
            return (
              <div className="ci-card p-5">
                <h3 className="ci-section-label mb-3">Compliance Health</h3>
                <div className="text-3xl font-bold font-mono mb-2" style={{ color }}>{health}%</div>
                <div className="w-full h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${health}%`, backgroundColor: color }} />
                </div>
                {complianceAlerts.length > 0 && (
                  <p className="text-[11px] text-[#64748b] mt-2">{complianceAlerts.length} alert{complianceAlerts.length > 1 ? "s" : ""} due this week</p>
                )}
                <Link href="/dashboard/compliance" className="block mt-3 text-xs text-[#3b82f6] hover:text-[#0f172a] transition-colors">
                  View Compliance →
                </Link>
              </div>
            );
          })()}

          {/* Upcoming Compliance Deadlines — 3 most urgent compliance_items */}
          <div className="ci-card p-5">
            <h3 className="ci-section-label mb-3">Upcoming Deadlines</h3>
            {upcomingComplianceDeadlines.length === 0 ? (
              <p className="text-xs text-[#94a3b8]">No upcoming compliance deadlines</p>
            ) : (
              upcomingComplianceDeadlines.map((c) => {
                const d = daysUntil(c.due_date);
                const color = d !== null && d <= 3 ? "text-[#ef4444]" : d !== null && d <= 7 ? "text-[#f59e0b]" : "text-[#64748b]";
                return (
                  <div key={c.id} className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-[#64748b] truncate mr-2">{c.title}</span>
                    <span className={`text-xs font-mono shrink-0 ${color}`}>{deadlineLabel(c.due_date)}</span>
                  </div>
                );
              })
            )}
            <Link href="/dashboard/compliance" className="block mt-3 text-xs text-[#3b82f6] hover:text-[#0f172a] transition-colors">
              View Compliance →
            </Link>
          </div>

          {/* Archived Contracts */}
          {(() => {
            const archived = matches.filter((m) => m.user_status === "skipped");
            if (!archived.length) return null;
            return (
              <div className="border border-[#e5e7eb] bg-white p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
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
                          <span className="text-xs text-[#64748b] truncate block">{decodeHtml(m.opportunities?.title || "")}</span>
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
          <button onClick={() => setToast(null)} className="text-[#64748b] hover:text-white ml-2">&times;</button>
        </div>
      )}

      {/* Floating Unlock Button */}
      <UnlockButton />
    </div>
  );
}
