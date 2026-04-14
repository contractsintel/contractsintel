"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Statement = {
  id: string;
  title: string | null;
  markdown: string;
  source_summary: { past_performance_count?: number; naics?: string[]; certs?: string[] };
  created_at: string;
};

export default function CapabilityStatementPage() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Statement | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [retargetOpen, setRetargetOpen] = useState(false);
  const [retargeting, setRetargeting] = useState(false);
  const [retargetAgency, setRetargetAgency] = useState("");
  const [retargetOpportunity, setRetargetOpportunity] = useState("");
  const [retargetRequirements, setRetargetRequirements] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/capability-statement/generate");
      const j = await r.json();
      if (r.ok) {
        setStatements(j.statements ?? []);
        if ((j.statements ?? []).length > 0 && !active) setActive(j.statements[0]);
      } else {
        setError(j.error ?? "Failed to load");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch("/api/capability-statement/generate", { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Generation failed");
      } else if (j.statement) {
        setActive(j.statement);
        setStatements((prev) => [j.statement, ...prev]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const retarget = async () => {
    setRetargeting(true);
    setError(null);
    try {
      const r = await fetch("/api/capability-statement/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retarget: {
            agency: retargetAgency,
            opportunity: retargetOpportunity,
            requirements: retargetRequirements,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Retarget failed");
      } else if (j.statement) {
        setActive(j.statement);
        setStatements((prev) => [j.statement, ...prev]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Retarget failed");
    } finally {
      setRetargeting(false);
    }
  };

  const copy = () => {
    if (!active) return;
    navigator.clipboard.writeText(active.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    if (!active) return;
    const blob = new Blob([active.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capability-statement-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!active) return;
    setPdfLoading(true);
    try {
      const r = await fetch("/api/capability-statement/pdf");
      if (!r.ok) throw new Error("PDF download failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `capability-statement-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="ci-page-title">Capability Statement</h1>
        </div>
        <Link href="/dashboard/past-performance" className="text-xs text-[#3b82f6] hover:underline">
          ← Back to Past Performance
        </Link>
      </div>

      <div className="border border-[#e5e7eb] bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#0f172a] font-medium">AI capability statement writer</p>
            <p className="text-xs text-[#64748b] mt-1">
              Generate a 2-page capability statement from your organization profile and past performance records.
            </p>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="px-4 py-2 text-sm bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors rounded"
          >
            {generating ? "Generating..." : statements.length > 0 ? "Regenerate" : "Generate"}
          </button>
        </div>
        <div className="border-t border-[#f1f5f9] mt-4 pt-4">
          <button
            onClick={() => setRetargetOpen((v) => !v)}
            className="text-xs text-[#64748b] hover:text-[#0f172a] transition-colors"
          >
            {retargetOpen ? "Hide retargeting \u25B4" : "Retarget for specific opportunity \u25BE"}
          </button>
          {retargetOpen && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Target Agency</label>
                <input
                  type="text"
                  value={retargetAgency}
                  onChange={(e) => setRetargetAgency(e.target.value)}
                  placeholder="e.g. Department of Veterans Affairs"
                  className="w-full text-sm border border-[#e5e7eb] rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Target Opportunity / NAICS</label>
                <input
                  type="text"
                  value={retargetOpportunity}
                  onChange={(e) => setRetargetOpportunity(e.target.value)}
                  placeholder="e.g. IT Modernization / 541512"
                  className="w-full text-sm border border-[#e5e7eb] rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Key Requirements to Emphasize</label>
                <textarea
                  value={retargetRequirements}
                  onChange={(e) => setRetargetRequirements(e.target.value)}
                  placeholder="e.g. cloud migration, FedRAMP, agile"
                  rows={2}
                  className="w-full text-sm border border-[#e5e7eb] rounded px-3 py-2 resize-none"
                />
              </div>
              <button
                onClick={retarget}
                disabled={retargeting}
                className="px-4 py-2 text-sm bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors rounded"
              >
                {retargeting ? "Retargeting..." : "Retarget Statement"}
              </button>
            </div>
          )}
        </div>
        {error && <div className="mt-3 text-xs text-[#dc2626]">{error}</div>}
      </div>

      {loading ? (
        <div className="text-center text-[#94a3b8] py-12 text-sm">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <div className="border border-[#e5e7eb] bg-white rounded-xl p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-2 px-1">
              History ({statements.length})
            </p>
            {statements.length === 0 ? (
              <p className="text-xs text-[#64748b] px-1">No statements yet.</p>
            ) : (
              <ul className="space-y-1">
                {statements.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setActive(s)}
                      className={`w-full text-left px-2 py-2 rounded text-xs ${
                        active?.id === s.id ? "bg-[#eff6ff] text-[#1d4ed8]" : "text-[#64748b] hover:bg-[#f8f9fb]"
                      }`}
                    >
                      <div className="font-medium truncate">{s.title ?? "Capability Statement"}</div>
                      <div className="text-[10px] text-[#94a3b8]">
                        {new Date(s.created_at).toLocaleString()}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-[#e5e7eb] bg-white rounded-xl p-5 min-h-[320px]">
            {active ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-[#0f172a]">{active.title ?? "Capability Statement"}</h2>
                  <div className="flex items-center gap-3">
                    <button onClick={copy} className="text-xs text-[#3b82f6] hover:underline">
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button onClick={download} className="text-xs text-[#3b82f6] hover:underline">
                      Download .md
                    </button>
                    <button
                      onClick={downloadPdf}
                      disabled={pdfLoading}
                      className="text-xs text-[#3b82f6] hover:underline disabled:opacity-50"
                    >
                      {pdfLoading ? "Downloading..." : "Download PDF"}
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-[#94a3b8] mb-3 font-mono">
                  Built from {active.source_summary?.past_performance_count ?? 0} past performance records
                  {active.source_summary?.naics?.length
                    ? ` · NAICS ${active.source_summary.naics.join(", ")}`
                    : ""}
                </div>
                <pre className="whitespace-pre-wrap text-sm text-[#0f172a] leading-relaxed font-sans bg-[#f8f9fb] p-4 border border-[#e5e7eb] rounded">
                  {active.markdown}
                </pre>
              </>
            ) : (
              <div className="text-center text-[#94a3b8] py-12 text-sm">
                Generate your first capability statement to see it here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
