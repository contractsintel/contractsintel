"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Agency {
  id: string;
  name: string;
  acronym: string | null;
  description: string | null;
  website: string | null;
  total_obligations: number | null;
  active_opportunities: number | null;
  parent_agency_id: string | null;
}
interface ChildAgency {
  id: string;
  name: string;
  acronym: string | null;
  active_opportunities: number | null;
}
interface CO {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  office: string | null;
  source: string | null;
}
interface RecentOpp {
  id: string;
  title: string;
  agency: string;
  response_deadline: string | null;
  naics_code: string | null;
  estimated_value: number | null;
}

function fmtCurrency(v: number | null) {
  if (!v) return "—";
  if (v >= 1_000_000_000_000) return `$${(v / 1_000_000_000_000).toFixed(1)}T`;
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function AgencyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [agency, setAgency] = useState<Agency | null>(null);
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null);
  const [children, setChildren] = useState<ChildAgency[]>([]);
  const [recent, setRecent] = useState<RecentOpp[]>([]);
  const [cos, setCos] = useState<CO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [agencyRes, coRes] = await Promise.all([
        fetch(`/api/agencies/${id}`),
        fetch(`/api/agencies/${id}/contracting-officers`),
      ]);
      if (!agencyRes.ok) throw new Error(`Agency HTTP ${agencyRes.status}`);
      const j = await agencyRes.json();
      setAgency(j.agency);
      setParent(j.parent);
      setChildren(j.children || []);
      setRecent(j.recent_opportunities || []);
      if (coRes.ok) {
        const cj = await coRes.json();
        setCos(cj.contracting_officers || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="p-6 text-gray-500">Loading agency profile…</div>;
  if (error)
    return (
      <div className="p-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      </div>
    );
  if (!agency) return <div className="p-6 text-gray-500">Agency not found.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href="/dashboard/agencies" className="text-sm text-blue-600 hover:underline">
          ← All agencies
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4" data-testid="agency-header">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{agency.name}</h1>
          {agency.acronym && (
            <div className="mt-1 text-sm uppercase tracking-wide text-gray-500">{agency.acronym}</div>
          )}
          {parent && (
            <div className="mt-2 text-sm text-gray-600">
              Component of{" "}
              <Link className="text-blue-600 hover:underline" href={`/dashboard/agencies/${parent.id}`}>
                {parent.name}
              </Link>
            </div>
          )}
          {agency.description && (
            <p className="mt-3 max-w-2xl text-sm text-gray-700">{agency.description}</p>
          )}
          {agency.website && (
            <a
              href={agency.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-blue-600 hover:underline"
            >
              {agency.website}
            </a>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-right">
          <div className="text-xs uppercase tracking-wide text-gray-500">Total obligations</div>
          <div className="text-2xl font-bold text-gray-900">{fmtCurrency(agency.total_obligations)}</div>
          <div className="mt-2 text-xs uppercase tracking-wide text-gray-500">Active opportunities</div>
          <div className="text-xl font-semibold text-gray-900">{agency.active_opportunities ?? 0}</div>
        </div>
      </header>

      {children.length > 0 && (
        <section className="mb-6" data-testid="agency-children">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">Components</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/agencies/${c.id}`}
                className="rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300"
              >
                <div className="font-medium text-gray-900">{c.name}</div>
                {c.acronym && <div className="text-xs text-gray-500">{c.acronym}</div>}
                <div className="mt-1 text-xs text-gray-500">{c.active_opportunities ?? 0} active</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6" data-testid="agency-cos">
        <h2 className="mb-2 text-lg font-semibold text-gray-800">
          Contracting Officers <span className="text-sm font-normal text-gray-500">({cos.length})</span>
        </h2>
        {cos.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-500">
            No contracting officer records for this agency yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Office</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cos.map((co) => (
                  <tr key={co.id} data-testid="co-row">
                    <td className="px-4 py-2 font-medium text-gray-900">{co.name}</td>
                    <td className="px-4 py-2 text-gray-700">{co.title || "—"}</td>
                    <td className="px-4 py-2 text-gray-700">{co.office || "—"}</td>
                    <td className="px-4 py-2">
                      {co.email ? (
                        <a className="text-blue-600 hover:underline" href={`mailto:${co.email}`}>
                          {co.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{co.phone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section data-testid="agency-recent-opps">
        <h2 className="mb-2 text-lg font-semibold text-gray-800">Recent Opportunities</h2>
        {recent.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-500">
            No matching opportunities in the index.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((o) => (
              <Link
                key={o.id}
                href={`/dashboard/opportunity/${o.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{o.title}</div>
                    <div className="text-xs text-gray-500">{o.agency} · NAICS {o.naics_code || "—"}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-gray-500">
                    {fmtCurrency(o.estimated_value)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
