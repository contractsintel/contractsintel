"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Opp = {
  id: string;
  title: string;
  agency: string | null;
  source: string | null;
  naics_code: string | null;
  opportunity_type: string;
  response_deadline: string | null;
  posted_date: string | null;
  estimated_value: number | null;
  full_description: string | null;
};

export default function SbirSttrSearchPage() {
  const [tab, setTab] = useState<"sbir" | "sttr">("sbir");
  const [opps, setOpps] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await fetch(`/api/opportunities/by-type?type=${tab}&limit=50`);
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(j.error ?? "Failed to load");
        } else {
          setOpps(j.opportunities ?? []);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="ci-page-title">SBIR / STTR Opportunities</h1>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/dashboard/search" className="text-[#3b82f6] hover:underline">
            Contracts
          </Link>
          <span className="text-[#cbd5e1]">·</span>
          <Link href="/dashboard/search/grants" className="text-[#3b82f6] hover:underline">
            Grants
          </Link>
          <span className="text-[#cbd5e1]">·</span>
          <span className="text-[#0f172a] font-medium">SBIR / STTR</span>
        </div>
      </div>

      <div className="inline-flex border border-[#e5e7eb] rounded-lg overflow-hidden mb-4">
        {(["sbir", "sttr"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium uppercase tracking-wide ${
              tab === t ? "bg-[#2563eb] text-white" : "bg-white text-[#64748b] hover:bg-[#f8f9fb]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-[#94a3b8] py-12 text-sm">Loading {tab.toUpperCase()}...</div>
      ) : error ? (
        <div className="text-center text-[#dc2626] py-12 text-sm">{error}</div>
      ) : opps.length === 0 ? (
        <div className="text-center text-[#94a3b8] py-12 text-sm">
          No {tab.toUpperCase()} solicitations on file yet.
        </div>
      ) : (
        <div className="space-y-3">
          {opps.map((o) => (
            <div key={o.id} className="border border-[#e5e7eb] bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-[#0f172a] break-words">{o.title}</h3>
                  <p className="text-xs text-[#64748b] mt-1">
                    {o.agency}
                    {o.naics_code ? ` · NAICS ${o.naics_code}` : ""}
                    {o.posted_date ? ` · Posted ${new Date(o.posted_date).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                    tab === "sbir"
                      ? "bg-[#eff6ff] text-[#1d4ed8]"
                      : "bg-[#fefce8] text-[#a16207]"
                  }`}
                >
                  {tab.toUpperCase()}
                </span>
              </div>
              {o.full_description && (
                <p className="text-xs text-[#64748b] mt-2 line-clamp-2">{o.full_description}</p>
              )}
              <div className="flex items-center justify-between mt-3 text-xs flex-wrap gap-2">
                <div className="text-[#94a3b8] font-mono">
                  {o.response_deadline
                    ? `Due ${new Date(o.response_deadline).toLocaleDateString()}`
                    : "Rolling"}
                </div>
                <Link
                  href={`/dashboard/opportunity/${o.id}`}
                  className="text-[#3b82f6] hover:underline"
                >
                  Open →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
