"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MatrixSummary = {
  id: string;
  opportunity_id: string | null;
  source_label: string | null;
  created_at: string;
  row_count: number;
};

export default function ComplianceMatrixIndexPage() {
  const [matrices, setMatrices] = useState<MatrixSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [rfpText, setRfpText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadList() {
    setLoading(true);
    try {
      const res = await fetch("/api/compliance/matrix");
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed to load");
      setMatrices(j.matrices ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  async function createMatrix() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/compliance/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfp_text: rfpText,
          source_label: sourceLabel || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed to extract");
      setShowNew(false);
      setRfpText("");
      setSourceLabel("");
      await loadList();
      if (j?.matrix?.id) {
        window.location.assign(`/dashboard/compliance/matrix/${j.matrix.id}`);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to extract");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="ci-page-title">Compliance Matrices</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Auto-extract Section L/M shall-statements from any RFP and assign owners.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 text-sm bg-[#2563eb] text-white rounded hover:bg-[#1d4ed8]"
        >
          + New matrix
        </button>
      </div>

      {showNew && (
        <div className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
          <div className="text-xs font-medium uppercase tracking-wide text-[#475569] mb-2">
            Paste RFP Section L / M text
          </div>
          <textarea
            value={rfpText}
            onChange={(e) => setRfpText(e.target.value)}
            placeholder="Paste the Section L (Instructions) and Section M (Evaluation) text from the solicitation..."
            className="w-full min-h-[180px] border border-[#e5e7eb] rounded p-3 text-sm font-mono text-[#0f172a]"
          />
          <div className="mt-3 flex items-center gap-3">
            <input
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="Source label (optional, e.g. RFP-XYZ-2026.pdf)"
              className="flex-1 border border-[#e5e7eb] rounded p-2 text-sm"
            />
            <button
              onClick={createMatrix}
              disabled={creating || rfpText.trim().length < 20}
              className="px-4 py-2 text-sm bg-[#2563eb] text-white rounded disabled:opacity-50"
            >
              {creating ? "Extracting..." : "Extract matrix"}
            </button>
            <button
              onClick={() => {
                setShowNew(false);
                setError(null);
              }}
              className="px-3 py-2 text-sm text-[#64748b]"
            >
              Cancel
            </button>
          </div>
          {error && <div className="mt-2 text-xs text-[#dc2626]">{error}</div>}
        </div>
      )}

      {loading ? (
        <div className="text-center text-[#94a3b8] py-12">Loading matrices...</div>
      ) : matrices.length === 0 ? (
        <div className="border border-dashed border-[#e5e7eb] bg-white p-10 rounded-xl text-center">
          <div className="text-sm text-[#64748b]">No compliance matrices yet.</div>
          <div className="text-xs text-[#94a3b8] mt-1">
            Create one from any RFP text — Claude extracts Section L/M items automatically.
          </div>
        </div>
      ) : (
        <div className="border border-[#e5e7eb] bg-white rounded-xl divide-y divide-[#e5e7eb]">
          {matrices.map((m) => (
            <Link
              key={m.id}
              href={`/dashboard/compliance/matrix/${m.id}`}
              className="block px-5 py-4 hover:bg-[#f8f9fb]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-[#0f172a]">
                    {m.source_label || "Untitled matrix"}
                  </div>
                  <div className="text-xs text-[#94a3b8] mt-0.5 font-mono">
                    {new Date(m.created_at).toLocaleString()} · {m.row_count} row
                    {m.row_count === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="text-xs text-[#2563eb]">Open →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
