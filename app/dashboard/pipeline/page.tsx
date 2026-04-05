"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";

const STAGES = [
  { key: "monitoring", label: "Monitoring", color: "#8b9ab5" },
  { key: "preparing_bid", label: "Preparing Bid", color: "#3b82f6" },
  { key: "submitted", label: "Submitted", color: "#f59e0b" },
  { key: "won", label: "Won", color: "#22c55e" },
  { key: "lost", label: "Lost", color: "#ef4444" },
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
    await supabase
      .from("opportunity_matches")
      .update({
        pipeline_stage: "won",
        award_amount: wonData.award_amount ? Number(wonData.award_amount) : null,
        contract_number: wonData.contract_number || null,
      })
      .eq("id", wonModal);
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
      <h1 className="text-2xl font-serif text-[#e8edf8] mb-6">Pipeline</h1>

      {/* Summary Bar */}
      <div className="grid grid-cols-5 gap-px bg-[#1e2535] border border-[#1e2535] mb-6">
        {STAGES.map((s) => {
          const items = grouped[s.key] ?? [];
          const total = items.reduce((sum: number, m: any) => sum + (m.opportunities?.estimated_value ?? 0), 0);
          return (
            <div key={s.key} className="bg-[#0d1018] p-4">
              <div className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: s.color }}>
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
                className="text-xs font-mono uppercase tracking-wider mb-3 pb-2 border-b"
                style={{ color: stage.color, borderColor: stage.color + "33" }}
              >
                {stage.label} ({(grouped[stage.key] ?? []).length})
              </div>
              <div className="space-y-2">
                {(grouped[stage.key] ?? []).map((match: any) => {
                  const opp = match.opportunities;
                  return (
                    <div
                      key={match.id}
                      className="border border-[#1e2535] bg-[#0d1018] p-3 hover:border-[#2a3548] transition-colors"
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
                        className="w-full bg-[#111520] border border-[#1e2535] text-[#8b9ab5] text-[10px] px-2 py-1 focus:outline-none focus:border-[#2563eb]"
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
          <div className="w-full max-w-md border border-[#1e2535] bg-[#0d1018] p-6">
            <h2 className="text-lg font-serif text-[#e8edf8] mb-4">Award Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1 font-mono uppercase tracking-wider">
                  Award Amount
                </label>
                <input
                  type="number"
                  value={wonData.award_amount}
                  onChange={(e) => setWonData((d) => ({ ...d, award_amount: e.target.value }))}
                  placeholder="e.g. 500000"
                  className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1 font-mono uppercase tracking-wider">
                  Contract Number
                </label>
                <input
                  type="text"
                  value={wonData.contract_number}
                  onChange={(e) => setWonData((d) => ({ ...d, contract_number: e.target.value }))}
                  placeholder="e.g. GS-35F-0001X"
                  className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
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
          <div className="w-full max-w-md border border-[#1e2535] bg-[#0d1018] p-6">
            <h2 className="text-lg font-serif text-[#e8edf8] mb-4">Loss Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1 font-mono uppercase tracking-wider">
                  Reason
                </label>
                <select
                  value={lostData.loss_reason}
                  onChange={(e) => setLostData((d) => ({ ...d, loss_reason: e.target.value }))}
                  className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                >
                  {LOSS_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#8b9ab5] mb-1 font-mono uppercase tracking-wider">
                  Notes
                </label>
                <textarea
                  value={lostData.loss_notes}
                  onChange={(e) => setLostData((d) => ({ ...d, loss_notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
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
