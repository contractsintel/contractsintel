"use client";

import { useDashboard } from "../context";
import { isDiscovery } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";

export default function PastPerformancePage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const locked = isDiscovery(organization.plan, organization);

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [generatingPpq, setGeneratingPpq] = useState<string | null>(null);
  const [ppqNarrative, setPpqNarrative] = useState<string | null>(null);
  const [ppqRecordId, setPpqRecordId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showVersionsForId, setShowVersionsForId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (locked) { setLoading(false); return; }
    const { data } = await supabase
      .from("past_performance")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  }, [organization.id, locked, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const submitLog = async () => {
    if (!selectedRecord || !logText.trim()) return;
    const record = records.find((r) => r.id === selectedRecord);
    const logs = record?.monthly_logs ?? [];
    logs.push({ date: new Date().toISOString(), text: logText });
    await supabase
      .from("past_performance")
      .update({ monthly_logs: logs })
      .eq("id", selectedRecord);
    setShowLogModal(false);
    setLogText("");
    setSelectedRecord(null);
    loadData();
  };

  const generatePpq = async (recordId: string, isRegenerate = false) => {
    setGeneratingPpq(recordId);
    setPpqNarrative(null);
    setPpqRecordId(recordId);
    try {
      const res = await fetch("/api/ppq/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_id: recordId, organization_id: organization.id }),
      });
      const data = await res.json();
      if (data.narrative) {
        setPpqNarrative(data.narrative);
        // P2.3: when regenerating, push old narrative onto versions array
        if (isRegenerate) {
          const record = records.find((r: any) => r.id === recordId);
          if (record?.ppq_narrative) {
            const existingVersions = Array.isArray(record.ppq_narrative_versions) ? record.ppq_narrative_versions : [];
            const newVersions = [
              ...existingVersions,
              { narrative: record.ppq_narrative, archived_at: new Date().toISOString() },
            ];
            await supabase
              .from("past_performance")
              .update({ ppq_narrative: data.narrative, ppq_narrative_versions: newVersions })
              .eq("id", recordId);
          } else {
            await supabase
              .from("past_performance")
              .update({ ppq_narrative: data.narrative })
              .eq("id", recordId);
          }
        } else {
          await supabase
            .from("past_performance")
            .update({ ppq_narrative: data.narrative })
            .eq("id", recordId);
        }
        loadData();
      }
    } catch {
      // handle error
    }
    setGeneratingPpq(null);
  };

  const downloadNarrative = () => {
    if (!ppqNarrative) return;
    const blob = new Blob([ppqNarrative], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ppq_narrative_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyNarrative = () => {
    if (!ppqNarrative) return;
    navigator.clipboard.writeText(ppqNarrative);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (locked) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#1e2535] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#4a5a75] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">Past Performance Builder — BD Pro Feature</h2>
            <p className="text-sm text-[#8b9ab5] mb-4">
              Build and manage past performance records with AI-generated PPQ narratives.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to BD Pro
            </Link>
          </div>
        </div>
        <div className="filter blur-[2px] opacity-40 pointer-events-none select-none" aria-hidden="true">
          <h1 className="ci-page-title">Past Performance</h1>
          <div className="space-y-3 mt-6">
            {[1,2,3].map(i => (
              <div key={i} className="border border-[#1e2535] bg-white p-5">
                <div className="h-3 w-1/2 bg-[#111520] rounded mb-3" />
                <div className="h-2 w-1/3 bg-[#111520] rounded mb-2" />
                <div className="h-2 w-2/3 bg-[#111520] rounded" />
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
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#dc2626"}} />
          <h1 className="ci-page-title">Past Performance</h1>
</div>
        <HelpButton page="past-performance" />
      </div>
      <InlineGuide page="past-performance" />
      <TrialTierBanner page="past-performance" />
      <div style={{display:'none'}}>
      </div>

      {loading ? (
        <div className="text-center text-[#4a5a75] py-12">Loading records...</div>
      ) : records.length === 0 ? (
        <div className="max-w-[480px] mx-auto text-center p-12 border border-[#1e2535] bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <svg className="w-12 h-12 mx-auto mb-4 text-[#4a5a75]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          <div className="text-[18px] font-semibold text-[#e8edf8] mb-2">Your performance library starts here</div>
          <p className="text-sm text-[#8b9ab5] mb-6">Win a contract in your Pipeline and a performance record is created automatically. Log monthly to build narratives that win future proposals.</p>
          <Link href="/dashboard/pipeline" className="inline-block px-5 py-2.5 text-sm font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors">Go to Pipeline</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <div key={record.id} className="border border-[#1e2535] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm text-[#e8edf8] font-medium">{record.contract_title}</h3>
                  <p className="text-xs text-[#8b9ab5] mt-0.5">{record.agency}</p>
                  {record.contract_number && (
                    <p className="text-xs text-[#4a5a75] font-mono mt-0.5">{record.contract_number}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedRecord(record.id);
                      setShowLogModal(true);
                    }}
                    className="px-3 py-1 text-xs border border-[#1e2535] text-[#8b9ab5] hover:border-[#2a3548] hover:text-[#e8edf8] transition-colors"
                  >
                    Log This Month
                  </button>
                  <button
                    onClick={() => generatePpq(record.id)}
                    disabled={generatingPpq === record.id}
                    className="px-3 py-1 text-xs bg-[#dc2626] text-white hover:bg-[#b91c1c] disabled:opacity-50 transition-colors"
                  >
                    {generatingPpq === record.id ? "Generating..." : "Generate PPQ"}
                  </button>
                </div>
              </div>

              {record.period_of_performance && (
                <div className="text-xs text-[#4a5a75] mb-2">
                  Period: {record.period_of_performance}
                </div>
              )}
              {record.contract_value && (
                <div className="text-xs text-[#4a5a75] mb-2">
                  Value: ${record.contract_value?.toLocaleString()}
                </div>
              )}
              {record.description && (
                <p className="text-xs text-[#8b9ab5] mb-3">{record.description}</p>
              )}

              {/* Monthly Logs */}
              {record.monthly_logs && record.monthly_logs.length > 0 && (
                <div className="border-t border-[#1e2535] pt-3 mt-3">
                  <h4 className="text-[10px] font-medium uppercase tracking-wide text-[#4a5a75] mb-2">
                    Monthly Logs ({record.monthly_logs.length})
                  </h4>
                  <div className="space-y-1">
                    {record.monthly_logs.slice(-3).map((log: any, i: number) => (
                      <div key={i} className="text-xs text-[#8b9ab5]">
                        <span className="text-[#4a5a75] font-mono">
                          {new Date(log.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}:
                        </span>{" "}
                        {log.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PPQ Narrative Viewer */}
              {ppqRecordId === record.id && ppqNarrative && (
                <div className="border-t border-[#1e2535] pt-3 mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-medium uppercase tracking-wide text-[#4a5a75]">
                      PPQ Narrative
                    </h4>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={copyNarrative}
                        className="text-xs text-[#3b82f6] hover:text-[#e8edf8] transition-colors"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={downloadNarrative}
                        className="text-xs text-[#3b82f6] hover:text-[#e8edf8] transition-colors"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => generatePpq(record.id, true)}
                        disabled={generatingPpq === record.id}
                        className="text-xs text-[#3b82f6] hover:text-[#e8edf8] transition-colors disabled:opacity-50"
                      >
                        {generatingPpq === record.id ? "Regenerating..." : "Regenerate"}
                      </button>
                      {Array.isArray(record.ppq_narrative_versions) && record.ppq_narrative_versions.length > 0 && (
                        <button
                          onClick={() => setShowVersionsForId(showVersionsForId === record.id ? null : record.id)}
                          className="text-xs text-[#3b82f6] hover:text-[#e8edf8] transition-colors"
                        >
                          {showVersionsForId === record.id ? "Hide" : "View"} previous versions
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-[#8b9ab5] whitespace-pre-wrap leading-relaxed bg-[#080a0f] p-4 border border-[#1e2535]">
                    {ppqNarrative}
                  </div>
                  {showVersionsForId === record.id && Array.isArray(record.ppq_narrative_versions) && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-[#4a5a75]">
                        {record.ppq_narrative_versions.length} previous version{record.ppq_narrative_versions.length > 1 ? "s" : ""}
                      </p>
                      {record.ppq_narrative_versions.slice().reverse().map((v: any, i: number) => (
                        <details key={i} className="border border-[#1e2535] bg-white">
                          <summary className="cursor-pointer px-3 py-2 text-xs text-[#8b9ab5]">
                            v{record.ppq_narrative_versions.length - i} —{" "}
                            {v.archived_at ? new Date(v.archived_at).toLocaleString() : "older"}
                          </summary>
                          <div className="px-3 py-2 text-xs text-[#8b9ab5] whitespace-pre-wrap border-t border-[#1e2535] bg-[#080a0f]">
                            {v.narrative}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {record.ppq_narrative && ppqRecordId !== record.id && (
                <div className="border-t border-[#1e2535] pt-3 mt-3">
                  <button
                    onClick={() => {
                      setPpqRecordId(record.id);
                      setPpqNarrative(record.ppq_narrative);
                    }}
                    className="text-xs text-[#3b82f6] hover:text-[#e8edf8] transition-colors"
                  >
                    View PPQ Narrative
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md border border-[#1e2535] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Log Monthly Performance</h2>
            <textarea
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
              rows={6}
              placeholder="Describe key accomplishments, deliverables, metrics, and any challenges this month..."
              className="w-full bg-[#fafafa] border border-[#1e2535] text-[#e8edf8] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={submitLog}
                className="flex-1 bg-[#2563eb] text-white py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors"
              >
                Save Log
              </button>
              <button
                onClick={() => { setShowLogModal(false); setLogText(""); }}
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
