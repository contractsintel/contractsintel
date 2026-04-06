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
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0f172a] mb-6">Competitor Intelligence</h1>
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
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0f172a]">Competitor Intelligence</h1>
            <div className="w-10 h-[3px] rounded-full mt-2" style={{backgroundColor: "#7c3aed"}} />
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
