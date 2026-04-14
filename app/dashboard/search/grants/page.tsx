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
  sam_url: string | null;
  source_url: string | null;
};

export default function GrantsSearchPage() {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(50);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/opportunities/by-type?type=grant&limit=500");
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? "Failed to load");
        } else {
          setOpps(j.opportunities ?? []);
          setVisible(50);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="ci-page-title">Grants.gov Opportunities</h1>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/dashboard/search" className="text-[#3b82f6] hover:underline">
            Contracts
          </Link>
          <span className="text-[#cbd5e1]">·</span>
          <span className="text-[#0f172a] font-medium">Grants</span>
          <span className="text-[#cbd5e1]">·</span>
          <Link href="/dashboard/search/sbir" className="text-[#3b82f6] hover:underline">
            SBIR / STTR
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-[#94a3b8] py-12 text-sm">Loading grants...</div>
      ) : error || opps.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-4xl">🎓</span>
          <h3 className="text-sm font-medium text-[#0f172a] mt-4">No grants available yet</h3>
          <p className="text-xs text-[#64748b] mt-2 max-w-md mx-auto">
            Grants from Grants.gov will appear here as data is ingested. Check back soon, or search for contracts in the main search.
          </p>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {opps.slice(0, visible).map((o) => (
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
                <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#ecfdf5] text-[#059669]">
                  GRANT
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
        <div className="flex items-center justify-between pt-4 border-t border-[#e5e7eb] mt-4">
          <span className="text-xs text-[#94a3b8]">Showing {Math.min(visible, opps.length)} of {opps.length} grants</span>
          {visible < opps.length && (
            <button onClick={() => setVisible(v => v + 50)} className="px-5 py-2 text-sm font-medium border border-[#e5e7eb] text-[#64748b] bg-white hover:text-[#0f172a] hover:shadow-sm rounded-xl transition-all">
              Load 50 More
            </button>
          )}
        </div>
        </>
      )}
    </div>
  );
}
