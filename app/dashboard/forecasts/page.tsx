"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProfileBoostBanner } from "../unlock-panel";
import { InlineGuide } from "../inline-guide";

interface ForecastRow {
  id: string;
  agency: string;
  naics: string | null;
  expected_rfp_at: string;
  period_end: string | null;
  incumbent: string | null;
  estimated_value: number | null;
  source: string;
  confidence: number;
  linked_recompete_award_id: string | null;
  notes: string | null;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function formatMonthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_LABELS[Number(m) - 1]} ${y}`;
}
function formatCurrency(v: number | null) {
  if (!v) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function ForecastsPage() {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectInProgress, setProjectInProgress] = useState(false);
  const [projectMsg, setProjectMsg] = useState<string | null>(null);
  const [agencyFilter, setAgencyFilter] = useState("");
  const [naicsFilter, setNaicsFilter] = useState("");
  const [monthsOut, setMonthsOut] = useState<number>(18);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (agencyFilter) params.set("agency", agencyFilter);
      if (naicsFilter) params.set("naics", naicsFilter);
      params.set("months_out", String(monthsOut));
      params.set("limit", "100");
      const res = await fetch(`/api/forecasts?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.forecasts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load forecasts");
    } finally {
      setLoading(false);
    }
  }, [agencyFilter, naicsFilter, monthsOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectFromPastPerf = useCallback(async () => {
    setProjectInProgress(true);
    setProjectMsg(null);
    try {
      const res = await fetch("/api/forecasts", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProjectMsg(
        json.inserted > 0
          ? `Projected ${json.inserted} new recompete${json.inserted === 1 ? "" : "s"} from your past-performance records.`
          : "No new recompetes to project. Add past-performance entries with future end dates to extend your pipeline.",
      );
      await load();
    } catch (e) {
      setProjectMsg(e instanceof Error ? e.message : "Projection failed");
    } finally {
      setProjectInProgress(false);
    }
  }, [load]);

  const grouped = useMemo(() => {
    const buckets: Record<string, ForecastRow[]> = {};
    for (const r of rows) {
      const key = formatMonthKey(r.expected_rfp_at);
      (buckets[key] = buckets[key] || []).push(r);
    }
    return Object.keys(buckets)
      .sort()
      .map((key) => ({ key, label: formatMonthLabel(key), items: buckets[key] }));
  }, [rows]);

  const totalValue = useMemo(
    () => rows.reduce((a, r) => a + (r.estimated_value || 0), 0),
    [rows],
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Procurement Forecasts</h1>
          <p className="mt-2 text-gray-600">
            Projected recompete RFPs based on incumbent contracts ending soon. Each
            forecast pushes the release date ~6 months before the period-of-performance end.
          </p>
        </div>
        <button
          type="button"
          onClick={projectFromPastPerf}
          disabled={projectInProgress}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {projectInProgress ? "Projecting…" : "Project my recompetes"}
        </button>
      </div>

      <InlineGuide page="forecasts" />
      <ProfileBoostBanner context="forecasts" />

      {projectMsg && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {projectMsg}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value)}
          placeholder="Filter by agency"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={naicsFilter}
          onChange={(e) => setNaicsFilter(e.target.value)}
          placeholder="Filter by NAICS"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={monthsOut}
          onChange={(e) => setMonthsOut(Number(e.target.value))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value={6}>Next 6 months</option>
          <option value={12}>Next 12 months</option>
          <option value={18}>Next 18 months</option>
          <option value={24}>Next 24 months</option>
        </select>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Projected RFPs</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{rows.length}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Total est. value</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(totalValue)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Horizon</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{monthsOut} months</div>
        </div>
      </div>

      {loading && <div className="text-gray-500">Loading forecasts…</div>}
      {error && (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
          <span className="text-3xl">📊</span>
          <h3 className="text-sm font-medium text-gray-900 mt-3">Forecasts coming soon</h3>
          <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
            Procurement forecasts are generated from your past performance records and USASpending recompete data.
            Add past performance in your profile to see projected recompetes here.
          </p>
        </div>
      )}

      {!loading && !error && grouped.length === 0 && (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
          <span className="text-3xl">📊</span>
          <h3 className="text-sm font-medium text-gray-900 mt-3">No forecasted recompetes</h3>
          <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
            Try expanding the horizon or adding past performance records to generate forecasts.
          </p>
        </div>
      )}

      <div className="space-y-6" data-testid="forecast-timeline">
        {grouped.map((bucket) => (
          <section key={bucket.key} data-testid={`forecast-month-${bucket.key}`}>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">
              {bucket.label}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({bucket.items.length} projected)
              </span>
            </h2>
            <div className="space-y-2">
              {bucket.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300"
                  data-testid="forecast-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">{item.agency}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        NAICS {item.naics || "—"} · Incumbent {item.incumbent || "Unknown"}
                      </div>
                      {item.notes && (
                        <div className="mt-2 text-sm text-gray-600">{item.notes}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-blue-700">
                        RFP ~{formatDate(item.expected_rfp_at)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        PoP ends {formatDate(item.period_end)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Est. {formatCurrency(item.estimated_value)} ·{" "}
                        {Math.round(item.confidence * 100)}% conf.
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
