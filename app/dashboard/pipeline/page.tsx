"use client";

import { useDashboard } from "../context";
import { ProfileBoostBanner } from "../unlock-panel";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { HelpButton } from "../help-panel";
import { InlineGuide } from "../inline-guide";

type PipelineOpportunity = {
  title?: string;
  agency?: string;
  estimated_value?: number | null;
  value_estimate?: number | null;
  response_deadline?: string | null;
  naics_code?: string | null;
  solicitation_number?: string | null;
  description?: string | null;
  set_aside?: string | null;
};

type PipelineMatch = {
  id: string;
  match_score: number;
  pipeline_stage: string;
  gate_stage?: string | null;
  gate_notes?: string | null;
  pwin?: number | null;
  award_amount?: number | null;
  contract_number?: string | null;
  loss_reason?: string | null;
  loss_notes?: string | null;
  opportunity_id: string;
  user_status?: string | null;
  opportunities?: PipelineOpportunity;
};

const STAGES = [
  { key: "monitoring", label: "Monitoring", color: "#6b7280", bg: "bg-[#f1f5f9]", text: "text-[#64748b]" },
  { key: "preparing_bid", label: "Preparing Bid", color: "#d97706", bg: "bg-[#fffbeb]", text: "text-[#d97706]" },
  { key: "submitted", label: "Submitted", color: "#2563eb", bg: "bg-[#eff4ff]", text: "text-[#2563eb]" },
  { key: "won", label: "Won", color: "#059669", bg: "bg-[#ecfdf5]", text: "text-[#059669]" },
  { key: "lost", label: "Lost", color: "#dc2626", bg: "bg-[#fef2f2]", text: "text-[#dc2626]" },
];

// G08 Shipley-style capture-management gate stages. Users advance matches
// through the gates and enter gate-review notes; PWin recomputes whenever
// the gate advances.
const GATE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "g0_prospect",         label: "G0 Prospect" },
  { key: "g1_qualification",    label: "G1 Qualification" },
  { key: "g2_pursuit_decision", label: "G2 Pursuit Decision" },
  { key: "g3_capture",          label: "G3 Capture" },
  { key: "g4_proposal",         label: "G4 Proposal" },
  { key: "g5_submission",       label: "G5 Submission" },
  { key: "g6_award",            label: "G6 Award" },
];
function pwinTone(n: number | null | undefined) {
  if (n == null) return "bg-[#f1f5f9] text-[#64748b]";
  if (n >= 70) return "bg-[#dcfce7] text-[#059669]";
  if (n >= 40) return "bg-[#fef9c3] text-[#a16207]";
  return "bg-[#fee2e2] text-[#dc2626]";
}

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
  return "text-[#94a3b8]";
}

function CalendarView({ matches }: { matches: PipelineMatch[] }) {
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const year = month.getFullYear();
  const mo = month.getMonth();
  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const startDay = new Date(year, mo, 1).getDay();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Group items by deadline date
  const byDate: Record<string, PipelineMatch[]> = {};
  matches.forEach((m) => {
    const dl = m.opportunities?.response_deadline;
    if (!dl) return;
    const key = dl.substring(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(m);
  });

  const prev = () => setMonth(new Date(year, mo - 1, 1));
  const next = () => setMonth(new Date(year, mo + 1, 1));

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="px-3 py-1.5 text-xs border border-[#e5e7eb] text-[#64748b] rounded hover:bg-[#f8f9fb]">&larr; Prev</button>
        <h2 className="ci-serif text-[18px] text-[#0f172a]">{monthLabel}</h2>
        <button onClick={next} className="px-3 py-1.5 text-xs border border-[#e5e7eb] text-[#64748b] rounded hover:bg-[#f8f9fb]">Next &rarr;</button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-[#e5e7eb] border border-[#e5e7eb] rounded-lg overflow-hidden">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-[#f8f9fb] py-2 text-center text-[10px] font-medium uppercase tracking-wide text-[#94a3b8]">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="bg-[#fafbfc] min-h-[80px]" />;
          const dateStr = `${year}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const items = byDate[dateStr] || [];
          const isToday = new Date(year, mo, day).getTime() === today.getTime();
          return (
            <div key={day} className={`bg-white min-h-[80px] p-1 ${isToday ? "ring-2 ring-inset ring-[#2563eb]" : ""}`}>
              <div className={`text-[11px] font-mono mb-0.5 ${isToday ? "text-[#2563eb] font-bold" : "text-[#64748b]"}`}>{day}</div>
              {items.slice(0, 3).map((m) => {
                const stageColor = m.pipeline_stage === "submitted" ? "bg-[#2563eb]" : m.pipeline_stage === "preparing_bid" ? "bg-[#d97706]" : "bg-[#6b7280]";
                return (
                  <div key={m.id} className={`${stageColor} text-white text-[9px] px-1 py-0.5 rounded mb-0.5 truncate`} title={m.opportunities?.title || "Untitled"}>
                    {m.opportunities?.title?.substring(0, 20) || "Untitled"}
                  </div>
                );
              })}
              {items.length > 3 && <div className="text-[9px] text-[#94a3b8]">+{items.length - 3} more</div>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-[#64748b]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#6b7280]" /> Monitoring</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#d97706]" /> Preparing Bid</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#2563eb]" /> Submitted</span>
      </div>
    </div>
  );
}

const CAPTURE_PHASES = [
  "Market Research",
  "Sources Sought",
  "Pre-Sol",
  "RFI",
  "Draft RFP",
  "Final RFP",
] as const;

const CAPTURE_ACTIVITIES = [
  "Attended industry day",
  "Submitted RFI response",
  "Met with contracting officer",
  "Identified teaming partners",
  "Reviewed draft SOW/PWS",
  "Completed competitive analysis",
  "Built win themes",
  "Drafted technical approach",
] as const;

const RELATIONSHIP_LEVELS = ["None", "Low", "Medium", "High"] as const;

type CaptureState = Record<
  string,
  {
    phase: string;
    activities: Record<string, boolean>;
    relationship: string;
    notes: string;
  }
>;

function CaptureTrackerView({ matches }: { matches: PipelineMatch[] }) {
  const captureMatches = matches.filter(
    (m) => m.pipeline_stage === "monitoring" || m.pipeline_stage === "preparing_bid"
  );

  const [state, setState] = useState<CaptureState>(() => {
    const init: CaptureState = {};
    captureMatches.forEach((m) => {
      init[m.id] = {
        phase: CAPTURE_PHASES[0],
        activities: {},
        relationship: "None",
        notes: "",
      };
    });
    return init;
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getOrDefault = (id: string) =>
    state[id] ?? { phase: CAPTURE_PHASES[0], activities: {}, relationship: "None", notes: "" };

  const update = (id: string, patch: Partial<CaptureState[string]>) => {
    setState((prev) => ({
      ...prev,
      [id]: { ...getOrDefault(id), ...patch },
    }));
  };

  const toggleActivity = (id: string, activity: string) => {
    const cur = getOrDefault(id);
    update(id, {
      activities: { ...cur.activities, [activity]: !cur.activities[activity] },
    });
  };

  const phaseColor = (phase: string) => {
    const idx = CAPTURE_PHASES.indexOf(phase as (typeof CAPTURE_PHASES)[number]);
    if (idx <= 1) return "bg-[#f1f5f9] text-[#64748b]";
    if (idx <= 3) return "bg-[#fffbeb] text-[#d97706]";
    return "bg-[#eff4ff] text-[#2563eb]";
  };

  const relationshipColor = (level: string) => {
    if (level === "High") return "text-[#059669]";
    if (level === "Medium") return "text-[#d97706]";
    if (level === "Low") return "text-[#ef4444]";
    return "text-[#94a3b8]";
  };

  if (captureMatches.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-[#94a3b8] text-sm mb-2">No pre-RFP opportunities to track</div>
        <div className="text-[#c4c9d4] text-xs">
          Move opportunities to &quot;Monitoring&quot; or &quot;Preparing Bid&quot; to start capture tracking.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="ci-serif text-[18px] text-[#0f172a]">Pre-RFP Capture Tracker</h2>
        <p className="text-[11px] text-[#94a3b8] mt-1">
          Track capture activities for opportunities in Monitoring and Preparing Bid stages.
        </p>
      </div>
      <div className="space-y-3">
        {captureMatches.map((match) => {
          const opp = match.opportunities;
          const data = getOrDefault(match.id);
          const completedCount = CAPTURE_ACTIVITIES.filter((a) => data.activities[a]).length;
          const isExpanded = expandedId === match.id;

          return (
            <div
              key={match.id}
              className="border border-[#e5e7eb] bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
            >
              {/* Header - always visible */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : match.id)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-[#fafbfc] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-xs text-[#0f172a] font-medium truncate">
                      {opp?.title ?? "Untitled"}
                    </h4>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${phaseColor(data.phase)}`}>
                      {data.phase}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[#94a3b8]">
                    <span>{opp?.agency ?? "Unknown Agency"}</span>
                    <span className="font-mono">{formatCurrency(opp?.estimated_value ?? null)}</span>
                    <span>
                      {completedCount}/{CAPTURE_ACTIVITIES.length} activities
                    </span>
                    <span className={`font-medium ${relationshipColor(data.relationship)}`}>
                      Rel: {data.relationship}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {/* Progress bar */}
                  <div className="w-16 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2563eb] rounded-full transition-all"
                      style={{ width: `${(completedCount / CAPTURE_ACTIVITIES.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[#64748b]">{isExpanded ? "▾" : "▸"}</span>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-[#f1f5f9]">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                    {/* Column 1: Phase & Relationship */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-medium uppercase tracking-wide text-[#64748b] mb-1">
                          Capture Phase
                        </label>
                        <select
                          value={data.phase}
                          onChange={(e) => update(match.id, { phase: e.target.value })}
                          className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] text-[11px] px-2 py-1.5 rounded focus:outline-none focus:border-[#2563eb]"
                        >
                          {CAPTURE_PHASES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium uppercase tracking-wide text-[#64748b] mb-1">
                          Relationship Strength
                        </label>
                        <div className="flex gap-1">
                          {RELATIONSHIP_LEVELS.map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => update(match.id, { relationship: level })}
                              className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
                                data.relationship === level
                                  ? "bg-[#2563eb] text-white border-[#2563eb]"
                                  : "bg-white text-[#64748b] border-[#e5e7eb] hover:bg-[#f8f9fb]"
                              }`}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium uppercase tracking-wide text-[#64748b] mb-1">
                          Notes
                        </label>
                        <textarea
                          value={data.notes}
                          onChange={(e) => update(match.id, { notes: e.target.value })}
                          rows={4}
                          placeholder="Key contacts, intel, strategy notes..."
                          className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] text-[11px] px-2 py-1.5 rounded focus:outline-none focus:border-[#2563eb] resize-none"
                        />
                      </div>
                    </div>

                    {/* Column 2-3: Activity Checklist */}
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-medium uppercase tracking-wide text-[#64748b] mb-2">
                        Capture Activities
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {CAPTURE_ACTIVITIES.map((activity) => {
                          const checked = !!data.activities[activity];
                          return (
                            <button
                              key={activity}
                              type="button"
                              onClick={() => toggleActivity(match.id, activity)}
                              className={`flex items-center gap-2 text-left px-3 py-2 rounded border transition-colors ${
                                checked
                                  ? "bg-[#ecfdf5] border-[#bbf7d0] text-[#059669]"
                                  : "bg-white border-[#e5e7eb] text-[#64748b] hover:bg-[#f8f9fb]"
                              }`}
                            >
                              <span
                                className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                                  checked
                                    ? "bg-[#059669] border-[#059669] text-white"
                                    : "border-[#d1d5db] bg-white"
                                }`}
                              >
                                {checked && "✓"}
                              </span>
                              <span className="text-[11px]">{activity}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [matches, setMatches] = useState<PipelineMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "calendar" | "capture">("kanban");
  const [wonModal, setWonModal] = useState<string | null>(null);
  const [lostModal, setLostModal] = useState<string | null>(null);
  const [wonData, setWonData] = useState({ award_amount: "", contract_number: "", period_months: "12" });
  const [wonError, setWonError] = useState<string | null>(null);
  const [lostData, setLostData] = useState({ loss_reason: LOSS_REASONS[0], loss_notes: "" });
  // G08 gate review state
  const [gateNotesOpen, setGateNotesOpen] = useState<Record<string, boolean>>({});
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});

  const updateGate = async (
    matchId: string,
    patch: { gate_stage?: string | null; gate_notes?: string },
  ) => {
    const res = await fetch(`/api/pipeline/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const j = await res.json();
    setMatches((prev) =>
      prev.map((m) =>
        m.id === matchId
          ? {
              ...m,
              gate_stage: j.match?.gate_stage ?? m.gate_stage,
              gate_notes: j.match?.gate_notes ?? m.gate_notes,
              pwin: j.match?.pwin ?? m.pwin,
            }
          : m,
      ),
    );
  };

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from("opportunity_matches")
      .select("*, opportunities(*)")
      .eq("organization_id", organization.id)
      .not("pipeline_stage", "is", null)
      .order("created_at", { ascending: false });
    // Filter out past-deadline items, but keep won/lost (historical records)
    const now = new Date().toISOString();
    const KEEP_STAGES = new Set(["won", "lost", "awarded"]);
    const filtered = (data ?? []).filter((m: Record<string, any>) => {
      if (KEEP_STAGES.has(m.pipeline_stage) || KEEP_STAGES.has(m.user_status)) return true;
      const dl = m.opportunities?.response_deadline;
      return !dl || dl >= now;
    });
    setMatches(filtered);
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
    const match = matches.find((m) => m.id === wonModal);
    const opp = match?.opportunities;
    // P2.1: validate award amount before insert
    const parsed = parseFloat(wonData.award_amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setWonError("Enter a valid award amount greater than $0");
      return;
    }
    setWonError(null);
    const amount = parsed;
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

    // 4. Auto-create default milestones (monthly reports), capped at 36 months
    if (contractRecord?.id) {
      const requested = parseInt(wonData.period_months, 10);
      const months = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 12, 36);
      const milestones = [];
      const now = new Date();
      for (let i = 1; i <= months; i++) {
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
    setWonData({ award_amount: "", contract_number: "", period_months: "12" });
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
    {} as Record<string, PipelineMatch[]>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#d97706"}} />
          <h1 className="ci-page-title">Pipeline</h1>
<div className="w-10 h-[3px] rounded-full mt-2" style={{backgroundColor: "#d97706"}} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[#e5e7eb] rounded-lg overflow-hidden">
            <button
              onClick={() => setView("kanban")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "kanban" ? "bg-[#2563eb] text-white" : "bg-white text-[#64748b] hover:bg-[#f8f9fb]"}`}
            >
              Kanban
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "calendar" ? "bg-[#2563eb] text-white" : "bg-white text-[#64748b] hover:bg-[#f8f9fb]"}`}
            >
              Calendar
            </button>
            <button
              onClick={() => setView("capture")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "capture" ? "bg-[#2563eb] text-white" : "bg-white text-[#64748b] hover:bg-[#f8f9fb]"}`}
            >
              Capture
            </button>
          </div>
          <HelpButton page="pipeline" />
        </div>
      </div>
      <InlineGuide page="pipeline" />
      <ProfileBoostBanner context="pipeline" />

      {/* D6: Pipeline summary bar — one card per stage with count + total value */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {STAGES.map((s) => {
          const items = grouped[s.key] ?? [];
          const total = items.reduce((sum: number, m: PipelineMatch) => sum + (m.opportunities?.estimated_value ?? 0), 0);
          return (
            <div key={s.key} className="border border-[#e5e7eb] bg-[#ffffff] p-4" style={{ borderLeftWidth: "3px", borderLeftColor: s.color }}>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: s.color }}>
                {s.label}
              </div>
              <div className="ci-serif text-[22px] text-[#0f172a] leading-none">{items.length}</div>
              <div className="text-[11px] text-[#94a3b8] font-mono mt-1">{formatCurrency(total)}</div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center text-[#94a3b8] py-12">Loading pipeline...</div>
      ) : view === "calendar" ? (
        <CalendarView matches={matches} />
      ) : view === "capture" ? (
        <CaptureTrackerView matches={matches} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {STAGES.map((stage) => (
            <div key={stage.key} className="min-h-[calc(100vh-320px)] border border-[#e5e7eb] bg-[#ffffff] p-2">
              <div
                className={`text-xs font-medium uppercase tracking-wide mb-3 px-2 py-1.5 ${stage.bg} ${stage.text}`}
              >
                {stage.label} ({(grouped[stage.key] ?? []).length})
              </div>
              <div className="space-y-2">
                {(grouped[stage.key] ?? []).map((match: PipelineMatch) => {
                  const opp = match.opportunities;
                  return (
                    <div
                      key={match.id}
                      className="border border-[#e5e7eb] bg-white p-3 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200"
                    >
                      <h4 className="text-xs text-[#0f172a] font-medium truncate mb-1">
                        {opp?.title ?? "Untitled"}
                      </h4>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-[#64748b]">
                          {formatCurrency(opp?.estimated_value ?? null)}
                        </span>
                        <span className={`text-xs font-mono font-bold ${scoreColor(match.match_score)}`}>
                          {match.match_score}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#94a3b8] font-mono mb-2">
                        {daysUntil(opp?.response_deadline ?? null)}
                      </div>
                      <select
                        value={match.pipeline_stage}
                        onChange={(e) => moveToStage(match.id, e.target.value)}
                        className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#64748b] text-[10px] px-2 py-1 focus:outline-none focus:border-[#2563eb]"
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            Move to {s.label}
                          </option>
                        ))}
                      </select>

                      {/* G08: gate review controls */}
                      <div className="mt-2 flex items-center gap-1" data-testid="gate-controls">
                        <select
                          data-testid="gate-select"
                          value={match.gate_stage ?? ""}
                          onChange={(e) => updateGate(match.id, { gate_stage: e.target.value || null })}
                          className="flex-1 bg-[#f8f9fb] border border-[#e5e7eb] text-[#64748b] text-[10px] px-2 py-1 focus:outline-none focus:border-[#2563eb]"
                        >
                          <option value="">Set gate…</option>
                          {GATE_OPTIONS.map((g) => (
                            <option key={g.key} value={g.key}>{g.label}</option>
                          ))}
                        </select>
                        <span
                          data-testid="pwin-badge"
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${pwinTone(match.pwin)}`}
                          title="Probability of Win"
                        >
                          {match.pwin != null ? `${match.pwin}%` : "PWin"}
                        </span>
                      </div>
                      <button
                        type="button"
                        data-testid="gate-notes-toggle"
                        onClick={() => setGateNotesOpen((m) => ({ ...m, [match.id]: !m[match.id] }))}
                        className="mt-1 w-full text-[10px] text-[#64748b] text-left hover:text-[#0f172a]"
                      >
                        {gateNotesOpen[match.id] ? "▾ Hide notes" : match.gate_notes ? "▸ Gate notes" : "▸ Add gate notes"}
                      </button>
                      {gateNotesOpen[match.id] && (
                        <div className="mt-1 space-y-1">
                          <textarea
                            value={gateDraft[match.id] ?? match.gate_notes ?? ""}
                            onChange={(e) => setGateDraft((d) => ({ ...d, [match.id]: e.target.value }))}
                            rows={3}
                            placeholder="Win themes, discriminators, risks…"
                            className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] text-[10px] px-2 py-1 focus:outline-none focus:border-[#2563eb]"
                          />
                          <button
                            type="button"
                            onClick={() => updateGate(match.id, { gate_notes: gateDraft[match.id] ?? "" })}
                            className="w-full bg-[#2563eb] text-white text-[10px] py-1 rounded hover:bg-[#1d4ed8]"
                          >
                            Save notes
                          </button>
                        </div>
                      )}
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
          <div className="w-full max-w-md border border-[#e5e7eb] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Award Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">
                  Award Amount
                </label>
                <input
                  type="number"
                  value={wonData.award_amount}
                  onChange={(e) => setWonData((d) => ({ ...d, award_amount: e.target.value }))}
                  placeholder="e.g. 500000"
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">
                  Contract Number
                </label>
                <input
                  type="text"
                  value={wonData.contract_number}
                  onChange={(e) => setWonData((d) => ({ ...d, contract_number: e.target.value }))}
                  placeholder="e.g. GS-35F-0001X"
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">
                  Period of Performance (months)
                </label>
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={wonData.period_months}
                  onChange={(e) => setWonData((d) => ({ ...d, period_months: e.target.value }))}
                  placeholder="12"
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
                <p className="text-[10px] text-[#94a3b8] mt-1">Auto-generates monthly milestones, capped at 36.</p>
              </div>
              {wonError && (
                <div className="text-xs text-[#ef4444] bg-[#fef2f2] border border-[#fecaca] px-3 py-2 rounded">
                  {wonError}
                </div>
              )}
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
                className="flex-1 border border-[#e5e7eb] text-[#64748b] py-2 text-sm hover:border-[#d1d5db] transition-colors"
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
          <div className="w-full max-w-md border border-[#e5e7eb] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Loss Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">
                  Reason
                </label>
                <select
                  value={lostData.loss_reason}
                  onChange={(e) => setLostData((d) => ({ ...d, loss_reason: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                >
                  {LOSS_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">
                  Notes
                </label>
                <textarea
                  value={lostData.loss_notes}
                  onChange={(e) => setLostData((d) => ({ ...d, loss_notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
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
                className="flex-1 border border-[#e5e7eb] text-[#64748b] py-2 text-sm hover:border-[#d1d5db] transition-colors"
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
