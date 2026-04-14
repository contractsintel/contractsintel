"use client";

import { useDashboard } from "../../context";
import { ProfileBoostBanner } from "../../unlock-panel";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { htmlToPlainText } from "@/app/lib/html";

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

  const [opp, setOpp] = useState<Record<string, any> | null>(null);
  const [match, setMatch] = useState<Record<string, any> | null>(null);
  const [related, setRelated] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [toast, setToast] = useState("");
  const [expandDesc, setExpandDesc] = useState(false);
  const [incumbent, setIncumbent] = useState<{
    incumbent: { name: string | null; value: number | null };
    basis: { agency: string | null; naics_code: string | null; set_aside_type: string | null };
    prior_buys: Record<string, any>[];
  } | null>(null);
  // G05 — RFP decoder state
  const [shred, setShred] = useState<Record<string, any> | null>(null);
  const [shredLoading, setShredLoading] = useState(false);
  const [shredError, setShredError] = useState<string | null>(null);
  // Feature 1: Bid/No-Bid Wizard
  const [bidWizardOpen, setBidWizardOpen] = useState(false);
  const [bidScores, setBidScores] = useState<Record<string, number>>({
    capability_fit: 3, past_performance: 3, pricing_comfort: 3,
    timeline_feasibility: 3, competition_level: 3, set_aside_match: 3,
    relationship_strength: 3, resource_availability: 3,
  });
  // Feature 2: Pricing Intelligence
  const [pricingData, setPricingData] = useState<{ awards: Record<string, any>[]; avg: number; min: number; max: number; count: number; matchBasis?: string } | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  // Feature 3: Compliance Checklist
  const [complianceItems, setComplianceItems] = useState<{ text: string; checked: boolean }[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(false);

  // PERF: Fire ALL initial data fetches in parallel instead of sequentially.
  // Previously 5 sequential round-trips (~3-5s), now 1 parallel batch (~0.5-1s).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [oppRes, matchRes, incumbentRes, shredRes] = await Promise.all([
        supabase.from("opportunities").select("*").eq("id", oppId).single(),
        supabase.from("opportunity_matches").select("*")
          .eq("opportunity_id", oppId).eq("organization_id", organization.id).single(),
        fetch(`/api/opportunities/${oppId}/incumbent`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/proposals/shred?opportunity_id=${oppId}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      if (cancelled) return;

      const oppData = oppRes.data;
      setOpp(oppData);

      const matchData = matchRes.data;
      setMatch(matchData);
      if (matchData?.user_notes) setNoteText(matchData.user_notes);

      if (incumbentRes) setIncumbent(incumbentRes);
      if (shredRes?.shreds?.length > 0) setShred(shredRes.shreds[0]);

      // Load related opportunities (same NAICS or agency) — depends on oppData
      if (oppData?.naics_code) {
        const { data: rel } = await supabase
          .from("opportunities")
          .select("id, title, agency, source, response_deadline")
          .eq("naics_code", oppData.naics_code)
          .neq("id", oppId)
          .neq("status", "expired")
          .order("created_at", { ascending: false })
          .limit(5);
        if (!cancelled) setRelated(rel ?? []);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [oppId, organization.id, supabase]);

  // Feature 2: Load pricing intelligence from similar contracts
  const loadPricing = async () => {
    if (!opp) return;
    setPricingLoading(true);
    try {
      // Try NAICS match first, then fall back to agency match
      let data: Record<string, any>[] | null = null;
      let matchBasis = "";

      if (opp.naics_code) {
        const res = await supabase
          .from("opportunities")
          .select("title, agency, estimated_value, value_estimate, source, response_deadline, naics_code")
          .eq("naics_code", opp.naics_code)
          .neq("id", oppId)
          .not("estimated_value", "is", null)
          .gt("estimated_value", 0)
          .order("created_at", { ascending: false })
          .limit(50);
        data = res.data;
        matchBasis = `NAICS ${opp.naics_code}`;
      }

      // Fallback: match by agency if no NAICS or no results
      if ((!data || data.length === 0) && opp.agency) {
        const res = await supabase
          .from("opportunities")
          .select("title, agency, estimated_value, value_estimate, source, response_deadline, naics_code")
          .eq("agency", opp.agency)
          .neq("id", oppId)
          .not("estimated_value", "is", null)
          .gt("estimated_value", 0)
          .order("created_at", { ascending: false })
          .limit(50);
        data = res.data;
        matchBasis = `${opp.agency} agency`;
      }

      if (data && data.length > 0) {
        const vals = data.map((d: Record<string, any>) => d.estimated_value || d.value_estimate || 0).filter((v: number) => v > 0);
        const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
        setPricingData({
          awards: data.slice(0, 8),
          avg: Math.round(avg),
          min: Math.min(...vals),
          max: Math.max(...vals),
          count: vals.length,
          matchBasis,
        });
      } else {
        setPricingData({ awards: [], avg: 0, min: 0, max: 0, count: 0, matchBasis: "no matches found" });
      }
    } catch { /* swallow */ }
    setPricingLoading(false);
  };

  // Feature 3: Generate compliance checklist from opportunity description
  const generateChecklist = async () => {
    setComplianceLoading(true);
    const desc = opp?.full_description || opp?.description || "";
    const instructions = opp?.response_instructions || "";
    const text = `${desc}\n\n${instructions}`.trim();
    if (!text || text.length < 50) {
      setComplianceItems([
        { text: "Review full solicitation document", checked: false },
        { text: "Verify SAM.gov registration is active", checked: false },
        { text: "Confirm NAICS code eligibility", checked: false },
        { text: "Check set-aside requirements match certifications", checked: false },
        { text: "Prepare capability statement", checked: false },
        { text: "Compile past performance references", checked: false },
        { text: "Develop pricing/cost proposal", checked: false },
        { text: "Submit before deadline", checked: false },
      ]);
      setComplianceLoading(false);
      return;
    }
    // Extract requirements from description using pattern matching
    const items: { text: string; checked: boolean }[] = [];
    // Always include base items
    items.push({ text: "Verify SAM.gov registration is active and current", checked: false });
    if (opp?.set_aside_type) items.push({ text: `Confirm ${opp.set_aside_type} certification eligibility`, checked: false });
    if (opp?.naics_code) items.push({ text: `Verify NAICS ${opp.naics_code} is on your SAM.gov profile`, checked: false });
    items.push({ text: "Review full solicitation documents and amendments", checked: false });
    // Look for specific requirements in text
    const lowerText = text.toLowerCase();
    if (lowerText.includes("past performance") || lowerText.includes("past-performance")) items.push({ text: "Prepare past performance references (minimum 3 relevant contracts)", checked: false });
    if (lowerText.includes("capability statement")) items.push({ text: "Prepare capability statement tailored to this solicitation", checked: false });
    if (lowerText.includes("technical") && (lowerText.includes("proposal") || lowerText.includes("approach"))) items.push({ text: "Draft technical approach/proposal volume", checked: false });
    if (lowerText.includes("pricing") || lowerText.includes("cost proposal") || lowerText.includes("price proposal")) items.push({ text: "Develop detailed pricing/cost proposal", checked: false });
    if (lowerText.includes("oral presentation")) items.push({ text: "Prepare oral presentation materials", checked: false });
    if (lowerText.includes("site visit")) items.push({ text: "Attend mandatory site visit", checked: false });
    if (lowerText.includes("question") && (lowerText.includes("period") || lowerText.includes("deadline"))) items.push({ text: "Submit questions before Q&A deadline", checked: false });
    if (lowerText.includes("key personnel") || lowerText.includes("resume")) items.push({ text: "Compile key personnel resumes", checked: false });
    if (lowerText.includes("subcontract")) items.push({ text: "Identify and confirm subcontractor commitments", checked: false });
    if (lowerText.includes("bond") || lowerText.includes("surety")) items.push({ text: "Obtain required bonding/surety", checked: false });
    if (lowerText.includes("insurance") || lowerText.includes("liability")) items.push({ text: "Verify insurance requirements are met", checked: false });
    if (lowerText.includes("clearance") || lowerText.includes("security")) items.push({ text: "Confirm security clearance requirements", checked: false });
    if (lowerText.includes("wage determination") || lowerText.includes("service contract act")) items.push({ text: "Review applicable wage determination", checked: false });
    // Always include submission items
    items.push({ text: "Perform compliance review of all proposal volumes", checked: false });
    items.push({ text: `Submit proposal before deadline${opp?.response_deadline ? ` (${new Date(opp.response_deadline).toLocaleDateString()})` : ""}`, checked: false });
    setComplianceItems(items);
    setComplianceLoading(false);
  };

  // Feature 5: Win Probability (pWin) Calculator
  const calculatePwin = (): { score: number; factors: { label: string; value: number; max: number; detail: string }[] } => {
    if (!opp || !match) return { score: 0, factors: [] };
    const factors: { label: string; value: number; max: number; detail: string }[] = [];
    // NAICS Match (0-20)
    const naicsMatch = opp.naics_code && organization.naics_codes?.includes(opp.naics_code);
    const naicsPrefix = opp.naics_code && organization.naics_codes?.some((n: string) => n.substring(0, 4) === opp.naics_code?.substring(0, 4));
    const naicsScore = naicsMatch ? 20 : naicsPrefix ? 12 : 5;
    factors.push({ label: "NAICS Alignment", value: naicsScore, max: 20, detail: naicsMatch ? "Exact NAICS match" : naicsPrefix ? "Same NAICS family" : "No direct NAICS match" });
    // Set-Aside Advantage (0-20)
    const setAside = opp.set_aside_type?.toLowerCase() || "";
    const orgCerts = (organization.certifications || []).map((c: string) => c.toLowerCase());
    const setAsideMatch = setAside && orgCerts.some((c: string) => setAside.includes(c) || c.includes(setAside.substring(0, 4)));
    const setAsideScore = !setAside || setAside.includes("full") ? 10 : setAsideMatch ? 20 : 3;
    factors.push({ label: "Set-Aside Advantage", value: setAsideScore, max: 20, detail: !setAside || setAside.includes("full") ? "Full & open competition" : setAsideMatch ? "Your certifications match" : "Set-aside doesn't match certs" });
    // Match Score Proxy (0-20)
    const matchProxy = Math.round((match.match_score / 100) * 20);
    factors.push({ label: "AI Match Score", value: matchProxy, max: 20, detail: `${match.match_score}/100 match score` });
    // Timeline (0-15)
    const daysLeft = daysUntil(opp.response_deadline);
    const timeScore = daysLeft === null ? 10 : daysLeft > 30 ? 15 : daysLeft > 14 ? 12 : daysLeft > 7 ? 8 : 3;
    factors.push({ label: "Timeline Feasibility", value: timeScore, max: 15, detail: daysLeft === null ? "No deadline set" : `${daysLeft} days remaining` });
    // Competition Estimate (0-15) - based on set-aside narrowing the field
    const compScore = setAside && !setAside.includes("full") ? 12 : 7;
    factors.push({ label: "Competition Level", value: compScore, max: 15, detail: setAside && !setAside.includes("full") ? "Reduced competition (set-aside)" : "Open competition expected" });
    // Value Fit (0-10)
    const valCalc = opp.estimated_value ?? opp.value_estimate ?? 0;
    const valFit = valCalc > 0 && valCalc < 10_000_000 ? 8 : valCalc >= 10_000_000 ? 5 : 6;
    factors.push({ label: "Contract Size Fit", value: valFit, max: 10, detail: valCalc > 0 ? `${formatCurrency(valCalc)} contract` : "Value undisclosed" });
    const total = factors.reduce((sum, f) => sum + f.value, 0);
    return { score: total, factors };
  };

  const runShred = async () => {
    if (!oppId) return;
    setShredLoading(true);
    setShredError(null);
    try {
      const r = await fetch("/api/proposals/shred", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunity_id: oppId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Shred failed");
      setShred(j.shred);
    } catch (e: unknown) {
      setShredError(e instanceof Error ? e.message : "Shred failed");
    } finally {
      setShredLoading(false);
    }
  };

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

  // P1.3: Allow user to track an opportunity that has no match row yet.
  // Inserts a fresh opportunity_matches row with pipeline_stage='monitoring'.
  const trackOpportunity = async () => {
    const { data: inserted, error } = await supabase
      .from("opportunity_matches")
      .insert({
        organization_id: organization.id,
        opportunity_id: oppId,
        match_score: 0,
        bid_recommendation: "monitor",
        recommendation_reasoning: "Manually tracked from opportunity detail page.",
        user_status: "tracking",
        pipeline_stage: "monitoring",
        is_demo: false,
      })
      .select()
      .single();
    if (error) {
      setToast("Failed to track — try again");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setMatch(inserted);
    setToast("Now tracking");
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

      <ProfileBoostBanner context="dashboard" />

      {/* Header */}
      <div className="ci-card p-6 mb-6">
        <div className="flex items-start gap-4">
          {match && (
            <div className={`ci-score-ring text-xl ${match.match_score >= 90 ? "border-[#059669] text-[#059669]" : match.match_score >= 80 ? "border-[#2563eb] text-[#2563eb]" : match.match_score >= 70 ? "border-[#d97706] text-[#d97706]" : "border-[#94a3b8] text-[#94a3b8]"}`}>
              {match.match_score}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="ci-serif text-[20px] sm:text-[24px] tracking-[-0.01em] text-[#0f172a] mb-1 break-words">{cleanTitle(opp.title)}</h1>
            <p className="text-[14px] text-[#475569] mb-1">{opp.agency}</p>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#f1f5f9] text-[#475569]">{sourceName}</span>
              {isExpired && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#fef2f2] text-[#dc2626]">Expired</span>}
              {isRecompete && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#fefce8] text-[#a16207]">Recompete Alert</span>}
              {opp.set_aside_type && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#ecfdf5] text-[#059669]">{opp.set_aside_type}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {match?.user_status === "tracking" ? (
                <span className="px-3 py-1.5 text-xs text-[#059669] bg-[#ecfdf5] rounded-lg font-medium">Tracking</span>
              ) : match?.user_status === "bidding" ? (
                <span className="px-3 py-1.5 text-xs text-[#2563eb] bg-[rgba(37,99,235,0.12)] rounded-lg font-medium">Preparing Bid</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key Details */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Key Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
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

          {/* Feature 2: Pricing Intelligence */}
          {pricingData && (
            <div className="ci-card p-6">
              <h2 className="ci-section-label mb-4">Pricing Intelligence</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-[#f8f9fb] border border-[#e5e7eb] text-center">
                  <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">Avg Award</div>
                  <div className="text-[16px] font-semibold text-[#0f172a]">{formatCurrency(pricingData.avg)}</div>
                </div>
                <div className="p-3 rounded-lg bg-[#f8f9fb] border border-[#e5e7eb] text-center">
                  <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">Min</div>
                  <div className="text-[16px] font-semibold text-[#059669]">{formatCurrency(pricingData.min)}</div>
                </div>
                <div className="p-3 rounded-lg bg-[#f8f9fb] border border-[#e5e7eb] text-center">
                  <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">Max</div>
                  <div className="text-[16px] font-semibold text-[#dc2626]">{formatCurrency(pricingData.max)}</div>
                </div>
              </div>
              <div className="text-[11px] text-[#94a3b8] mb-3">Based on {pricingData.count} similar {pricingData.matchBasis || `NAICS ${opp?.naics_code}`} awards</div>
              <div className="space-y-2">
                {pricingData.awards.map((a, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-[#f1f5f9] last:border-0 text-[12px]">
                    <div className="min-w-0 flex-1 mr-3">
                      <div className="text-[#0f172a] truncate">{a.title}</div>
                      <div className="text-[#94a3b8]">{a.agency}</div>
                    </div>
                    <div className="text-[#0f172a] font-mono font-medium shrink-0">{formatCurrency(a.estimated_value || a.value_estimate)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feature 3: Compliance Checklist */}
          {complianceItems.length > 0 && (
            <div className="ci-card p-6">
              <h2 className="ci-section-label mb-4">Compliance Checklist</h2>
              <div className="text-[11px] text-[#94a3b8] mb-3">
                {complianceItems.filter(c => c.checked).length}/{complianceItems.length} items complete
              </div>
              <div className="w-full bg-[#f1f5f9] rounded-full h-1.5 mb-4">
                <div
                  className="bg-[#2563eb] h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${complianceItems.length > 0 ? (complianceItems.filter(c => c.checked).length / complianceItems.length) * 100 : 0}%` }}
                />
              </div>
              <div className="space-y-2">
                {complianceItems.map((item, i) => (
                  <label key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-[#f8f9fb] cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => setComplianceItems(prev => prev.map((c, idx) => idx === i ? { ...c, checked: !c.checked } : c))}
                      className="mt-0.5 w-4 h-4 rounded border-[#d1d5db] text-[#2563eb] focus:ring-[#2563eb]"
                    />
                    <span className={`text-[13px] ${item.checked ? "line-through text-[#94a3b8]" : "text-[#0f172a]"}`}>{item.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* G17: Incumbent + prior buys panel */}
          {incumbent && (incumbent.incumbent.name || (incumbent.prior_buys && incumbent.prior_buys.length > 0)) && (
            <div className="ci-card p-6">
              <h2 className="ci-section-label mb-4">Incumbent &amp; Prior Buys</h2>
              {incumbent.incumbent.name ? (
                <div className="mb-4 p-3 rounded border border-[#e5e7eb] bg-[#f8f9fb]">
                  <div className="text-[11px] uppercase tracking-wide text-[#94a3b8] mb-1">Likely incumbent</div>
                  <div className="text-[14px] text-[#0f172a] font-medium">{incumbent.incumbent.name}</div>
                  {incumbent.incumbent.value && incumbent.incumbent.value > 0 && (
                    <div className="text-[12px] text-[#475569] font-mono mt-0.5">
                      {formatCurrency(incumbent.incumbent.value)} prior award value
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-4 text-[12px] text-[#94a3b8] italic">
                  No declared incumbent on this notice. Showing similar prior buys from the same agency &amp; NAICS.
                </div>
              )}
              {incumbent.prior_buys && incumbent.prior_buys.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-[#94a3b8]">
                    Similar prior buys ({incumbent.basis.agency || "agency"} · NAICS {incumbent.basis.naics_code || "—"})
                  </div>
                  {incumbent.prior_buys.map((b: Record<string, any>) => {
                    const v = b.estimated_value ?? b.value_estimate ?? 0;
                    return (
                      <Link
                        key={b.id}
                        href={`/dashboard/opportunity/${b.id}`}
                        className="block p-3 rounded border border-[#e5e7eb] bg-white hover:bg-[#f8f9fb]"
                      >
                        <div className="text-[13px] text-[#0f172a] line-clamp-1">{cleanTitle(b.title)}</div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-[#64748b]">
                          {b.posted_date && <span>{new Date(b.posted_date).toLocaleDateString()}</span>}
                          {v > 0 && <span className="font-mono">{formatCurrency(v)}</span>}
                          {b.incumbent_name && <span>· {b.incumbent_name}</span>}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* G05: RFP Decoder */}
          <div className="ci-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="ci-section-label">RFP Decode</h2>
              <button
                onClick={runShred}
                disabled={shredLoading}
                className="px-3 py-1.5 text-xs bg-[#2563eb] text-white rounded disabled:opacity-50"
              >
                {shredLoading ? "Decoding..." : shred ? "Re-decode" : "Decode RFP"}
              </button>
            </div>
            {shredError && (
              <div className="mb-3 px-3 py-2 rounded bg-[#fef2f2] border border-[#fecaca] text-xs text-[#dc2626]">
                {shredError}
              </div>
            )}
            {!shred && !shredLoading && !shredError && (
              <p className="text-[12px] text-[#94a3b8] italic">
                Run an AI decode to extract Section L instructions, Section M evaluation factors,
                deadlines, and incumbent hints from this solicitation.
              </p>
            )}
            {shred && shred.sections && (
              <div className="space-y-4 text-[12px] text-[#475569]">
                {shred.sections.summary && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">Summary</div>
                    <div className="text-[#0f172a]">{shred.sections.summary}</div>
                  </div>
                )}
                {Array.isArray(shred.sections.section_l) && shred.sections.section_l.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">
                      Section L (Instructions)
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {shred.sections.section_l.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(shred.sections.section_m) && shred.sections.section_m.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">
                      Section M (Evaluation)
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {shred.sections.section_m.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(shred.sections.evaluation_criteria) &&
                  shred.sections.evaluation_criteria.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">
                        Evaluation Criteria
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {shred.sections.evaluation_criteria.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                {Array.isArray(shred.sections.deadlines) && shred.sections.deadlines.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">
                      Deadlines
                    </div>
                    <ul className="list-none space-y-0.5">
                      {shred.sections.deadlines.map((d: Record<string, any>, i: number) => (
                        <li key={i} className="font-mono">
                          {d.label}{d.label && d.date ? " · " : ""}{d.date}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(shred.sections.incumbent_hints) &&
                  shred.sections.incumbent_hints.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] mb-1">
                        Incumbent hints
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {shred.sections.incumbent_hints.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                {typeof shred.confidence === "number" && (
                  <div className="text-[10px] text-[#94a3b8] font-mono">
                    confidence {(shred.confidence * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Full Description */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Description</h2>
            {(() => {
              const plain = htmlToPlainText(opp.full_description || opp.description || "");
              if (!plain) {
                return <p className="text-[13px] text-[#94a3b8] italic">No description available. Check the solicitation documents or the original listing for details.</p>;
              }
              return (
                <div className="relative">
                  <div className={`text-[13px] text-[#475569] leading-relaxed whitespace-pre-wrap ${!expandDesc ? "max-h-[180px] overflow-hidden" : ""}`}>
                    {plain}
                  </div>
                  {!expandDesc && plain.length > 400 && (
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                  )}
                  {plain.length > 400 && (
                    <button onClick={() => setExpandDesc(!expandDesc)}
                      className="mt-2 text-[13px] font-medium text-[#2563eb] hover:text-[#1d4ed8]">
                      {expandDesc ? "Show less" : "Show full description"}
                    </button>
                  )}
                </div>
              );
            })()}
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
                {attachments.map((a: Record<string, any>, i: number) => {
                  const isPdf = (a.url || "").toLowerCase().endsWith(".pdf") || (a.name || "").toLowerCase().endsWith(".pdf");
                  const proxyBase = process.env.NEXT_PUBLIC_ATTACHMENT_PROXY_URL || "https://puppeteer-production-f147.up.railway.app";
                  const proxyUrl = `${proxyBase}/proxy-document?url=${encodeURIComponent(a.url)}`;
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
          {/* Not yet matched — show track CTA when no match row exists */}
          {!match && (
            <div className="ci-card p-5">
              <div className="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold mb-3 bg-[#f1f5f9] text-[#64748b]">
                Not yet matched
              </div>
              <p className="text-[13px] text-[#475569] mb-3">
                This opportunity isn&apos;t in your match list yet. Track it to follow updates and surface it on your dashboard.
              </p>
              <button
                onClick={trackOpportunity}
                className="w-full px-4 py-2 text-xs font-medium bg-[#2563eb] text-white hover:bg-[#1d4ed8] rounded-lg ci-btn"
              >
                Track this opportunity
              </button>
            </div>
          )}

          {/* AI Analysis */}
          {match && (
            <div className="p-5 rounded-xl border border-[#bfdbfe]" style={{background: "linear-gradient(135deg, #eff6ff, #f5f3ff)"}}>
              <h2 className="ci-section-label mb-3">Match Analysis</h2>
              <div className="text-[13px] leading-relaxed">
                <div className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold mb-3 ${
                  match.match_score >= 80 ? "bg-[#ecfdf5] text-[#059669]" :
                  match.match_score >= 70 ? "bg-[rgba(37,99,235,0.12)] text-[#2563eb]" :
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
                  match.bid_recommendation === "monitor" ? "bg-[rgba(37,99,235,0.12)] text-[#2563eb]" :
                  match.bid_recommendation === "recompete" ? "bg-[#fefce8] text-[#a16207]" :
                  "bg-[#f1f5f9] text-[#64748b]"
                }`}>
                  {match.bid_recommendation === "bid" ? "Recommended: Bid" :
                   match.bid_recommendation === "monitor" ? "Recommended: Monitor" :
                   match.bid_recommendation === "recompete" ? "Recompete Alert" :
                   "Low Priority"}
                </div>

                {/* Feature 5: pWin Calculator inline */}
                {(() => {
                  const pwin = calculatePwin();
                  if (pwin.score === 0) return null;
                  return (
                    <div className="mt-4 pt-4 border-t border-[#e2e8f0]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Win Probability</span>
                        <span className={`text-lg font-bold font-mono ${pwin.score >= 70 ? "text-[#059669]" : pwin.score >= 40 ? "text-[#d97706]" : "text-[#dc2626]"}`}>
                          {pwin.score}%
                        </span>
                      </div>
                      <div className="w-full bg-[#f1f5f9] rounded-full h-2 mb-3">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${pwin.score >= 70 ? "bg-[#059669]" : pwin.score >= 40 ? "bg-[#d97706]" : "bg-[#dc2626]"}`}
                          style={{ width: `${pwin.score}%` }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        {pwin.factors.map((f, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <span className="text-[#64748b]">{f.label}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-[#f1f5f9] rounded-full h-1">
                                <div className="bg-[#2563eb] h-1 rounded-full" style={{ width: `${(f.value / f.max) * 100}%` }} />
                              </div>
                              <span className="text-[#0f172a] font-mono w-8 text-right">{f.value}/{f.max}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Feature Action Buttons */}
          {match && (
            <div className="ci-card p-5 space-y-2">
              <h2 className="ci-section-label mb-3">Decision Tools</h2>
              <button
                onClick={() => setBidWizardOpen(true)}
                className="w-full px-4 py-2.5 text-xs font-medium border border-[#e2e8f0] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#eff6ff] rounded-lg transition-all"
              >
                Bid/No-Bid Wizard
              </button>
              <button
                onClick={loadPricing}
                disabled={pricingLoading}
                className="w-full px-4 py-2.5 text-xs font-medium border border-[#e2e8f0] text-[#475569] hover:border-[#059669] hover:text-[#059669] hover:bg-[#ecfdf5] rounded-lg transition-all disabled:opacity-50"
              >
                {pricingLoading ? "Loading..." : pricingData ? "Refresh Pricing" : "Pricing Intelligence"}
              </button>
              <button
                onClick={generateChecklist}
                disabled={complianceLoading}
                className="w-full px-4 py-2.5 text-xs font-medium border border-[#e2e8f0] text-[#475569] hover:border-[#d97706] hover:text-[#d97706] hover:bg-[#fffbeb] rounded-lg transition-all disabled:opacity-50"
              >
                {complianceLoading ? "Generating..." : complianceItems.length > 0 ? "Refresh Checklist" : "Compliance Checklist"}
              </button>
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

      {/* Feature 1: Bid/No-Bid Decision Wizard Modal */}
      {bidWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setBidWizardOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 m-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-[#0f172a]">Bid/No-Bid Decision Wizard</h2>
              <button onClick={() => setBidWizardOpen(false)} className="text-[#94a3b8] hover:text-[#0f172a] text-xl leading-none">&times;</button>
            </div>
            <p className="text-[12px] text-[#64748b] mb-5">Rate each factor from 1 (poor fit) to 5 (excellent fit). A score of 24+ suggests a strong bid; below 16 suggests no-bid.</p>
            <div className="space-y-4">
              {[
                { key: "capability_fit", label: "Capability Fit", desc: "How well do your capabilities match?" },
                { key: "past_performance", label: "Past Performance", desc: "Do you have relevant past performance?" },
                { key: "pricing_comfort", label: "Pricing Comfort", desc: "Can you offer competitive pricing?" },
                { key: "timeline_feasibility", label: "Timeline Feasibility", desc: "Can you meet the deadline?" },
                { key: "competition_level", label: "Competition Level", desc: "How favorable is competition? (5=few competitors)" },
                { key: "set_aside_match", label: "Set-Aside Match", desc: "Do your certs match set-aside?" },
                { key: "relationship_strength", label: "Agency Relationship", desc: "How strong is your relationship?" },
                { key: "resource_availability", label: "Resource Availability", desc: "Do you have staff/resources available?" },
              ].map(({ key, label, desc }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-[13px] font-medium text-[#0f172a]">{label}</span>
                      <span className="text-[11px] text-[#94a3b8] ml-2">{desc}</span>
                    </div>
                    <span className="text-[14px] font-mono font-bold text-[#2563eb] w-6 text-right">{bidScores[key]}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={bidScores[key]}
                    onChange={e => setBidScores(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                    className="w-full h-1.5 bg-[#e5e7eb] rounded-full appearance-none cursor-pointer accent-[#2563eb]"
                  />
                  <div className="flex justify-between text-[9px] text-[#94a3b8] mt-0.5">
                    <span>Poor</span><span>Excellent</span>
                  </div>
                </div>
              ))}
            </div>
            {(() => {
              const total = Object.values(bidScores).reduce((a, b) => a + b, 0);
              const max = Object.keys(bidScores).length * 5;
              const pct = Math.round((total / max) * 100);
              const decision = total >= 32 ? "STRONG BID" : total >= 24 ? "BID" : total >= 16 ? "CONDITIONAL BID" : "NO-BID";
              const decColor = total >= 32 ? "text-[#059669] bg-[#ecfdf5]" : total >= 24 ? "text-[#2563eb] bg-[#eff6ff]" : total >= 16 ? "text-[#d97706] bg-[#fffbeb]" : "text-[#dc2626] bg-[#fef2f2]";
              const barColor = total >= 32 ? "bg-[#059669]" : total >= 24 ? "bg-[#2563eb]" : total >= 16 ? "bg-[#d97706]" : "bg-[#dc2626]";
              return (
                <div className="mt-6 pt-5 border-t border-[#e5e7eb]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] text-[#64748b]">Score: {total}/{max}</span>
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${decColor}`}>{decision}</span>
                  </div>
                  <div className="w-full bg-[#f1f5f9] rounded-full h-3">
                    <div className={`${barColor} h-3 rounded-full transition-all duration-300`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#94a3b8] mt-1">
                    <span>No-Bid</span><span>Conditional</span><span>Bid</span><span>Strong Bid</span>
                  </div>
                  <div className="mt-4 text-[12px] text-[#475569]">
                    {total >= 32 ? "Strong alignment across all factors. Pursue aggressively with dedicated capture team." :
                     total >= 24 ? "Good overall fit. Proceed with bid preparation and monitor competitive landscape." :
                     total >= 16 ? "Mixed signals. Consider teaming arrangements or monitor for more favorable terms." :
                     "Significant gaps in readiness. Recommend no-bid or use as a learning exercise only."}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-[100] px-4 py-3 bg-white rounded-xl shadow-lg border border-[#e2e8f0] text-sm font-medium text-[#0f172a]" style={{ animation: "slideInRight 0.3s ease" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
