"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "../page-header";
import { htmlToPlainText } from "@/app/lib/html";

function formatCurrency(n: number | null): string {
  if (!n) return "";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function deadlineLabel(date: string | null): string {
  const d = daysUntil(date);
  if (d === null) return "";
  if (d < 0) return "Expired";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `${d}d left`;
}

type SortOption = "newest" | "deadline" | "value";

const PAGE_SIZE = 20;

export default function SearchPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string>("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [availableSources, setAvailableSources] = useState<string[]>([]);

  // Load distinct source values once on mount (top 20 by row count).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // PostgREST has no GROUP BY, so we sample a wide page and bucket in JS.
      const { data } = await supabase
        .from("opportunities")
        .select("source")
        .neq("status", "expired")
        .limit(5000);
      if (cancelled || !data) return;
      const counts: Record<string, number> = {};
      for (const r of data) {
        const s = r.source || "unknown";
        counts[s] = (counts[s] || 0) + 1;
      }
      const top = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([s]) => s);
      setAvailableSources(top);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const search = useCallback(async (resetOffset = false) => {
    setLoading(true);
    const effectiveOffset = resetOffset ? 0 : offset;
    if (resetOffset) setOffset(0);

    let q = supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .neq("status", "expired")
      .neq("status", "paused");

    if (query.trim()) {
      q = q.or(`title.ilike.%${query.trim()}%,agency.ilike.%${query.trim()}%,solicitation_number.ilike.%${query.trim()}%`);
    }

    if (source) {
      if (source === "state_local") {
        q = q.like("source", "state_%");
      } else {
        q = q.eq("source", source);
      }
    }

    if (sort === "newest") q = q.order("created_at", { ascending: false });
    else if (sort === "deadline") q = q.order("response_deadline", { ascending: true, nullsFirst: false });
    else if (sort === "value") q = q.order("estimated_value", { ascending: false, nullsFirst: false });

    q = q.range(effectiveOffset, effectiveOffset + PAGE_SIZE - 1);

    const { data, count } = await q;
    if (resetOffset) {
      setResults(data ?? []);
    } else {
      setResults((prev) => [...prev, ...(data ?? [])]);
    }
    setTotal(count ?? 0);
    setLoading(false);
  }, [supabase, query, source, sort, offset]);

  useEffect(() => {
    search(true);
  }, [query, source, sort]);

  const loadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    // Trigger search with new offset
    const doSearch = async () => {
      let q = supabase
        .from("opportunities")
        .select("*", { count: "exact" });

      if (query.trim()) {
        q = q.or(`title.ilike.%${query.trim()}%,agency.ilike.%${query.trim()}%,solicitation_number.ilike.%${query.trim()}%`);
      }
      if (source) {
        if (source === "state_local") {
          q = q.like("source", "state_%");
        } else {
          q = q.eq("source", source);
        }
      }
      if (sort === "newest") q = q.order("created_at", { ascending: false });
      else if (sort === "deadline") q = q.order("response_deadline", { ascending: true, nullsFirst: false });
      else if (sort === "value") q = q.order("estimated_value", { ascending: false, nullsFirst: false });

      q = q.range(newOffset, newOffset + PAGE_SIZE - 1);
      const { data } = await q;
      setResults((prev) => [...prev, ...(data ?? [])]);
    };
    doSearch();
  };

  const sourceLabel = (s: string | null) => {
    if (!s) return "Unknown";
    const map: Record<string, string> = {
      sam_gov: "SAM.gov",
      usaspending: "USASpending",
      federal_civilian: "Federal",
      sbir_sttr: "SBIR/STTR",
      grants_gov: "Grants.gov",
      subcontracting: "SubK",
      forecasts: "Forecast",
      military_defense: "Military",
    };
    if (s.startsWith("state_")) return s.replace("state_", "").toUpperCase();
    return map[s] || s;
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader
          title="Search All Contracts"
          subtitle={`${total.toLocaleString()} opportunities in database`}
          accentColor="#059669"
        />
        <Link href="/dashboard" className="text-sm text-[#2563eb] hover:text-[#1d4ed8] ci-btn">Back to Matches</Link>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4a5a75]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, agency, or solicitation number..."
            className="w-full h-12 pl-11 pr-4 text-[15px] border-2 border-[#1e2535] rounded-xl bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10"
          />
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-12 bg-white border border-[#1e2535] text-[#8b9ab5] text-[14px] px-3 rounded-xl focus:outline-none focus:border-[#2563eb]"
        >
          <option value="">All Sources</option>
          {availableSources.map((s) => (
            <option key={s} value={s}>{sourceLabel(s)}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="h-12 bg-white border border-[#1e2535] text-[#8b9ab5] text-[14px] px-3 rounded-xl focus:outline-none focus:border-[#2563eb]"
        >
          <option value="newest">Newest</option>
          <option value="deadline">Deadline soonest</option>
          <option value="value">Highest value</option>
        </select>
      </div>

      {/* Results */}
      {loading && results.length === 0 ? (
        <div className="bg-white border border-[#1e2535] rounded-xl overflow-hidden">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-[#1e2535]">
              <div className="w-12 h-12 rounded-full bg-[#111520] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/5 bg-[#111520] rounded animate-pulse" />
                <div className="h-3 w-2/5 bg-[#111520] rounded animate-pulse" />
              </div>
              <div className="h-4 w-16 bg-[#111520] rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="max-w-[400px] mx-auto text-center p-8">
          <div className="w-10 h-10 mx-auto mb-3 text-[#4a5a75]">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <h3 className="text-[16px] font-semibold text-[#e8edf8] mb-2">No opportunities found</h3>
          <p className="text-[14px] text-[#8b9ab5]">Try a different search term or adjust your filters.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#1e2535] rounded-xl overflow-hidden">
          <div className="text-[11px] font-mono text-[#94a3b8] px-1 mb-2">
            Showing {results.length} of {total.toLocaleString()} results
          </div>
          {results.map((opp) => {
            const days = daysUntil(opp.response_deadline);
            const deadlineColor = days !== null && days <= 3 ? "text-[#ef4444]" : days !== null && days <= 7 ? "text-[#f59e0b]" : "text-[#64748b]";
            return (
              <div
                key={opp.id}
                className="border border-[#1e2535] bg-white rounded-lg hover:border-[#e2e8f0] hover:shadow-sm transition-all"
              >
                <div
                  className="px-4 py-2.5 flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === opp.id ? null : opp.id)}
                >
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#080a0f] text-[#64748b] border border-[#1e2535] shrink-0">
                    {sourceLabel(opp.source)}
                  </span>
                  <span className="text-sm text-[#0f172a] font-medium truncate flex-1">{htmlToPlainText(opp.title || "")}</span>
                  <span className="text-[11px] text-[#64748b] truncate max-w-[200px] hidden md:inline">{opp.agency}</span>
                  {opp.estimated_value ? <span className="text-xs font-mono text-[#e8edf8] shrink-0">{formatCurrency(opp.estimated_value)}</span> : null}
                  <span className={`text-[11px] font-mono shrink-0 w-14 text-right ${deadlineColor}`}>{deadlineLabel(opp.response_deadline)}</span>
                  <svg className={`w-4 h-4 text-[#4a5a75] shrink-0 transition-transform ${expandedId === opp.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {expandedId === opp.id && (
                  <div className="px-4 pb-3 border-t border-[#1e2535] pt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {opp.set_aside && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#080a0f] border border-[#1e2535] text-[#8b9ab5]">{opp.set_aside}</span>}
                      {opp.naics_code && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#080a0f] border border-[#1e2535] text-[#8b9ab5] font-mono">NAICS {opp.naics_code}</span>}
                      {opp.place_of_performance && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#080a0f] border border-[#1e2535] text-[#8b9ab5]">{opp.place_of_performance}</span>}
                    </div>
                    {opp.description && <p className="text-xs text-[#8b9ab5] leading-relaxed line-clamp-4 whitespace-pre-line">{htmlToPlainText(opp.description)}</p>}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      {opp.agency && <div><span className="text-[#4a5a75]">Agency:</span> <span className="text-[#e8edf8]">{opp.agency}</span></div>}
                      {opp.posted_date && <div><span className="text-[#4a5a75]">Posted:</span> <span className="text-[#e8edf8]">{new Date(opp.posted_date).toLocaleDateString()}</span></div>}
                      {opp.response_deadline && <div><span className="text-[#4a5a75]">Deadline:</span> <span className="text-[#e8edf8]">{new Date(opp.response_deadline).toLocaleDateString()}</span></div>}
                      {opp.solicitation_number && <div><span className="text-[#4a5a75]">Solicitation:</span> <span className="text-[#e8edf8] font-mono">{opp.solicitation_number}</span></div>}
                    </div>
                    {(opp.sam_url || opp.source_url) && (
                      <a href={opp.sam_url || opp.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2563eb] bg-[#eff4ff] hover:bg-[#dbeafe] rounded-lg transition-colors">
                        View Original Listing →
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {results.length < total && (
            <div className="flex justify-center pt-4">
              <button
                onClick={loadMore}
                className="px-6 py-2.5 text-sm font-medium border border-[#1e2535] text-[#8b9ab5] bg-white hover:border-[#e2e8f0] hover:text-[#e8edf8] hover:shadow-sm rounded-xl transition-all"
              >
                Load more ({(total - results.length).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
