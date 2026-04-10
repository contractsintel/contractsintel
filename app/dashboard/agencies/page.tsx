"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [parentOnly, setParentOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
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
  }, [q, parentOnly]);

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

      {loading && <div className="text-gray-500">Loading agencies…</div>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {agencies.map((a) => (
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
    </div>
  );
}
