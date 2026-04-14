"use client";

import { useDashboard } from "../context";
import { ProfileBoostBanner } from "../unlock-panel";
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
  const [results, setResults] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string>("");
  const [sort, setSort] = useState<SortOption>("newest");
  // G19 — Full-text search inside solicitation body text
  const [ftsMode, setFtsMode] = useState(false);
  // G01 — SLED level filter (federal/state/local/education or "" for all)
  const [level, setLevel] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [availableSources, setAvailableSources] = useState<string[]>([]);

  // G02 — Natural-language search state
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);
  const [nlActive, setNlActive] = useState(false);
  const [nlRationale, setNlRationale] = useState("");

  // G24 — Free-tier daily search quota
  const [searchQuota, setSearchQuota] = useState<{
    limit: number | null;
    used: number;
    remaining: number | null;
    reset_at: string | null;
    tier: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/quota/search");
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setSearchQuota(j.quota);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runNLSearch = async () => {
    const trimmed = nlPrompt.trim();
    if (!trimmed) return;
    setNlLoading(true);
    setNlError(null);
    try {
      const res = await fetch("/api/opportunities/nl-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 429 && j?.quota) {
          setSearchQuota(j.quota);
          throw new Error(j?.upgrade?.message || j?.error || "Daily search limit reached");
        }
        throw new Error(j?.error || `Search failed (${res.status})`);
      }
      const j = await res.json();
      setResults(j.results ?? []);
      setTotal(j.total ?? 0);
      setNlRationale(j.filters?.rationale ?? "");
      setNlActive(true);
      if (j.quota) setSearchQuota(j.quota);
      setLoading(false);
    } catch (e: unknown) {
      setNlError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setNlLoading(false);
    }
  };

  const clearNL = () => {
    setNlActive(false);
    setNlPrompt("");
    setNlRationale("");
    setNlError(null);
    search(true);
  };

  // B4: Load distinct source values once on mount, merged with a known set
  // so the dropdown always exposes major sources even before data arrives.
  useEffect(() => {
    const KNOWN_SOURCES = [
      "sam_gov",
      "usaspending",
      "grants_gov",
      "sbir_sttr",
      "military_defense",
      "dla_dibbs",
      "army_asfi",
      "navy_neco",
      "air_force",
      "marines",
      "darpa",
      "state_local",
      "subcontracting",
      "forecasts",
    ];
    setAvailableSources(KNOWN_SOURCES);
    // Known sources are sufficient — skip the 5000-row sampling query.
  }, []);

  const search = useCallback(async (resetOffset = false) => {
    setLoading(true);
    const effectiveOffset = resetOffset ? 0 : offset;
    if (resetOffset) setOffset(0);

    // G19 — When the "Search inside solicitation PDFs" checkbox is on and the
    // user has typed a query, route through the FTS endpoint instead of
    // PostgREST ilike. Skip pagination — the API caps at 100 already.
    if (ftsMode && query.trim()) {
      try {
        const r = await fetch(`/api/opportunities/fts?q=${encodeURIComponent(query.trim())}&limit=100`);
        const j = await r.json();
        if (r.ok) {
          setResults(j.opportunities ?? []);
          setTotal(j.count ?? (j.opportunities?.length ?? 0));
        } else {
          setResults([]);
          setTotal(0);
        }
      } catch {
        setResults([]);
        setTotal(0);
      }
      setLoading(false);
      return;
    }

    // Load all opportunities — no status filter since the column may not
    // exist in production yet. The table is already scoped to active data
    // by the scrapers.
    const now = new Date().toISOString();
    let q = supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .or(`response_deadline.is.null,response_deadline.gte.${now}`);

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

    if (level) {
      // opportunity_level column may not exist yet — filter by source pattern instead
      const levelSourceMap: Record<string, string[]> = {
        federal: ["sam_gov", "usaspending", "military_defense", "dla_dibbs", "army_asfi", "navy_neco", "air_force", "marines", "darpa"],
        state: ["state_local"],
        local: ["state_local"],
        education: [],
      };
      const sources = levelSourceMap[level];
      if (sources && sources.length > 0) {
        q = q.in("source", sources);
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
  }, [supabase, query, source, sort, offset, ftsMode, level]);

  useEffect(() => {
    search(true);
  }, [query, source, sort, ftsMode, level]);

  const loadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    // Trigger search with new offset
    const doSearch = async () => {
      const nowLm = new Date().toISOString();
      let q = supabase
        .from("opportunities")
        .select("*", { count: "exact" })
        .or(`response_deadline.is.null,response_deadline.gte.${nowLm}`);

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          title="Search All Contracts"
          subtitle={loading && results.length === 0 ? "Loading opportunities…" : `${total.toLocaleString()} opportunities in database`}
          accentColor="#059669"
        />
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[#0f172a] font-medium">Contracts</span>
          <span className="text-[#cbd5e1]">·</span>
          <Link href="/dashboard/search/grants" className="text-[#3b82f6] hover:underline">Grants</Link>
          <span className="text-[#cbd5e1]">·</span>
          <Link href="/dashboard/search/sbir" className="text-[#3b82f6] hover:underline">SBIR / STTR</Link>
          <span className="text-[#cbd5e1]">·</span>
          <Link href="/dashboard" className="text-[#2563eb] hover:text-[#1d4ed8] ci-btn">Back to Matches</Link>
        </div>
      </div>

      <ProfileBoostBanner context="search" />

      {/* G02 — Natural-language search */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[12px] font-semibold tracking-wide text-[#475569] uppercase">
            Describe what you do
          </label>
          {/* G24 — Quota meter (free tier only) */}
          {searchQuota && searchQuota.limit !== null && (
            <div className="text-[11px] text-[#64748b] flex items-center gap-2">
              <span className="font-mono">
                {searchQuota.remaining}/{searchQuota.limit} free searches left today
              </span>
              {searchQuota.remaining === 0 && (
                <a
                  href="/pricing"
                  className="px-2 py-0.5 rounded bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a]"
                >
                  Upgrade
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex items-start gap-3">
          <textarea
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runNLSearch();
            }}
            placeholder='e.g. "We are an SDVOSB cybersecurity firm that does penetration testing for the Air Force in Texas, contracts $250K-$5M"'
            rows={2}
            className="flex-1 text-[14px] leading-relaxed border-2 border-[#e5e7eb] rounded-lg bg-white px-3 py-2 focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 resize-none"
          />
          <div className="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={runNLSearch}
              disabled={nlLoading || !nlPrompt.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-[#94a3b8] rounded-lg transition-colors"
            >
              {nlLoading ? "Searching…" : "Search with AI"}
            </button>
            {nlActive && (
              <button
                type="button"
                onClick={clearNL}
                className="px-4 py-2 text-xs font-medium text-[#64748b] border border-[#e5e7eb] hover:border-[#cbd5e1] rounded-lg transition-colors"
              >
                Clear AI filter
              </button>
            )}
          </div>
        </div>
        {nlError && (
          <p className="mt-2 text-[12px] text-[#ef4444]">{nlError}</p>
        )}
        {nlActive && nlRationale && (
          <p className="mt-2 text-[12px] text-[#64748b]">
            <span className="font-semibold text-[#475569]">AI filter:</span> {nlRationale}
          </p>
        )}
      </div>

      {/* G01 — Level filter chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { v: "", label: "All levels" },
          { v: "federal", label: "Federal" },
          { v: "state", label: "State" },
          { v: "local", label: "Local" },
          { v: "education", label: "Education" },
        ].map((chip) => (
          <button
            key={chip.v}
            type="button"
            onClick={() => setLevel(chip.v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              level === chip.v
                ? "bg-[#2563eb] text-white border-[#2563eb]"
                : "bg-white text-[#475569] border-[#e5e7eb] hover:border-[#cbd5e1]"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-0 w-full sm:w-auto">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, agency, or solicitation number..."
            className="w-full h-12 pl-11 pr-4 text-[15px] border-2 border-[#e5e7eb] rounded-xl bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10"
          />
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-12 bg-white border border-[#e5e7eb] text-[#64748b] text-[14px] px-3 rounded-xl focus:outline-none focus:border-[#2563eb]"
        >
          <option value="">All Sources</option>
          {availableSources.map((s) => (
            <option key={s} value={s}>{sourceLabel(s)}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="h-12 bg-white border border-[#e5e7eb] text-[#64748b] text-[14px] px-3 rounded-xl focus:outline-none focus:border-[#2563eb]"
        >
          <option value="newest">Newest</option>
          <option value="deadline">Deadline soonest</option>
          <option value="value">Highest value</option>
        </select>
        <label className="inline-flex items-center gap-2 h-12 px-3 text-[12px] text-[#475569] bg-white border border-[#e5e7eb] rounded-xl cursor-pointer hover:border-[#cbd5e1]">
          <input
            type="checkbox"
            checked={ftsMode}
            onChange={(e) => setFtsMode(e.target.checked)}
            className="w-4 h-4 accent-[#2563eb]"
          />
          Search inside solicitation PDFs
        </label>
      </div>

      {/* Results */}
      {loading && results.length === 0 ? (
        <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-[#e5e7eb]">
              <div className="w-12 h-12 rounded-full bg-[#f1f5f9] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/5 bg-[#f1f5f9] rounded animate-pulse" />
                <div className="h-3 w-2/5 bg-[#f1f5f9] rounded animate-pulse" />
              </div>
              <div className="h-4 w-16 bg-[#f1f5f9] rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="max-w-[400px] mx-auto text-center p-8">
          <div className="w-10 h-10 mx-auto mb-3 text-[#94a3b8]">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <h3 className="text-[16px] font-semibold text-[#0f172a] mb-2">No opportunities found</h3>
          <p className="text-[14px] text-[#64748b]">Try a different search term or adjust your filters.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
          <div className="text-[11px] font-mono text-[#94a3b8] px-1 mb-2">
            Showing {results.length} of {total.toLocaleString()} results
          </div>
          {results.map((opp) => {
            const days = daysUntil(opp.response_deadline);
            const deadlineColor = days !== null && days <= 3 ? "text-[#ef4444]" : days !== null && days <= 7 ? "text-[#f59e0b]" : "text-[#64748b]";
            return (
              <div
                key={opp.id}
                className="border border-[#e5e7eb] bg-white rounded-lg hover:border-[#e2e8f0] hover:shadow-sm transition-all"
              >
                <div
                  className="px-4 py-2.5 flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === opp.id ? null : opp.id)}
                >
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f8f9fb] text-[#64748b] border border-[#e5e7eb] shrink-0">
                    {sourceLabel(opp.source)}
                  </span>
                  <span className="text-sm text-[#0f172a] font-medium truncate flex-1">{htmlToPlainText(opp.title || "")}</span>
                  <span className="text-[11px] text-[#64748b] truncate max-w-[200px] hidden md:inline">{opp.agency}</span>
                  {opp.estimated_value ? <span className="text-xs font-mono text-[#0f172a] shrink-0">{formatCurrency(opp.estimated_value)}</span> : null}
                  <span className={`text-[11px] font-mono shrink-0 w-14 text-right ${deadlineColor}`}>{deadlineLabel(opp.response_deadline)}</span>
                  <svg className={`w-4 h-4 text-[#94a3b8] shrink-0 transition-transform ${expandedId === opp.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {expandedId === opp.id && (
                  <div className="px-4 pb-3 border-t border-[#e5e7eb] pt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {opp.set_aside && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#e5e7eb] text-[#64748b]">{opp.set_aside}</span>}
                      {opp.naics_code && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#e5e7eb] text-[#64748b] font-mono">NAICS {opp.naics_code}</span>}
                      {opp.place_of_performance && <span className="rounded-full px-2 py-0.5 text-[10px] bg-[#f8f9fb] border border-[#e5e7eb] text-[#64748b]">{opp.place_of_performance}</span>}
                    </div>
                    {opp.description && <p className="text-xs text-[#64748b] leading-relaxed line-clamp-4 whitespace-pre-line">{htmlToPlainText(opp.description)}</p>}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      {opp.agency && <div><span className="text-[#94a3b8]">Agency:</span> <span className="text-[#0f172a]">{opp.agency}</span></div>}
                      {opp.posted_date && <div><span className="text-[#94a3b8]">Posted:</span> <span className="text-[#0f172a]">{new Date(opp.posted_date).toLocaleDateString()}</span></div>}
                      {opp.response_deadline && <div><span className="text-[#94a3b8]">Deadline:</span> <span className="text-[#0f172a]">{new Date(opp.response_deadline).toLocaleDateString()}</span></div>}
                      {opp.solicitation_number && <div><span className="text-[#94a3b8]">Solicitation:</span> <span className="text-[#0f172a] font-mono">{opp.solicitation_number}</span></div>}
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
                className="px-6 py-2.5 text-sm font-medium border border-[#e5e7eb] text-[#64748b] bg-white hover:border-[#e2e8f0] hover:text-[#0f172a] hover:shadow-sm rounded-xl transition-all"
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
