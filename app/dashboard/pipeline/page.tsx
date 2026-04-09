"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { HelpButton } from "../help-panel";
import { InlineGuide } from "../inline-guide";

const STAGES = [
  { key: "monitoring", label: "Monitoring", color: "#6b7280", bg: "bg-[#f1f5f9]", text: "text-[#8b9ab5]" },
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
  return "text-[#4a5a75]";
}

export default function PipelinePage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wonModal, setWonModal] = useState<string | null>(null);
  const [lostModal, setLostModal] = useState<string | null>(null);
  const [wonData, setWonData] = useState({ award_amount: "", contract_number: "", period_months: "12" });
  const [wonError, setWonError] = useState<string | null>(null);
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
    {} as Record<string, any[]>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#d97706"}} />
          <h1 className="ci-page-title">Pipeline</h1>
<div className="w-10 h-[3px] rounded-full mt-2" style={{backgroundColor: "#d97706"}} />
        </div>
        <HelpButton page="pipeline" />
      </div>
      <InlineGuide page="pipeline" />

      {/* Summary Bar */}
      <div className="flex gap-2 mb-6">
        {STAGES.map((s) => {
          const items = grouped[s.key] ?? [];
          const total = items.reduce((sum: number, m: any) => sum + (m.opportunities?.estimated_value ?? 0), 0);
          return (
            <div key={s.key} className="bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: s.color }}>
                {s.label}
              </div>
              <div className="text-lg font-bold text-[#e8edf8] font-mono">{items.length}</div>
              <div className="text-xs text-[#4a5a75] font-mono">{formatCurrency(total)}</div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center text-[#4a5a75] py-12">Loading pipeline...</div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {STAGES.map((stage) => (
            <div key={stage.key} className="min-h-[400px]">
              <div
                className={`text-xs font-medium uppercase tracking-wide mb-3 px-2 py-1.5 ${stage.bg} ${stage.text}`}
              >
                {stage.label} ({(grouped[stage.key] ?? []).length})
              </div>
              <div className="space-y-2">
                {(grouped[stage.key] ?? []).map((match: any) => {
                  const opp = match.opportunities;
                  return (
                    <div
                      key={match.id}
                      className="border border-[#1e2535] bg-white p-3 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#e2e8f0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200"
                    >
                      <h4 className="text-xs text-[#e8edf8] font-medium truncate mb-1">
                        {opp?.title ?? "Untitled"}
                      </h4>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-[#8b9ab5]">
                          {formatCurrency(opp?.estimated_value)}
                        </span>
                        <span className={`text-xs font-mono font-bold ${scoreColor(match.match_score)}`}>
                          {match.match_score}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#4a5a75] font-mono mb-2">
                        {daysUntil(opp?.response_deadline)}
                      </div>
                      <select
                        value={match.pipeline_stage}
                        onChange={(e) => moveToStage(match.id, e.target.value)}
                        className="w-full bg-[#080a0f] border border-[#1e2535] text-[#8b9ab5] text-[10px] px-2 py-1 focus:outline-none focus:border-[#2563eb]"
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
          <div className="w-full max-w-md border border-[#1e2535] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Award Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">
                  Award Amount
                </label>
                <input
                  type="number"
                  value={wonData.award_amount}
                  onChange={(e) => setWonData((d) => ({ ...d, award_amount: e.target.value }))}
                  placeholder="e.g. 500000"
                  className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">
                  Contract Number
                </label>
                <input
                  type="text"
                  value={wonData.contract_number}
                  onChange={(e) => setWonData((d) => ({ ...d, contract_number: e.target.value }))}
                  placeholder="e.g. GS-35F-0001X"
                  className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">
                  Period of Performance (months)
                </label>
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={wonData.period_months}
                  onChange={(e) => setWonData((d) => ({ ...d, period_months: e.target.value }))}
                  placeholder="12"
                  className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
                <p className="text-[10px] text-[#4a5a75] mt-1">Auto-generates monthly milestones, capped at 36.</p>
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
                className="flex-1 border border-[#1e2535] text-[#8b9ab5] py-2 text-sm hover:border-[#2a3548] transition-colors"
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
          <div className="w-full max-w-md border border-[#1e2535] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Loss Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">
                  Reason
                </label>
                <select
                  value={lostData.loss_reason}
                  onChange={(e) => setLostData((d) => ({ ...d, loss_reason: e.target.value }))}
                  className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                >
                  {LOSS_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">
                  Notes
                </label>
                <textarea
                  value={lostData.loss_notes}
                  onChange={(e) => setLostData((d) => ({ ...d, loss_notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
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
                className="flex-1 border border-[#1e2535] text-[#8b9ab5] py-2 text-sm hover:border-[#2a3548] transition-colors"
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
