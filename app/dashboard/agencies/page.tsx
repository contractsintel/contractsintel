"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProfileBoostBanner } from "../unlock-panel";
import Link from "next/link";

interface Agency {
  id: string;
  name: string;
  acronym: string | null;
  parent_agency_id: string | null;
  description: string | null;
  total_obligations: number | null;
  active_opportunities: number | null;
}

function formatCurrency(v: number | null) {
  if (!v) return "—";
  if (v >= 1_000_000_000_000) return `$${(v / 1_000_000_000_000).toFixed(1)}T`;
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

export default function AgenciesIndexPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [parentOnly, setParentOnly] = useState(false);
  const [spendOpen, setSpendOpen] = useState(true);
  const [visible, setVisible] = useState(50);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const spendStats = useMemo(() => {
    if (agencies.length === 0) return null;
    const totalObligations = agencies.reduce((sum, a) => sum + (a.total_obligations ?? 0), 0);
    const avgObligations = totalObligations / agencies.length;
    const withActive = agencies.filter((a) => (a.active_opportunities ?? 0) > 0).length;
    const top5 = [...agencies]
      .sort((a, b) => (b.total_obligations ?? 0) - (a.total_obligations ?? 0))
      .slice(0, 5);
    const maxObligation = top5[0]?.total_obligations ?? 0;
    return { totalObligations, avgObligations, withActive, top5, maxObligation };
  }, [agencies]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (parentOnly) params.set("parent_only", "true");
      const res = await fetch(`/api/agencies?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setAgencies(j.agencies || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, parentOnly]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Agency Profiles</h1>
        <p className="mt-2 text-gray-600">
          Browse federal buyers with their contracting-officer directories and
          recent solicitations.
        </p>
      </div>

      <ProfileBoostBanner context="agencies" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or acronym"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm w-72"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={parentOnly}
            onChange={(e) => setParentOnly(e.target.checked)}
          />
          Top-level agencies only
        </label>
      </div>

      {!loading && !error && spendStats && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Spend Intelligence</h2>
            <button
              onClick={() => setSpendOpen((v) => !v)}
              className="text-xs text-[#2563eb] hover:underline"
            >
              {spendOpen ? "Hide Spend Intelligence" : "Show Spend Intelligence"}
            </button>
          </div>
          {spendOpen && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border border-[#e5e7eb] bg-white rounded-xl p-4">
                  <div style={{ fontSize: 11 }} className="uppercase tracking-wide text-[#94a3b8]">
                    Total Tracked Obligations
                  </div>
                  <div style={{ fontSize: 22 }} className="font-mono text-[#0f172a] mt-1">
                    {formatCurrency(spendStats.totalObligations)}
                  </div>
                </div>
                <div className="border border-[#e5e7eb] bg-white rounded-xl p-4">
                  <div style={{ fontSize: 11 }} className="uppercase tracking-wide text-[#94a3b8]">
                    Avg Obligations / Agency
                  </div>
                  <div style={{ fontSize: 22 }} className="font-mono text-[#0f172a] mt-1">
                    {formatCurrency(spendStats.avgObligations)}
                  </div>
                </div>
                <div className="border border-[#e5e7eb] bg-white rounded-xl p-4">
                  <div style={{ fontSize: 11 }} className="uppercase tracking-wide text-[#94a3b8]">
                    Agencies w/ Active Opportunities
                  </div>
                  <div style={{ fontSize: 22 }} className="font-mono text-[#0f172a] mt-1">
                    {spendStats.withActive}
                  </div>
                </div>
              </div>

              <div className="border border-[#e5e7eb] bg-white rounded-xl p-4">
                <div style={{ fontSize: 11 }} className="uppercase tracking-wide text-[#94a3b8] mb-3">
                  Top 5 Agencies by Obligations
                </div>
                <div className="space-y-2">
                  {spendStats.top5.map((a) => {
                    const pct = spendStats.maxObligation > 0
                      ? ((a.total_obligations ?? 0) / spendStats.maxObligation) * 100
                      : 0;
                    return (
                      <div key={a.id} className="flex items-center gap-3">
                        <div className="w-40 shrink-0 text-xs text-[#0f172a] truncate" title={a.name}>
                          {a.acronym || a.name}
                        </div>
                        <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{ width: `${pct}%`, backgroundColor: "#2563eb" }}
                          />
                        </div>
                        <div className="w-20 shrink-0 text-right text-xs font-mono text-[#0f172a]">
                          {formatCurrency(a.total_obligations)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <div className="text-gray-500">Loading agencies…</div>}
      {error && (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
          <span className="text-3xl">🏛️</span>
          <h3 className="text-sm font-medium text-gray-900 mt-3">Agency profiles loading</h3>
          <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
            Agency data is being indexed. Check back shortly, or browse contracts by agency in Search Contracts.
          </p>
        </div>
      )}

      {!loading && !error && agencies.length === 0 && (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
          <span className="text-3xl">🏛️</span>
          <h3 className="text-sm font-medium text-gray-900 mt-3">No agencies found</h3>
          <p className="text-xs text-gray-500 mt-2">
            {q ? "Try a different search term." : "Agency profiles will appear as contract data is ingested."}
          </p>
        </div>
      )}

      {!loading && !error && agencies.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {agencies.slice(0, visible).map((a) => (
            <Link
              key={a.id}
              href={`/dashboard/agencies/${a.id}`}
              data-testid="agency-card"
              className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{a.name}</div>
                  {a.acronym && (
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      {a.acronym}
                    </div>
                  )}
                  {a.description && (
                    <div className="mt-2 line-clamp-2 text-sm text-gray-600">{a.description}</div>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-gray-500">
                  <div className="font-semibold text-gray-900">{formatCurrency(a.total_obligations)}</div>
                  <div className="mt-1">{a.active_opportunities ?? 0} active</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {agencies.length > 0 && (
        <div className="flex items-center justify-between pt-4 border-t border-[#e5e7eb] mt-4">
          <span className="text-xs text-[#94a3b8]">Showing {Math.min(visible, agencies.length)} of {agencies.length} agencies</span>
          {visible < agencies.length && (
            <button onClick={() => setVisible(v => v + 50)} className="px-5 py-2 text-sm font-medium border border-[#e5e7eb] text-[#64748b] bg-white hover:text-[#0f172a] hover:shadow-sm rounded-xl transition-all">
              Load 50 More
            </button>
          )}
        </div>
      )}
    </div>
  );
}
