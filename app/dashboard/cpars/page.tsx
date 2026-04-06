"use client";

import { useDashboard } from "../context";
import { isTeam } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";

const RATING_CATEGORIES = ["Quality", "Schedule", "Cost Control", "Management", "Small Business"];
const RATING_VALUES = ["Exceptional", "Very Good", "Satisfactory", "Marginal", "Unsatisfactory"];

function ratingColor(value: string): string {
  switch (value) {
    case "Exceptional": return "text-[#22c55e]";
    case "Very Good": return "text-[#3b82f6]";
    case "Satisfactory": return "text-[#e8edf8]";
    case "Marginal": return "text-[#f59e0b]";
    case "Unsatisfactory": return "text-[#ef4444]";
    default: return "text-[#8b9ab5]";
  }
}

function ratingBg(value: string): string {
  switch (value) {
    case "Exceptional": return "bg-[#22c55e]/10";
    case "Very Good": return "bg-[#3b82f6]/10";
    case "Satisfactory": return "bg-[#e8edf8]/5";
    case "Marginal": return "bg-[#f59e0b]/10";
    case "Unsatisfactory": return "bg-[#ef4444]/10";
    default: return "bg-[#111520]";
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
          <div className="border border-[#1e2535] bg-[#0d1018] p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#4a5a75] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-serif text-[#e8edf8] mb-2">CPARS Monitor — Team Feature</h2>
            <p className="text-sm text-[#8b9ab5] mb-4">
              Track CPARS evaluations, generate AI-powered responses to unfavorable ratings.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to Team
            </Link>
          </div>
        </div>
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="text-2xl font-serif text-[#e8edf8] mb-6">CPARS Monitor</h1>
          <div className="border border-[#1e2535] bg-[#0d1018] p-12 text-center text-[#4a5a75]">
            Sample CPARS content...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-[#e8edf8]">CPARS Monitor</h1>
        <HelpButton page="cpars" />
      </div>

      {/* Add Rating Form */}
      <div className="border border-[#1e2535] bg-[#0d1018] p-5 mb-6">
        <h2 className="text-[10px] font-mono uppercase tracking-wider text-[#4a5a75] mb-4">Add CPARS Rating</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1 font-mono uppercase tracking-wider">Contract</label>
              <select
                value={form.contract_id}
                onChange={(e) => setForm((f) => ({ ...f, contract_id: e.target.value }))}
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              >
                <option value="">Select contract...</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>{c.title} ({c.contract_number})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1 font-mono uppercase tracking-wider">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              >
                {RATING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1 font-mono uppercase tracking-wider">Rating</label>
              <select
                value={form.rating}
                onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              >
                {RATING_VALUES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1 font-mono uppercase tracking-wider">Evaluation Date</label>
              <input
                type="date"
                value={form.evaluation_date}
                onChange={(e) => setForm((f) => ({ ...f, evaluation_date: e.target.value }))}
                className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1 font-mono uppercase tracking-wider">Narrative</label>
            <textarea
              value={form.narrative}
              onChange={(e) => setForm((f) => ({ ...f, narrative: e.target.value }))}
              rows={4}
              className="w-full bg-[#111520] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
              placeholder="Enter the evaluator's narrative..."
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !form.contract_id || !form.narrative}
            className="bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Add Rating"}
          </button>
        </form>
      </div>

      {/* Ratings List */}
      {loading ? (
        <div className="text-center text-[#4a5a75] py-12">Loading ratings...</div>
      ) : ratings.length === 0 ? (
        <div className="border border-[#1e2535] bg-[#0d1018] p-12 text-center">
          <div className="text-[#4a5a75] text-lg mb-2">No CPARS ratings recorded</div>
          <p className="text-sm text-[#8b9ab5]">Add your first CPARS evaluation above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ratings.map((r) => (
            <div key={r.id} className="border border-[#1e2535] bg-[#0d1018] p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm text-[#e8edf8] font-medium">
                    {r.contracts?.title ?? "Unknown Contract"}
                  </h3>
                  <p className="text-xs text-[#4a5a75] font-mono mt-0.5">
                    {r.contracts?.contract_number} — {r.category}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.evaluation_date && (
                    <span className="text-xs font-mono text-[#4a5a75]">
                      {new Date(r.evaluation_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 text-[10px] font-mono uppercase ${ratingColor(r.rating)} ${ratingBg(r.rating)}`}>
                    {r.rating}
                  </span>
                </div>
              </div>
              <p className="text-sm text-[#8b9ab5] mb-3">{r.narrative}</p>
              {(r.rating === "Marginal" || r.rating === "Unsatisfactory") && (
                <div className="flex items-center gap-3">
                  {r.response_draft ? (
                    <button
                      onClick={() => setResponseView({ id: r.id, text: r.response_draft })}
                      className="text-xs text-[#3b82f6] hover:text-[#e8edf8] transition-colors"
                    >
                      View Response Draft
                    </button>
                  ) : (
                    <button
                      onClick={() => generateResponse(r.id)}
                      disabled={generatingId === r.id}
                      className="px-3 py-1 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
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
          <div className="w-full max-w-2xl border border-[#1e2535] bg-[#0d1018] p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif text-[#e8edf8]">CPARS Response Draft</h2>
              <button
                onClick={copyResponse}
                className="px-3 py-1 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="bg-[#111520] border border-[#1e2535] p-4 text-sm text-[#e8edf8] whitespace-pre-wrap">
              {responseView.text}
            </div>
            <button
              onClick={() => setResponseView(null)}
              className="mt-4 w-full border border-[#1e2535] text-[#8b9ab5] py-2 text-sm hover:border-[#2a3548] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
