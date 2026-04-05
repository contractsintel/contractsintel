"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { HelpButton } from "../help-panel";

const CATEGORIES = [
  { key: "sam", label: "SAM.gov Registration", icon: "S" },
  { key: "certs", label: "Certifications", icon: "C" },
  { key: "cmmc", label: "CMMC Readiness", icon: "M" },
  { key: "compliance", label: "Compliance Items", icon: "F" },
];

function urgencyColor(dueDate: string | null): string {
  if (!dueDate) return "text-[#4a5a75]";
  const d = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (d <= 3) return "text-[#ef4444]";
  if (d <= 7) return "text-[#f59e0b]";
  if (d <= 30) return "text-[#3b82f6]";
  return "text-[#22c55e]";
}

function urgencyBorder(dueDate: string | null): string {
  if (!dueDate) return "border-l-[#4a5a75]";
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
        <h1 className="text-2xl font-serif text-[#e8edf8]">Compliance Monitor</h1>
        <HelpButton page="compliance" />
      </div>

      {loading ? (
        <div className="text-center text-[#4a5a75] py-12">Loading compliance data...</div>
      ) : (
        <>
          {/* Health Score */}
          <div className="border border-[#1e2535] bg-[#0d1018] p-6 mb-6">
            <div className="flex items-center gap-8">
              <div>
                <div className={`text-5xl font-bold font-mono ${healthColor}`}>
                  {items.length > 0 ? healthScore : "--"}
                </div>
                <div className="text-xs text-[#4a5a75] font-mono uppercase tracking-wider mt-1">
                  Health Score
                </div>
              </div>
              <div className="flex-1">
                <div className="w-full h-3 bg-[#111520]">
                  <div
                    className={`h-full ${healthBarColor} transition-all`}
                    style={{ width: items.length > 0 ? `${healthScore}%` : "0%" }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-xs text-[#4a5a75]">
                    {completedItems} of {items.length} items complete
                  </span>
                  <span className="text-xs text-[#4a5a75]">
                    {items.length - completedItems} pending
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="grid grid-cols-4 gap-px bg-[#1e2535] border border-[#1e2535] mb-6">
            {grouped.map((cat) => {
              const pct = cat.total > 0 ? Math.round((cat.complete / cat.total) * 100) : 0;
              const catColor =
                pct >= 80 ? "text-[#22c55e]" : pct >= 60 ? "text-[#f59e0b]" : cat.total === 0 ? "text-[#4a5a75]" : "text-[#ef4444]";
              return (
                <div key={cat.key} className="bg-[#0d1018] p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-[#111520] flex items-center justify-center text-[10px] font-mono text-[#8b9ab5]">
                      {cat.icon}
                    </div>
                    <span className="text-xs text-[#8b9ab5]">{cat.label}</span>
                  </div>
                  <div className={`text-2xl font-bold font-mono ${catColor}`}>
                    {cat.total > 0 ? `${pct}%` : "--"}
                  </div>
                  <div className="text-[10px] text-[#4a5a75] font-mono mt-1">
                    {cat.complete}/{cat.total} complete
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upcoming Deadlines */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-3">
                Upcoming Deadlines
              </h2>
              {upcoming.length === 0 ? (
                <div className="border border-[#1e2535] bg-[#0d1018] p-6 text-center text-sm text-[#4a5a75]">
                  No pending deadlines
                </div>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((item) => (
                    <div
                      key={item.id}
                      className={`border border-[#1e2535] border-l-4 ${urgencyBorder(item.due_date)} bg-[#0d1018] p-4`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm text-[#e8edf8]">{item.title}</h3>
                          <p className="text-xs text-[#4a5a75] mt-0.5">{item.category.toUpperCase()}</p>
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
                        <p className="text-xs text-[#4a5a75] mt-2">{item.details}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* FAR Change Alerts */}
              <div>
                <h2 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-3">
                  FAR Change Alerts
                </h2>
                <div className="border border-[#1e2535] bg-[#0d1018] p-6 text-center">
                  <div className="text-sm text-[#4a5a75]">No recent FAR changes affecting your profile</div>
                  <p className="text-xs text-[#4a5a75] mt-1">
                    We monitor Federal Acquisition Regulation updates relevant to your certifications.
                  </p>
                </div>
              </div>

              {/* CMMC Tracker */}
              <div>
                <h2 className="text-xs font-mono uppercase tracking-wider text-[#4a5a75] mb-3">
                  CMMC Readiness
                </h2>
                <div className="border border-[#1e2535] bg-[#0d1018] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-[#e8edf8]">Target Level</span>
                    <span className="text-sm font-mono text-[#3b82f6]">
                      {organization.plan === "team" ? "Level 2" : "Level 1"}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#111520] mb-2">
                    <div className="h-full bg-[#3b82f6] w-0 transition-all" />
                  </div>
                  <p className="text-xs text-[#4a5a75]">
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
