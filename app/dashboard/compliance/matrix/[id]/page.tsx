"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ComplianceRow = {
  section: string;
  requirement: string;
  evidence_required: string;
  owner: string;
  status: "pending" | "in_progress" | "complete";
  page_ref: string;
};

type Matrix = {
  id: string;
  source_label: string | null;
  opportunity_id: string | null;
  rows: ComplianceRow[];
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS: ComplianceRow["status"][] = ["pending", "in_progress", "complete"];

export default function ComplianceMatrixDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const matrixId = params.id;

  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/compliance/matrix/${matrixId}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed to load");
      setMatrix(j.matrix);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixId]);

  function updateRow(idx: number, patch: Partial<ComplianceRow>) {
    if (!matrix) return;
    const next = matrix.rows.slice();
    next[idx] = { ...next[idx], ...patch };
    setMatrix({ ...matrix, rows: next });
  }

  async function save() {
    if (!matrix) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/compliance/matrix/${matrixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: matrix.rows }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed to save");
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center text-[#94a3b8] py-12">Loading matrix...</div>;
  }
  if (!matrix) {
    return (
      <div className="text-center text-[#94a3b8] py-12">
        {error ?? "Matrix not found"}
        <div className="mt-3">
          <Link href="/dashboard/compliance/matrix" className="text-[#2563eb] text-sm">
            ← Back to matrices
          </Link>
        </div>
      </div>
    );
  }

  const total = matrix.rows.length;
  const complete = matrix.rows.filter((r) => r.status === "complete").length;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/dashboard/compliance/matrix"
          className="text-xs text-[#2563eb] hover:underline"
        >
          ← All matrices
        </Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="ci-page-title">{matrix.source_label || "Untitled matrix"}</h1>
          <p className="text-sm text-[#64748b] mt-1">
            {total} requirement{total === 1 ? "" : "s"} · {pct}% complete
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-[#22c55e]">Saved {savedAt}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-[#2563eb] text-white rounded disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded bg-[#fef2f2] border border-[#fecaca] text-xs text-[#dc2626]">
          {error}
        </div>
      )}

      <div className="border border-[#e5e7eb] bg-white rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-[#f8f9fb] text-[10px] font-medium uppercase tracking-wide text-[#64748b]">
          <div className="col-span-1">Section</div>
          <div className="col-span-5">Requirement</div>
          <div className="col-span-3">Evidence</div>
          <div className="col-span-2">Owner</div>
          <div className="col-span-1">Status</div>
        </div>
        {matrix.rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[#94a3b8]">
            No rows extracted from the source text.
          </div>
        ) : (
          matrix.rows.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-3 px-4 py-3 border-t border-[#e5e7eb] items-start"
            >
              <div className="col-span-1 text-xs font-mono text-[#475569]">{row.section || "—"}</div>
              <div className="col-span-5 text-xs text-[#0f172a] leading-relaxed">
                {row.requirement}
                {row.page_ref && (
                  <span className="ml-2 text-[10px] text-[#94a3b8] font-mono">{row.page_ref}</span>
                )}
              </div>
              <div className="col-span-3 text-xs text-[#475569]">
                {row.evidence_required || <span className="text-[#94a3b8]">—</span>}
              </div>
              <div className="col-span-2">
                <input
                  value={row.owner}
                  onChange={(e) => updateRow(idx, { owner: e.target.value })}
                  placeholder="assign"
                  className="w-full border border-[#e5e7eb] rounded px-2 py-1 text-xs"
                />
              </div>
              <div className="col-span-1">
                <select
                  value={row.status}
                  onChange={(e) =>
                    updateRow(idx, { status: e.target.value as ComplianceRow["status"] })
                  }
                  className="w-full border border-[#e5e7eb] rounded px-1 py-1 text-[10px]"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
