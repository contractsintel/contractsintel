"use client";

import { useDashboard } from "../context";
import { isDiscovery } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";
import { ProfileBoostBanner } from "../unlock-panel";

function formatCurrency(n: number | null): string {
  if (!n) return "$0";
  return `$${n.toLocaleString()}`;
}

export default function ContractsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const locked = isDiscovery(organization.plan, organization);

  const [contracts, setContracts] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMilestoneModal, setShowMilestoneModal] = useState<string | null>(null);
  const [milestoneData, setMilestoneData] = useState({ title: "", due_date: "" });
  const [demandLetter, setDemandLetter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  const loadData = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    const { data } = await supabase
      .from("contracts")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });

    // P1.4: Fetch invoices from the real invoices table and group by contract.
    const contractIds = (data ?? []).map((c) => c.id);
    const invoicesByContract: Record<string, Record<string, any>[]> = {};
    if (contractIds.length > 0) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("*")
        .in("contract_id", contractIds)
        .order("due_date", { ascending: true });
      for (const inv of invs ?? []) {
        (invoicesByContract[inv.contract_id] ||= []).push(inv);
      }
    }
    const enriched = (data ?? []).map((c) => ({
      ...c,
      invoices: invoicesByContract[c.id] ?? c.invoices ?? [],
    }));
    setContracts(enriched);
    setLoading(false);
  }, [organization.id, locked, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addMilestone = async () => {
    if (!showMilestoneModal || !milestoneData.title) return;
    const contract = contracts.find((c) => c.id === showMilestoneModal);
    const milestones = contract?.milestones ?? [];
    milestones.push({
      id: crypto.randomUUID(),
      title: milestoneData.title,
      due_date: milestoneData.due_date,
      status: "pending",
    });
    await supabase
      .from("contracts")
      .update({ milestones })
      .eq("id", showMilestoneModal);
    setShowMilestoneModal(null);
    setMilestoneData({ title: "", due_date: "" });
    loadData();
  };

  const flagLatePayment = async (contractId: string, inv: Record<string, any>, contractTitle: string) => {
    const submittedDate = inv.submitted_date || "unknown";
    const dueDate = inv.due_date || "unknown";
    const amount = inv.amount ? `$${Number(inv.amount).toLocaleString()}` : "$0";
    const invoiceNum = inv.invoice_number || inv.number || "N/A";
    const today = new Date();
    const dueDateObj = new Date(dueDate);
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24)));

    const letter = `PROMPT PAYMENT ACT — DEMAND FOR PAYMENT

Contract: ${contractTitle}
Invoice #: ${invoiceNum}
Invoice Amount: ${amount}
Date Submitted: ${submittedDate}
Payment Due Date: ${dueDate}
Days Overdue: ${daysOverdue}

Dear Contracting Officer,

Under the Prompt Payment Act (31 USC §3901–3907) and FAR 52.232-25, the federal government is required to pay proper invoices within 30 calendar days of receipt. Invoice #${invoiceNum} for ${amount} was submitted on ${submittedDate} and payment is now ${daysOverdue} days overdue.

Interest penalties accrue automatically under the Act at the rate established by the Secretary of the Treasury. As of this notice, the accrued interest penalty is calculated from the payment due date of ${dueDate}.

We respectfully request immediate processing and payment of this invoice, along with any applicable interest penalties as required by law.

Please contact us if there are any questions regarding this invoice or if additional documentation is needed to process payment.

Respectfully,
${(organization.name || "[Your Company Name]").split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`;

    setDemandLetter(letter);

    // Persist the demand letter to demand_letters AND mark invoice overdue
    await Promise.all([
      supabase
        .from("demand_letters")
        .insert({ invoice_id: inv.id, body: letter }),
      supabase
        .from("invoices")
        .update({ status: "overdue" })
        .eq("id", inv.id),
    ]);
    loadData();
  };

  if (locked) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#e5e7eb] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#94a3b8] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">Contract Delivery — BD Pro Feature</h2>
            <p className="text-sm text-[#64748b] mb-4">
              Manage active contracts, milestones, invoices, and option periods.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to BD Pro
            </Link>
          </div>
        </div>
        <div className="filter blur-[2px] opacity-40 pointer-events-none select-none" aria-hidden="true">
          <h1 className="ci-page-title">Contracts</h1>
          <div className="space-y-3 mt-6">
            {[1,2,3].map(i => (
              <div key={i} className="border border-[#e5e7eb] bg-white p-5">
                <div className="h-3 w-1/2 bg-[#f1f5f9] rounded mb-3" />
                <div className="h-2 w-1/3 bg-[#f1f5f9] rounded mb-2" />
                <div className="h-2 w-1/4 bg-[#f1f5f9] rounded" />
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
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#0891b2"}} />
          <h1 className="ci-page-title">Contract Delivery</h1>
</div>
        <HelpButton page="contracts" />
      </div>
      <InlineGuide page="contracts" />
      <TrialTierBanner page="contracts" />
      <ProfileBoostBanner context="dashboard" />

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => setView("list")}
          className={`px-3 py-1.5 text-xs font-medium border ${view === "list" ? "bg-[#111827] text-white border-[#111827]" : "bg-white text-[#64748b] border-[#e5e7eb] hover:border-[#d1d5db]"}`}
        >
          List
        </button>
        <button
          onClick={() => setView("calendar")}
          className={`px-3 py-1.5 text-xs font-medium border ${view === "calendar" ? "bg-[#111827] text-white border-[#111827]" : "bg-white text-[#64748b] border-[#e5e7eb] hover:border-[#d1d5db]"}`}
        >
          Calendar
        </button>
      </div>

      {loading ? (
        <div className="text-center text-[#94a3b8] py-12">Loading contracts...</div>
      ) : contracts.length === 0 ? (
        <div className="max-w-[480px] mx-auto text-center p-12" style={{background: "linear-gradient(135deg, #ecfeff, #fff)", borderRadius: "16px", border: "1px solid rgba(8,145,178,0.08)"}}>
          <svg className="w-12 h-12 mx-auto mb-4" style={{color: "#0891b2"}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></svg>
          <div className="text-[20px] font-bold text-[#0f172a] mb-2">Your delivery dashboard awaits</div>
          <p className="text-sm text-[#64748b] mb-6">When you win a contract in the Pipeline, your delivery dashboard activates automatically with milestones, invoices, and deadline tracking.</p>
          <a href="/dashboard/pipeline" className="inline-block px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 hover:-translate-y-0.5" style={{background: "#0891b2"}}>Go to Pipeline</a>
        </div>
      ) : view === "calendar" ? (
        <ContractsCalendarView contracts={contracts} month={calendarMonth} setMonth={setCalendarMonth} />
      ) : (
        <div className="space-y-6">
          {contracts.map((contract) => (
            <div key={contract.id} className="border border-[#e5e7eb] bg-white">
              {/* Contract Header */}
              <div className="p-5 border-b border-[#e5e7eb]">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm text-[#0f172a] font-medium">{contract.title}</h3>
                    <p className="text-xs text-[#64748b] mt-0.5">{contract.agency}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs font-mono text-[#94a3b8]">{contract.contract_number}</span>
                      <span className="text-xs font-mono text-[#0f172a]">{formatCurrency(contract.value)}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-mono uppercase ${
                        contract.status === "active"
                          ? "bg-[#22c55e]/10 text-[#22c55e]"
                          : "bg-[#9ca3af]/10 text-[#94a3b8]"
                      }`}>
                        {contract.status}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMilestoneModal(contract.id)}
                    className="px-3 py-1 text-xs bg-[#0891b2] text-white hover:bg-[#0e7490] transition-colors"
                  >
                    Add Milestone
                  </button>
                </div>
              </div>

              {/* Milestones */}
              {contract.milestones && contract.milestones.length > 0 && (
                <div className="p-5 border-b border-[#e5e7eb]">
                  <h4 className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-3">
                    Milestones
                  </h4>
                  <div className="space-y-2">
                    {contract.milestones.map((ms: Record<string, any>) => (
                      <div key={ms.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 ${
                            ms.status === "complete" ? "bg-[#22c55e]" : ms.status === "in_progress" ? "bg-[#3b82f6]" : "bg-[#9ca3af]"
                          }`} />
                          <span className="text-xs text-[#0f172a]">{ms.title}</span>
                        </div>
                        <span className="text-xs font-mono text-[#94a3b8]">
                          {ms.due_date ? new Date(ms.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Option Periods */}
              {contract.option_periods && contract.option_periods.length > 0 && (
                <div className="p-5 border-b border-[#e5e7eb]">
                  <h4 className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-3">
                    Option Periods
                  </h4>
                  <div className="space-y-2">
                    {contract.option_periods.map((op: Record<string, any>) => (
                      <div key={op.id} className="flex items-center justify-between">
                        <span className="text-xs text-[#0f172a]">{op.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-[#94a3b8]">
                            {op.start_date} — {op.end_date}
                          </span>
                          <span className={`text-[10px] font-mono ${op.exercised ? "text-[#22c55e]" : "text-[#94a3b8]"}`}>
                            {op.exercised ? "EXERCISED" : "PENDING"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invoices */}
              {contract.invoices && contract.invoices.length > 0 && (
                <div className="p-5">
                  <h4 className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-3">
                    Invoices
                  </h4>
                  <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
                  <table className="w-full min-w-[520px]">
                    <thead>
                      <tr className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8]">
                        <th className="text-left pb-2">Invoice #</th>
                        <th className="text-right pb-2">Amount</th>
                        <th className="text-right pb-2">Submitted</th>
                        <th className="text-right pb-2">Status</th>
                        <th className="text-right pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contract.invoices.map((inv: Record<string, any>) => (
                        <tr key={inv.id} className="border-t border-[#e5e7eb]">
                          <td className="py-2 text-xs text-[#0f172a] font-mono">{inv.invoice_number || inv.number || "—"}</td>
                          <td className="py-2 text-xs text-[#0f172a] font-mono text-right">
                            {formatCurrency(inv.amount)}
                          </td>
                          <td className="py-2 text-xs text-[#94a3b8] font-mono text-right">
                            {inv.submitted_date
                              ? new Date(inv.submitted_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "—"}
                          </td>
                          <td className="py-2 text-right">
                            <span className={`text-[10px] font-mono uppercase ${
                              inv.status === "paid"
                                ? "text-[#22c55e]"
                                : inv.status === "overdue"
                                ? "text-[#ef4444]"
                                : "text-[#f59e0b]"
                            }`}>
                              {inv.status || "submitted"}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {inv.status !== "paid" && (
                              <button
                                onClick={() => flagLatePayment(contract.id, inv, contract.title)}
                                className="text-[10px] text-[#ef4444] hover:text-[#f87171] transition-colors"
                              >
                                {inv.status === "overdue" ? "View Letter" : "Flag Late →"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Milestone Modal */}
      {showMilestoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md border border-[#e5e7eb] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Add Milestone</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">
                  Title
                </label>
                <input
                  type="text"
                  value={milestoneData.title}
                  onChange={(e) => setMilestoneData((d) => ({ ...d, title: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">
                  Due Date
                </label>
                <input
                  type="date"
                  value={milestoneData.due_date}
                  onChange={(e) => setMilestoneData((d) => ({ ...d, due_date: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={addMilestone}
                className="flex-1 bg-[#2563eb] text-white py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
              >
                Add Milestone
              </button>
              <button
                onClick={() => setShowMilestoneModal(null)}
                className="flex-1 border border-[#e5e7eb] text-[#64748b] py-2 text-sm hover:border-[#d1d5db] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demand Letter Modal */}
      {demandLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-2xl border border-[#e5e7eb] bg-white p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#0f172a]">Prompt Payment Act — Demand Letter</h2>
              <button onClick={() => setDemandLetter(null)} className="text-[#94a3b8] hover:text-[#0f172a] text-xl">&times;</button>
            </div>
            <div className="bg-[#f8f9fb] border border-[#e5e7eb] p-6 mb-4">
              <pre className="text-xs text-[#0f172a] font-mono whitespace-pre-wrap leading-relaxed">{demandLetter}</pre>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { navigator.clipboard.writeText(demandLetter); }}
                className="flex-1 bg-[#2563eb] text-white py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setDemandLetter(null)}
                className="flex-1 border border-[#e5e7eb] text-[#64748b] py-2 text-sm hover:border-[#d1d5db] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// P1.4: Monthly grid view of contract deliverables, reports, invoices, and option periods.
type CalendarEvent = {
  id: string;
  date: Date;
  title: string;
  type: "deliverable" | "report" | "invoice" | "option";
  contractTitle: string;
};

const TYPE_COLORS: Record<CalendarEvent["type"], string> = {
  deliverable: "bg-[#dbeafe] text-[#1d4ed8] border-[#93c5fd]",
  report: "bg-[#ede9fe] text-[#6d28d9] border-[#c4b5fd]",
  invoice: "bg-[#dcfce7] text-[#15803d] border-[#86efac]",
  option: "bg-[#fef3c7] text-[#a16207] border-[#fde68a]",
};

function ContractsCalendarView({
  contracts,
  month,
  setMonth,
}: {
  contracts: Record<string, any>[];
  month: Date;
  setMonth: (d: Date) => void;
}) {
  // Build event list from all contracts' milestones, invoices, option periods
  const events: CalendarEvent[] = [];
  for (const c of contracts) {
    const ctitle = c.title || "Untitled contract";
    for (const ms of c.milestones || []) {
      if (!ms.due_date) continue;
      const t: CalendarEvent["type"] = (ms.title || "").toLowerCase().includes("report") ? "report" : "deliverable";
      events.push({ id: `m-${ms.id}`, date: new Date(ms.due_date), title: ms.title || "Milestone", type: t, contractTitle: ctitle });
    }
    for (const inv of c.invoices || []) {
      const d = inv.due_date || inv.submitted_date;
      if (!d) continue;
      events.push({
        id: `i-${inv.id}`,
        date: new Date(d),
        title: `Invoice ${inv.invoice_number || ""}`.trim(),
        type: "invoice",
        contractTitle: ctitle,
      });
    }
    for (const op of c.option_periods || []) {
      if (!op.start_date) continue;
      events.push({
        id: `o-${op.id}`,
        date: new Date(op.start_date),
        title: op.label || "Option period",
        type: "option",
        contractTitle: ctitle,
      });
    }
  }

  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const lastDay = new Date(year, m + 1, 0);
  const startWeekday = firstDay.getDay(); // 0 = Sun
  const daysInMonth = lastDay.getDate();

  // Build a 6x7 grid (42 cells)
  const cells: { date: Date | null; events: CalendarEvent[] }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, events: [] });
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(year, m, d);
    const dayEvents = events.filter(
      (e) =>
        e.date.getFullYear() === year &&
        e.date.getMonth() === m &&
        e.date.getDate() === d
    );
    cells.push({ date: cellDate, events: dayEvents });
  }
  while (cells.length < 42) cells.push({ date: null, events: [] });

  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const goPrev = () => setMonth(new Date(year, m - 1, 1));
  const goNext = () => setMonth(new Date(year, m + 1, 1));
  const goToday = () => setMonth(new Date());

  return (
    <div className="border border-[#e5e7eb] bg-white rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#e5e7eb]">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="px-2 py-1 text-xs border border-[#e5e7eb] hover:border-[#d1d5db] rounded">
            ←
          </button>
          <button onClick={goToday} className="px-3 py-1 text-xs border border-[#e5e7eb] hover:border-[#d1d5db] rounded">
            Today
          </button>
          <button onClick={goNext} className="px-2 py-1 text-xs border border-[#e5e7eb] hover:border-[#d1d5db] rounded">
            →
          </button>
          <h3 className="text-sm font-semibold text-[#0f172a] ml-2">{monthLabel}</h3>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          {(["deliverable", "report", "invoice", "option"] as const).map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 border ${TYPE_COLORS[t].split(" ").slice(0, 1).join(" ")}`} />
              <span className="text-[#64748b] capitalize">{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekday header */}
      <div className="overflow-x-auto">
      <div className="min-w-[560px]">
      <div className="grid grid-cols-7 border-b border-[#e5e7eb]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 grid-rows-6">
        {cells.map((cell, i) => {
          const isToday =
            cell.date &&
            cell.date.toDateString() === new Date().toDateString();
          return (
            <div
              key={i}
              className={`min-h-[88px] border-r border-b border-[#e5e7eb] p-1.5 ${
                cell.date ? "" : "bg-[#fafbfc]"
              }`}
            >
              {cell.date && (
                <div className={`text-[11px] font-mono mb-1 ${isToday ? "text-[#2563eb] font-bold" : "text-[#94a3b8]"}`}>
                  {cell.date.getDate()}
                </div>
              )}
              <div className="space-y-0.5">
                {cell.events.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    title={`${ev.title} — ${ev.contractTitle}`}
                    className={`text-[10px] px-1.5 py-0.5 truncate border ${TYPE_COLORS[ev.type]}`}
                  >
                    {ev.title}
                  </div>
                ))}
                {cell.events.length > 3 && (
                  <div className="text-[10px] text-[#64748b] px-1.5">+{cell.events.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
      </div>
    </div>
  );
}
