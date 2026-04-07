"use client";

import { useDashboard } from "../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "../page-header";

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
type SourceFilter = "" | "sam_gov" | "usaspending" | "state_local" | "federal_civilian" | "sbir_sttr" | "grants_gov" | "subcontracting" | "forecasts" | "military_defense";

const PAGE_SIZE = 20;

export default function SearchPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const search = useCallback(async (resetOffset = false) => {
    setLoading(true);
    const effectiveOffset = resetOffset ? 0 : offset;
    if (resetOffset) setOffset(0);

    let q = supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .neq("status", "expired");

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
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, agency, or solicitation number..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-[#e5e7eb] rounded-xl bg-white focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20"
          />
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SourceFilter)}
          className="bg-white border border-[#e5e7eb] text-[#4b5563] text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#2563eb]"
        >
          <option value="">All Sources</option>
          <option value="sam_gov">SAM.gov</option>
          <option value="usaspending">USASpending</option>
          <option value="state_local">State & Local</option>
          <option value="federal_civilian">Federal Civilian</option>
          <option value="sbir_sttr">SBIR/STTR</option>
          <option value="grants_gov">Grants.gov</option>
          <option value="military_defense">Military</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="bg-white border border-[#e5e7eb] text-[#4b5563] text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#2563eb]"
        >
          <option value="newest">Newest</option>
          <option value="deadline">Deadline soonest</option>
          <option value="value">Highest value</option>
        </select>
      </div>

      {/* Results */}
      {loading && results.length === 0 ? (
        <div className="border border-[#f0f1f3] bg-white p-12 text-center text-[#9ca3af] rounded-xl">
          Searching...
        </div>
      ) : results.length === 0 ? (
        <div className="border border-[#f0f1f3] bg-white p-12 text-center rounded-xl">
          <p className="text-[#9ca3af]">No opportunities found. Try a different search.</p>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-[11px] font-mono text-[#94a3b8] px-1 mb-2">
            Showing {results.length} of {total.toLocaleString()} results
          </div>
          {results.map((opp) => {
            const days = daysUntil(opp.response_deadline);
            const deadlineColor = days !== null && days <= 3 ? "text-[#ef4444]" : days !== null && days <= 7 ? "text-[#f59e0b]" : "text-[#64748b]";
            return (
              <div
                key={opp.id}
                className="border border-[#f0f1f3] bg-white rounded-lg hover:border-[#e2e8f0] hover:shadow-sm transition-all"
              >
                <div
                  className="px-4 py-2.5 flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === opp.id ? null : opp.id)}
                >
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f8f9fb] text-[#64748b] border border-[#f0f1f3] shrink-0">
                    {sourceLabel(opp.source)}
                  </span>
                  <span className="text-sm text-[#0f172a] font-medium truncate flex-1">{(opp.title || "").replace(/&#\d+;/g, (m: string) => String.fromCharCode(parseInt(m.slice(2, -1)))).replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")}</span>
                  <span className="text-[11px] text-[#64748b] truncate max-w-[200px] hidden md:inline">{opp.agency}</span>
                  {opp.estimated_value ? <span className="text-xs font-mono text-[#111827] shrink-0">{formatCurrency(opp.estimated_value)}</span> : null}
                  <span className={`text-[11px] font-mono shrink-0 w-14 text-right ${deadlineColor}`}>{deadlineLabel(opp.response_deadline)}</span>
                  <svg className={`w-4 h-4 text-[#9ca3af] shrink-0 transition-transform ${expandedId === opp.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {expandedId === opp.id && (
                  <div className="px-4 pb-3 border-t border-[#f0f1f3] pt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {opp.set_aside && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563]">{opp.set_aside}</span>}
                      {opp.naics_code && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563] font-mono">NAICS {opp.naics_code}</span>}
                      {opp.place_of_performance && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#f0f1f3] text-[#4b5563]">{opp.place_of_performance}</span>}
                    </div>
                    {opp.description && <p className="text-xs text-[#4b5563] leading-relaxed line-clamp-4">{opp.description}</p>}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      {opp.agency && <div><span className="text-[#9ca3af]">Agency:</span> <span className="text-[#111827]">{opp.agency}</span></div>}
                      {opp.posted_date && <div><span className="text-[#9ca3af]">Posted:</span> <span className="text-[#111827]">{new Date(opp.posted_date).toLocaleDateString()}</span></div>}
                      {opp.response_deadline && <div><span className="text-[#9ca3af]">Deadline:</span> <span className="text-[#111827]">{new Date(opp.response_deadline).toLocaleDateString()}</span></div>}
                      {opp.solicitation_number && <div><span className="text-[#9ca3af]">Solicitation:</span> <span className="text-[#111827] font-mono">{opp.solicitation_number}</span></div>}
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
                className="px-6 py-2.5 text-sm font-medium border border-[#f0f1f3] text-[#4b5563] bg-white hover:border-[#e2e8f0] hover:text-[#111827] hover:shadow-sm rounded-xl transition-all"
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
