"use client";
"use client";

import { useDashboard } from "../context";
import { isDiscovery } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";

function formatCurrency(n: number | null): string {
  if (!n) return "$0";
  return `$${n.toLocaleString()}`;
}

export default function ContractsPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const locked = isDiscovery(organization.plan, organization);

  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMilestoneModal, setShowMilestoneModal] = useState<string | null>(null);
  const [milestoneData, setMilestoneData] = useState({ title: "", due_date: "" });
  const [demandLetter, setDemandLetter] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    const { data } = await supabase
      .from("contracts")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    setContracts(data ?? []);
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

  const flagLatePayment = async (contractId: string, inv: any, contractTitle: string) => {
    const submittedDate = inv.submitted_date || inv.date || "unknown";
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

    // Mark invoice as flagged in DB
    await supabase
      .from("invoices")
      .update({ demand_letter_sent: true, demand_letter_date: today.toISOString().split("T")[0] })
      .eq("id", inv.id);
    loadData();
  };

  if (locked) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#e5e7eb] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-serif text-[#111827] mb-2">Contract Delivery — BD Pro Feature</h2>
            <p className="text-sm text-[#4b5563] mb-4">
              Manage active contracts, milestones, invoices, and option periods.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to BD Pro
            </Link>
          </div>
        </div>
        <div className="filter blur-sm opacity-40 pointer-events-none">
          <h1 className="text-2xl font-serif text-[#111827] mb-6">Contracts</h1>
          <div className="border border-[#e5e7eb] bg-white p-12 text-center text-[#9ca3af]">
            Sample contracts content...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-[#111827]">Contract Delivery</h1>
        <HelpButton page="contracts" />
      </div>
      <InlineGuide page="contracts" />
      <TrialTierBanner page="contracts" />
      <div style={{display:'none'}}>
      </div>

      {loading ? (
        <div className="text-center text-[#9ca3af] py-12">Loading contracts...</div>
      ) : contracts.length === 0 ? (
        <div className="border border-[#e5e7eb] bg-white p-12 text-center">
          <div className="text-[#9ca3af] text-lg mb-2">No active contracts</div>
          <p className="text-sm text-[#4b5563]">
            Won contracts will appear here for delivery tracking.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {contracts.map((contract) => (
            <div key={contract.id} className="border border-[#e5e7eb] bg-white">
              {/* Contract Header */}
              <div className="p-5 border-b border-[#e5e7eb]">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm text-[#111827] font-medium">{contract.title}</h3>
                    <p className="text-xs text-[#4b5563] mt-0.5">{contract.agency}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs font-mono text-[#9ca3af]">{contract.contract_number}</span>
                      <span className="text-xs font-mono text-[#111827]">{formatCurrency(contract.value)}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-mono uppercase ${
                        contract.status === "active"
                          ? "bg-[#22c55e]/10 text-[#22c55e]"
                          : "bg-[#9ca3af]/10 text-[#9ca3af]"
                      }`}>
                        {contract.status}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMilestoneModal(contract.id)}
                    className="px-3 py-1 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors"
                  >
                    Add Milestone
                  </button>
                </div>
              </div>

              {/* Milestones */}
              {contract.milestones && contract.milestones.length > 0 && (
                <div className="p-5 border-b border-[#e5e7eb]">
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
                    Milestones
                  </h4>
                  <div className="space-y-2">
                    {contract.milestones.map((ms: any) => (
                      <div key={ms.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 ${
                            ms.status === "complete" ? "bg-[#22c55e]" : ms.status === "in_progress" ? "bg-[#3b82f6]" : "bg-[#9ca3af]"
                          }`} />
                          <span className="text-xs text-[#111827]">{ms.title}</span>
                        </div>
                        <span className="text-xs font-mono text-[#9ca3af]">
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
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
                    Option Periods
                  </h4>
                  <div className="space-y-2">
                    {contract.option_periods.map((op: any) => (
                      <div key={op.id} className="flex items-center justify-between">
                        <span className="text-xs text-[#111827]">{op.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-[#9ca3af]">
                            {op.start_date} — {op.end_date}
                          </span>
                          <span className={`text-[10px] font-mono ${op.exercised ? "text-[#22c55e]" : "text-[#9ca3af]"}`}>
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
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af] mb-3">
                    Invoices
                  </h4>
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase tracking-wider text-[#9ca3af]">
                        <th className="text-left pb-2">Invoice #</th>
                        <th className="text-right pb-2">Amount</th>
                        <th className="text-right pb-2">Submitted</th>
                        <th className="text-right pb-2">Status</th>
                        <th className="text-right pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contract.invoices.map((inv: any) => (
                        <tr key={inv.id} className="border-t border-[#e5e7eb]">
                          <td className="py-2 text-xs text-[#111827] font-mono">{inv.number}</td>
                          <td className="py-2 text-xs text-[#111827] font-mono text-right">
                            {formatCurrency(inv.amount)}
                          </td>
                          <td className="py-2 text-xs text-[#9ca3af] font-mono text-right">
                            {inv.submitted_date
                              ? new Date(inv.submitted_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "--"}
                          </td>
                          <td className="py-2 text-right">
                            <span className={`text-[10px] font-mono uppercase ${
                              inv.status === "paid"
                                ? "text-[#22c55e]"
                                : inv.flagged_late
                                ? "text-[#ef4444]"
                                : "text-[#f59e0b]"
                            }`}>
                              {inv.flagged_late ? "LATE" : inv.status}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {inv.status !== "paid" && (
                              <button
                                onClick={() => flagLatePayment(contract.id, inv, contract.title)}
                                className="text-[10px] text-[#ef4444] hover:text-[#f87171] transition-colors"
                              >
                                {inv.demand_letter_sent ? "View Letter" : "Flag Late →"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
            <h2 className="text-lg font-serif text-[#111827] mb-4">Add Milestone</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">
                  Title
                </label>
                <input
                  type="text"
                  value={milestoneData.title}
                  onChange={(e) => setMilestoneData((d) => ({ ...d, title: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#4b5563] mb-1 font-mono uppercase tracking-wider">
                  Due Date
                </label>
                <input
                  type="date"
                  value={milestoneData.due_date}
                  onChange={(e) => setMilestoneData((d) => ({ ...d, due_date: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#111827] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
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
                className="flex-1 border border-[#e5e7eb] text-[#4b5563] py-2 text-sm hover:border-[#d1d5db] transition-colors"
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
              <h2 className="text-lg font-serif text-[#111827]">Prompt Payment Act — Demand Letter</h2>
              <button onClick={() => setDemandLetter(null)} className="text-[#9ca3af] hover:text-[#111827] text-xl">&times;</button>
            </div>
            <div className="bg-[#f8f9fb] border border-[#e5e7eb] p-6 mb-4">
              <pre className="text-xs text-[#111827] font-mono whitespace-pre-wrap leading-relaxed">{demandLetter}</pre>
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
                className="flex-1 border border-[#e5e7eb] text-[#4b5563] py-2 text-sm hover:border-[#d1d5db] transition-colors"
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
