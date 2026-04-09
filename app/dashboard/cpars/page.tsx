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
    case "Satisfactory": return "bg-[#111827]/5";
    case "Marginal": return "bg-[#f59e0b]/10";
    case "Unsatisfactory": return "bg-[#ef4444]/10";
    default: return "bg-[#080a0f]";
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
    // P3.3: Route through server endpoint for explicit org ownership check
    await fetch("/api/cpars/insert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contract_id: form.contract_id,
        category: form.category,
        rating: form.rating,
        narrative: form.narrative,
        evaluation_date: form.evaluation_date || null,
      }),
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
          <div className="border border-[#1e2535] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#4a5a75] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">CPARS Monitor — Team Feature</h2>
            <p className="text-sm text-[#8b9ab5] mb-4">
              Track CPARS evaluations, generate AI-powered responses to unfavorable ratings.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to Team
            </Link>
          </div>
        </div>
        <div className="filter blur-[2px] opacity-40 pointer-events-none select-none" aria-hidden="true">
          <h1 className="ci-page-title">CPARS Monitor</h1>
          <div className="space-y-3 mt-6">
            {[1,2,3].map(i => (
              <div key={i} className="border border-[#1e2535] bg-white p-5">
                <div className="h-3 w-1/2 bg-[#111520] rounded mb-3" />
                <div className="h-2 w-1/4 bg-[#111520] rounded mb-2" />
                <div className="h-2 w-3/4 bg-[#111520] rounded" />
              </div>
            ))}
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
</div>
        <HelpButton page="cpars" />
      </div>
      <InlineGuide page="cpars" />

      {/* Add Rating Form */}
      <div className="border border-[#1e2535] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
        <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#4a5a75] mb-4">Add CPARS Rating</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">Contract</label>
              <select
                value={form.contract_id}
                onChange={(e) => setForm((f) => ({ ...f, contract_id: e.target.value }))}
                className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              >
                <option value="">Select contract...</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>{c.title} ({c.contract_number})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              >
                {RATING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">Rating</label>
              <select
                value={form.rating}
                onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              >
                {RATING_VALUES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">Evaluation Date</label>
              <input
                type="date"
                value={form.evaluation_date}
                onChange={(e) => setForm((f) => ({ ...f, evaluation_date: e.target.value }))}
                className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8b9ab5] mb-1 font-medium uppercase tracking-wide">Narrative</label>
            <textarea
              value={form.narrative}
              onChange={(e) => setForm((f) => ({ ...f, narrative: e.target.value }))}
              rows={4}
              className="w-full bg-[#080a0f] border border-[#1e2535] text-[#e8edf8] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
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

      {/* P3.3: Rating trend chart — category × rating CSS bars */}
      {!loading && ratings.length > 0 && (
        <div className="border border-[#1e2535] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
          <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#4a5a75] mb-4">Rating Trend by Category</h2>
          <div className="space-y-3">
            {RATING_CATEGORIES.map((cat) => {
              const inCat = ratings.filter((r) => r.category === cat);
              const total = inCat.length;
              if (total === 0) {
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <div className="w-32 text-xs text-[#8b9ab5] shrink-0">{cat}</div>
                    <div className="flex-1 text-[10px] text-[#4a5a75] italic">No ratings yet</div>
                  </div>
                );
              }
              const counts = {
                Exceptional: inCat.filter((r) => r.rating === "Exceptional").length,
                "Very Good": inCat.filter((r) => r.rating === "Very Good").length,
                Satisfactory: inCat.filter((r) => r.rating === "Satisfactory").length,
                Marginal: inCat.filter((r) => r.rating === "Marginal").length,
                Unsatisfactory: inCat.filter((r) => r.rating === "Unsatisfactory").length,
              };
              const colors: Record<string, string> = {
                Exceptional: "#22c55e",
                "Very Good": "#3b82f6",
                Satisfactory: "#9ca3af",
                Marginal: "#f59e0b",
                Unsatisfactory: "#ef4444",
              };
              return (
                <div key={cat} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-[#8b9ab5] shrink-0">{cat}</div>
                  <div className="flex-1 flex h-5 overflow-hidden border border-[#1e2535]">
                    {(Object.keys(counts) as Array<keyof typeof counts>).map((k) => {
                      const pct = (counts[k] / total) * 100;
                      if (pct === 0) return null;
                      return (
                        <div
                          key={k}
                          title={`${k}: ${counts[k]}`}
                          style={{ width: `${pct}%`, backgroundColor: colors[k] }}
                        />
                      );
                    })}
                  </div>
                  <div className="w-10 text-[10px] font-mono text-[#4a5a75] text-right">{total}</div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[#1e2535] flex-wrap">
            {[
              { label: "Exceptional", color: "#22c55e" },
              { label: "Very Good", color: "#3b82f6" },
              { label: "Satisfactory", color: "#9ca3af" },
              { label: "Marginal", color: "#f59e0b" },
              { label: "Unsatisfactory", color: "#ef4444" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2" style={{ backgroundColor: l.color }} />
                <span className="text-[10px] text-[#8b9ab5]">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ratings List */}
      {loading ? (
        <div className="text-center text-[#4a5a75] py-12">Loading ratings...</div>
      ) : ratings.length === 0 ? (
        <div className="max-w-[480px] mx-auto text-center p-12" style={{background: "linear-gradient(135deg, #fff1f2, #fff)", borderRadius: "16px", border: "1px solid rgba(225,29,72,0.08)"}}>
          <svg className="w-12 h-12 mx-auto mb-4" style={{color: "#e11d48"}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
          <div className="text-[20px] font-bold text-[#0f172a] mb-2">Track your CPARS ratings</div>
          <p className="text-sm text-[#8b9ab5] mb-6">When you receive a CPARS evaluation from a contracting officer, enter it here. If any rating is below Satisfactory, the AI generates a formal response draft.</p>
          <a href="#" className="inline-block px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 hover:-translate-y-0.5" style={{background: "#e11d48"}}>Add First Rating</a>
        </div>
      ) : (
        <div className="space-y-3">
          {ratings.map((r) => (
            <div key={r.id} className="border border-[#1e2535] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm text-[#e8edf8] font-medium">
                    {r.contracts?.title ?? "Unknown Contract"}
                  </h3>
                  <p className="text-xs text-[#4a5a75] font-medium mt-0.5">
                    {r.contracts?.contract_number} — {r.category}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.evaluation_date && (
                    <span className="text-xs font-medium text-[#4a5a75]">
                      {new Date(r.evaluation_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 text-[10px] font-medium uppercase ${ratingColor(r.rating)} ${ratingBg(r.rating)}`}>
                    {r.rating}
                  </span>
                </div>
              </div>
              <p className="text-sm text-[#8b9ab5] mb-3">{r.narrative}</p>
              {/* P3.3: response drafts now also generate thank-you / marketing
                  variants for Exceptional ratings */}
              {(r.rating === "Marginal" || r.rating === "Unsatisfactory" || r.rating === "Exceptional") && (
                <div className="flex items-center gap-3">
                  {r.response_draft ? (
                    <button
                      onClick={() => setResponseView({ id: r.id, text: r.response_draft })}
                      className="text-xs text-[#3b82f6] hover:text-[#e8edf8] transition-colors"
                    >
                      View {r.rating === "Exceptional" ? "Thank-You Draft" : "Response Draft"}
                    </button>
                  ) : (
                    <button
                      onClick={() => generateResponse(r.id)}
                      disabled={generatingId === r.id}
                      className={`px-3 py-1 text-xs text-white transition-colors disabled:opacity-50 ${
                        r.rating === "Exceptional" ? "bg-[#22c55e] hover:bg-[#16a34a]" : "bg-[#e11d48] hover:bg-[#be123c]"
                      }`}
                    >
                      {generatingId === r.id
                        ? "Generating..."
                        : r.rating === "Exceptional"
                        ? "Generate Thank-You"
                        : "Generate Response"}
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
          <div className="w-full max-w-2xl border border-[#1e2535] bg-white p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#0f172a]">CPARS Response Draft</h2>
              <button
                onClick={copyResponse}
                className="px-3 py-1 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="bg-[#080a0f] border border-[#1e2535] p-4 text-sm text-[#e8edf8] whitespace-pre-wrap">
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
