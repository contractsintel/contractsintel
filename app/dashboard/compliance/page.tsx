"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { HelpButton } from "../help-panel";
import { InlineGuide } from "../inline-guide";
import { ProfileBoostBanner } from "../unlock-panel";

const CATEGORIES = [
  { key: "registration", label: "SAM.gov Registration", icon: "S" },
  { key: "certifications", label: "Certifications", icon: "C" },
  { key: "cybersecurity", label: "CMMC Readiness", icon: "M" },
  { key: "quality", label: "Quality & Compliance", icon: "Q" },
  { key: "accounting", label: "Accounting & Bonding", icon: "A" },
];

function urgencyColor(dueDate: string | null): string {
  if (!dueDate) return "text-[#94a3b8]";
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
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [farAlerts, setFarAlerts] = useState<Record<string, any>[]>([]);
  const [expandedFar, setExpandedFar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cmmcCurrent, setCmmcCurrent] = useState<number>(organization.cmmc_current_level ?? 0);
  const [cmmcTarget, setCmmcTarget] = useState<number>(organization.cmmc_target_level ?? (organization.plan === "team" ? 2 : 1));
  const [cmmcSaving, setCmmcSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [itemsRes, farRes] = await Promise.all([
      supabase
        .from("compliance_items")
        .select("id, title, category, status, due_date, details")
        .eq("organization_id", organization.id)
        .neq("category", "far_change")
        .order("due_date", { ascending: true }),
      supabase
        .from("compliance_items")
        .select("id, title, category, effective_date, details")
        .eq("category", "far_change")
        .order("effective_date", { ascending: false })
        .limit(5),
    ]);

    let items = itemsRes.data ?? [];

    // C3/B6: If the org has no compliance items yet, seed the default
    // checklist so the health score is computable on first visit.
    if (items.length === 0) {
      try {
        const res = await fetch("/api/compliance/seed", { method: "POST" });
        if (res.ok) {
          const { seeded } = await res.json();
          if (seeded) {
            const { data: reloaded } = await supabase
              .from("compliance_items")
              .select("id, title, category, status, due_date, details")
              .eq("organization_id", organization.id)
              .neq("category", "far_change")
              .order("due_date", { ascending: true });
            items = reloaded ?? [];
          }
        }
      } catch {
        /* swallow — still render the page with empty state */
      }
    }

    setItems(items);
    setFarAlerts(farRes.data ?? []);
    setLoading(false);
  }, [organization.id, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-sync CMMC state when org changes
  useEffect(() => {
    setCmmcCurrent(organization.cmmc_current_level ?? 0);
    setCmmcTarget(organization.cmmc_target_level ?? (organization.plan === "team" ? 2 : 1));
  }, [organization]);

  const saveCmmcLevel = async (newLevel: number) => {
    setCmmcSaving(true);
    setCmmcCurrent(newLevel);
    await supabase
      .from("organizations")
      .update({ cmmc_current_level: newLevel, cmmc_last_assessment: new Date().toISOString().slice(0, 10) })
      .eq("id", organization.id);
    setCmmcSaving(false);
  };

  // Calculate health score
  const { totalItems, completedItems, healthScore, healthColor, healthBarColor } = useMemo(() => {
    const total = items.length || 1;
    const completed = items.filter((i) => i.status === "complete" || i.status === "passed").length;
    const score = Math.round((completed / total) * 100);
    return {
      totalItems: total,
      completedItems: completed,
      healthScore: score,
      healthColor: score >= 80 ? "text-[#22c55e]" : score >= 60 ? "text-[#f59e0b]" : "text-[#ef4444]",
      healthBarColor: score >= 80 ? "bg-[#22c55e]" : score >= 60 ? "bg-[#f59e0b]" : "bg-[#ef4444]",
    };
  }, [items]);

  // Group by category
  const grouped = useMemo(() => CATEGORIES.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category === cat.key),
    complete: items.filter((i) => i.category === cat.key && (i.status === "complete" || i.status === "passed")).length,
    total: items.filter((i) => i.category === cat.key).length,
  })), [items]);

  // Upcoming deadlines
  const upcoming = useMemo(() => items
    .filter((i) => i.due_date && i.status !== "complete" && i.status !== "passed")
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 10), [items]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#059669"}} />
          <h1 className="ci-page-title">Compliance Monitor</h1>
</div>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard/compliance/certifications"
            className="text-xs text-[#059669] hover:underline"
          >
            Certification advisor →
          </a>
          <a
            href="/dashboard/compliance/matrix"
            className="text-xs text-[#2563eb] hover:underline"
          >
            Compliance matrices →
          </a>
          <HelpButton page="compliance" />
        </div>
      </div>
      <InlineGuide page="compliance" />
      <ProfileBoostBanner context="dashboard" />

      {loading ? (
        <div className="text-center text-[#94a3b8] py-12">Loading compliance data...</div>
      ) : (
        <>
          {/* Health Score */}
          <div className="border border-[#e5e7eb] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
            <div className="flex items-center gap-8">
              <div>
                <div className={`text-5xl font-bold font-mono ${healthColor}`}>
                  {items.length > 0 ? healthScore : "--"}
                </div>
                <div className="text-xs text-[#94a3b8] font-medium uppercase tracking-wide mt-1">
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
                  <span className="text-xs text-[#94a3b8]">
                    {completedItems} of {items.length} items complete
                  </span>
                  <span className="text-xs text-[#94a3b8]">
                    {items.length - completedItems} pending
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {grouped.map((cat) => {
              const pct = cat.total > 0 ? Math.round((cat.complete / cat.total) * 100) : 0;
              const catColor =
                pct >= 80 ? "text-[#22c55e]" : pct >= 60 ? "text-[#f59e0b]" : cat.total === 0 ? "text-[#94a3b8]" : "text-[#ef4444]";
              return (
                <div key={cat.key} className="bg-white p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-[#f8f9fb] flex items-center justify-center text-[10px] font-mono text-[#64748b]">
                      {cat.icon}
                    </div>
                    <span className="text-xs text-[#64748b]">{cat.label}</span>
                  </div>
                  <div className={`text-2xl font-bold font-mono ${catColor}`}>
                    {cat.total > 0 ? `${pct}%` : "--"}
                  </div>
                  <div className="text-[10px] text-[#94a3b8] font-mono mt-1">
                    {cat.complete}/{cat.total} complete
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upcoming Deadlines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h2 className="text-xs font-medium uppercase tracking-wide text-[#94a3b8] mb-3">
                Upcoming Deadlines
              </h2>
              {upcoming.length === 0 ? (
                <div className="border border-[#e5e7eb] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center text-sm text-[#94a3b8]">
                  No pending deadlines
                </div>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((item) => (
                    <div
                      key={item.id}
                      className={`border border-[#e5e7eb] border-l-4 ${urgencyBorder(item.due_date)} bg-white p-4`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm text-[#0f172a]">{item.title}</h3>
                          <p className="text-xs text-[#94a3b8] mt-0.5">{item.category.toUpperCase()}</p>
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
                        <p className="text-xs text-[#94a3b8] mt-2">{item.details}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* FAR Change Alerts */}
              <div>
                <h2 className="text-xs font-medium uppercase tracking-wide text-[#94a3b8] mb-3">
                  FAR Change Alerts
                </h2>
                {farAlerts.length === 0 ? (
                  <div className="border border-[#e5e7eb] bg-white p-6 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
                    <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#f8f9fb] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </div>
                    <div className="text-sm text-[#94a3b8]">No recent FAR changes affecting your profile</div>
                    <p className="text-xs text-[#94a3b8] mt-1">
                      We monitor Federal Acquisition Regulation updates relevant to your certifications.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {farAlerts.map((alert) => {
                      const isOpen = expandedFar === alert.id;
                      return (
                        <div key={alert.id} className="border border-[#e5e7eb] bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                          <button
                            onClick={() => setExpandedFar(isOpen ? null : alert.id)}
                            className="w-full text-left px-4 py-3 hover:bg-[#f8f9fb] transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-medium text-[#0f172a] truncate">{alert.title}</h3>
                                {alert.effective_date && (
                                  <p className="text-xs text-[#94a3b8] mt-0.5 font-mono">
                                    Effective {new Date(alert.effective_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  </p>
                                )}
                              </div>
                              <svg className={`w-4 h-4 text-[#94a3b8] shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>
                          {isOpen && alert.details && (
                            <div className="px-4 pb-4 pt-1 border-t border-[#e5e7eb]">
                              <p className="text-xs text-[#64748b] whitespace-pre-wrap">{alert.details}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* CMMC Tracker */}
              <div>
                <h2 className="text-xs font-medium uppercase tracking-wide text-[#94a3b8] mb-3">
                  CMMC Readiness
                </h2>
                <div className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-[#0f172a]">Current / Target</span>
                    <span className="text-sm font-mono text-[#3b82f6]">
                      Level {cmmcCurrent} / Level {cmmcTarget}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#f8f9fb] mb-3">
                    <div
                      className="h-full bg-[#3b82f6] transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((cmmcCurrent / Math.max(cmmcTarget, 1)) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs text-[#94a3b8]">Set current level:</label>
                    <select
                      value={cmmcCurrent}
                      onChange={(e) => saveCmmcLevel(parseInt(e.target.value, 10))}
                      disabled={cmmcSaving}
                      className="text-xs font-mono border border-[#e5e7eb] bg-white px-2 py-1 rounded"
                    >
                      <option value={0}>Level 0 — Not assessed</option>
                      <option value={1}>Level 1 — Foundational</option>
                      <option value={2}>Level 2 — Advanced</option>
                      <option value={3}>Level 3 — Expert</option>
                    </select>
                  </div>
                  {organization.cmmc_last_assessment && (
                    <p className="text-[10px] text-[#94a3b8] font-mono mt-2">
                      Last assessed {new Date(organization.cmmc_last_assessment).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
