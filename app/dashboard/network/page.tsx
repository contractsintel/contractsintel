"use client";

import { useDashboard } from "../context";
import { isTeam } from "@/lib/feature-gate";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HelpButton } from "../help-panel";
import { TrialTierBanner } from "../trial-banner";
import { InlineGuide } from "../inline-guide";
import { ProfileBoostBanner } from "../unlock-panel";
import { TEAMING_WEIGHTS } from "@/app/lib/teaming-weights";

type Tab = "opportunities" | "posted" | "sub_awards" | "partners";

type SubAward = {
  id: string;
  prime_award_id: string | null;
  prime_contractor: string | null;
  sub_vendor: string;
  sub_uei: string | null;
  agency: string | null;
  naics_code: string | null;
  description: string | null;
  value: number | null;
  awarded_at: string | null;
  source: string | null;
  source_url: string | null;
};

// G11 Teaming partner directory
type TeamingPartner = {
  id: string;
  name: string;
  uei: string | null;
  cage_code: string | null;
  website: string | null;
  summary: string | null;
  naics_codes: string[];
  set_asides: string[];
  state: string | null;
  city: string | null;
  capabilities: string[];
  past_agencies: string[];
  employee_range: string | null;
  contact_email: string | null;
};

type TeamingOpportunity = {
  id: string;
  organization_id: string;
  title: string;
  description?: string;
  estimated_value?: number | null;
  agency?: string;
  required_certs?: string[];
  naics_codes?: string[];
  geography?: string;
  deadline?: string | null;
  created_at: string;
  teaming_matches?: Array<{ id: string; interest_status: string }>;
};

export default function NetworkPage() {
  const { organization } = useDashboard();
  const supabase = createClient();
  // Do NOT pass `organization` — isTeam(plan, org) returns true during
  // active trials, which incorrectly bypasses the Team-tier gate for
  // Discovery trial users. Check the raw plan value only.
  const teamTier = isTeam(organization.plan);

  const [tab, setTab] = useState<Tab>("opportunities");
  const [opportunities, setOpportunities] = useState<TeamingOpportunity[]>([]);
  const [posted, setPosted] = useState<TeamingOpportunity[]>([]);
  const [subAwards, setSubAwards] = useState<SubAward[]>([]);
  const [subAwardsLoading, setSubAwardsLoading] = useState(false);
  const [subAwardsError, setSubAwardsError] = useState<string | null>(null);
  const [partners, setPartners] = useState<TeamingPartner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState<string | null>(null);
  const [partnerFilters, setPartnerFilters] = useState({ naics: "", set_aside: "", state: "", q: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expressingInterest, setExpressingInterest] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    estimated_value: "",
    agency: "",
    required_certs: "",
    naics_codes: "",
    geography: "",
    deadline: "",
  });

  const loadData = useCallback(async () => {
    if (!teamTier) { setLoading(false); return; }
    const [oppsRes, postedRes] = await Promise.all([
      supabase
        .from("teaming_opportunities")
        .select("*, teaming_matches(id, interest_status)")
        .neq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("teaming_opportunities")
        .select("*, teaming_matches(id, interest_status)")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false }),
    ]);
    setOpportunities(oppsRes.data ?? []);
    setPosted(postedRes.data ?? []);
    setLoading(false);
  }, [organization.id, teamTier, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (tab !== "sub_awards") return;
    let cancelled = false;
    setSubAwardsLoading(true);
    setSubAwardsError(null);
    (async () => {
      try {
        const res = await fetch("/api/sub-awards?limit=50");
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setSubAwardsError(j.error ?? "Failed to load sub-awards");
        } else {
          setSubAwards(j.sub_awards ?? []);
        }
      } catch (e: unknown) {
        if (!cancelled) setSubAwardsError(e instanceof Error ? e.message : "Failed to load sub-awards");
      } finally {
        if (!cancelled) setSubAwardsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  // G11: teaming partner directory
  useEffect(() => {
    if (tab !== "partners") return;
    let cancelled = false;
    setPartnersLoading(true);
    setPartnersError(null);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (partnerFilters.naics) params.set("naics", partnerFilters.naics);
        if (partnerFilters.set_aside) params.set("set_aside", partnerFilters.set_aside);
        if (partnerFilters.state) params.set("state", partnerFilters.state);
        if (partnerFilters.q) params.set("q", partnerFilters.q);
        const res = await fetch(`/api/teaming/partners?${params.toString()}`);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) setPartnersError(j.error ?? "Failed to load partners");
        else setPartners(j.partners ?? []);
      } catch (e: unknown) {
        if (!cancelled) setPartnersError(e instanceof Error ? e.message : "Failed to load partners");
      } finally {
        if (!cancelled) setPartnersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, partnerFilters]);

  const expressInterest = async (opportunityId: string) => {
    setExpressingInterest(opportunityId);
    try {
      const res = await fetch("/api/teaming/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teaming_opportunity_id: opportunityId }),
      });
      if (res.ok) {
        // Fire-and-forget notification — silent if Resend isn't configured
        fetch("/api/network/notify-interest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teaming_opportunity_id: opportunityId }),
        }).catch(() => {});
        setToast("Interest sent — the poster will be notified");
      } else {
        setToast("Failed to send interest. Try again.");
      }
      loadData();
    } catch {
      setToast("Failed to send interest. Try again.");
    }
    setExpressingInterest(null);
    setTimeout(() => setToast(null), 3500);
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    setSubmitting(true);
    try {
      await fetch("/api/teaming/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
          agency: form.agency,
          required_certs: form.required_certs.split(",").map((s) => s.trim()).filter(Boolean),
          naics_codes: form.naics_codes.split(",").map((s) => s.trim()).filter(Boolean),
          geography: form.geography,
          deadline: form.deadline || null,
        }),
      });
      setForm({ title: "", description: "", estimated_value: "", agency: "", required_certs: "", naics_codes: "", geography: "", deadline: "" });
      loadData();
    } catch {
      // silent
    }
    setSubmitting(false);
  };

  const computeMatchScore = (opp: TeamingOpportunity): number => {
    let score = 0;
    const oppNaics: string[] = opp.naics_codes ?? [];
    const oppCerts: string[] = opp.required_certs ?? [];
    const orgNaics = organization.naics_codes ?? [];
    const orgCerts = organization.certifications ?? [];
    if (oppNaics.some((n: string) => orgNaics.includes(n))) score += TEAMING_WEIGHTS.naicsMatch;
    if (oppCerts.some((c: string) => orgCerts.includes(c))) score += TEAMING_WEIGHTS.certMatch;
    if (oppNaics.length === 0 && oppCerts.length === 0) score += TEAMING_WEIGHTS.unrestrictedBonus;
    if (score === 0) score = TEAMING_WEIGHTS.baselineFloor;
    return Math.min(score, TEAMING_WEIGHTS.maxScore);
  };

  if (!teamTier) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="border border-[#e5e7eb] bg-white p-8 max-w-md text-center">
            <svg className="w-12 h-12 text-[#94a3b8] mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">Subcontracting Network — Team Feature</h2>
            <p className="text-sm text-[#64748b] mb-4">
              Find teaming partners and post subcontracting opportunities.
            </p>
            <Link href="/dashboard/settings" className="inline-block bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
              Upgrade to Team
            </Link>
          </div>
        </div>
        <div className="filter blur-[2px] opacity-40 pointer-events-none select-none" aria-hidden="true">
          <h1 className="ci-page-title">Subcontracting Network</h1>
          <div className="space-y-3 mt-6">
            {[1,2,3].map(i => (
              <div key={i} className="border border-[#e5e7eb] bg-white p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#f1f5f9]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/5 bg-[#f1f5f9] rounded" />
                  <div className="h-2 w-1/3 bg-[#f1f5f9] rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{backgroundColor: "#2563eb"}} />
          <h1 className="ci-page-title">Subcontracting Network</h1>
</div>
        <HelpButton page="network" />
      </div>
      <InlineGuide page="network" />
      <ProfileBoostBanner context="competitors" />

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[#e5e7eb] mb-6">
        <button
          onClick={() => setTab("opportunities")}
          className={`px-5 py-2.5 text-sm transition-colors border-b-2 ${
            tab === "opportunities"
              ? "text-[#0f172a] border-[#2563eb]"
              : "text-[#64748b] border-transparent hover:text-[#0f172a]"
          }`}
        >
          Opportunities for You
        </button>
        <button
          onClick={() => setTab("posted")}
          className={`px-5 py-2.5 text-sm transition-colors border-b-2 ${
            tab === "posted"
              ? "text-[#0f172a] border-[#2563eb]"
              : "text-[#64748b] border-transparent hover:text-[#0f172a]"
          }`}
        >
          Your Posted Opportunities
        </button>
        <button
          onClick={() => setTab("sub_awards")}
          className={`px-5 py-2.5 text-sm transition-colors border-b-2 ${
            tab === "sub_awards"
              ? "text-[#0f172a] border-[#2563eb]"
              : "text-[#64748b] border-transparent hover:text-[#0f172a]"
          }`}
        >
          Public Sub-Awards
        </button>
        <button
          onClick={() => setTab("partners")}
          data-testid="tab-partners"
          className={`px-5 py-2.5 text-sm transition-colors border-b-2 ${
            tab === "partners"
              ? "text-[#0f172a] border-[#2563eb]"
              : "text-[#64748b] border-transparent hover:text-[#0f172a]"
          }`}
        >
          Find Partners
        </button>
      </div>

      {tab === "partners" ? (
        <div data-testid="partners-panel">
          <p className="text-xs text-[#64748b] mb-4">
            Directory of registered small-business partners you can team with. Filter by NAICS,
            set-aside, or state to find primes or subs that fit your next capture.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Search name or summary"
              value={partnerFilters.q}
              onChange={(e) => setPartnerFilters((f) => ({ ...f, q: e.target.value }))}
              className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-sm rounded"
            />
            <select
              value={partnerFilters.naics}
              onChange={(e) => setPartnerFilters((f) => ({ ...f, naics: e.target.value }))}
              className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-sm rounded"
            >
              <option value="">Any NAICS</option>
              {Array.from(new Set(partners.map(p => p.naics_codes || []).flat().filter(Boolean))).sort().map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select
              value={partnerFilters.set_aside}
              onChange={(e) => setPartnerFilters((f) => ({ ...f, set_aside: e.target.value }))}
              className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-sm rounded"
            >
              <option value="">Any set-aside</option>
              <option value="8(a)">8(a)</option>
              <option value="SDVOSB">SDVOSB</option>
              <option value="WOSB">WOSB</option>
              <option value="EDWOSB">EDWOSB</option>
              <option value="HUBZone">HUBZone</option>
            </select>
            <select
              value={partnerFilters.state}
              onChange={(e) => setPartnerFilters((f) => ({ ...f, state: e.target.value }))}
              className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-sm rounded"
            >
              <option value="">Any state</option>
              {["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX","UT","VT","VA","VI","WA","WV","WI","WY"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {partnersLoading ? (
            <div className="text-center text-[#94a3b8] py-12 text-sm">Loading partners...</div>
          ) : partnersError ? (
            <div className="text-center text-[#dc2626] py-12 text-sm">{partnersError}</div>
          ) : partners.length === 0 ? (
            <div className="border border-[#e5e7eb] bg-white p-12 text-center text-sm text-[#64748b]">
              No partners match the current filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="partner-grid">
              {partners.map((p) => (
                <div
                  key={p.id}
                  data-testid="partner-card"
                  className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[#0f172a]">{p.name}</h3>
                      <p className="text-xs text-[#64748b] mt-1">
                        {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                        {p.employee_range ? ` · ${p.employee_range} employees` : ""}
                      </p>
                      {p.summary && (
                        <p className="text-xs text-[#475569] mt-2 line-clamp-2">{p.summary}</p>
                      )}
                    </div>
                    {p.website && (
                      <a
                        href={p.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#2563eb] hover:underline whitespace-nowrap"
                      >
                        Website →
                      </a>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.set_asides.map((sa) => (
                      <span key={sa} className="text-[10px] font-mono bg-[#eff6ff] text-[#1d4ed8] px-2 py-0.5 rounded">
                        {sa}
                      </span>
                    ))}
                    {p.naics_codes.map((n) => (
                      <span key={n} className="text-[10px] font-mono bg-[#f1f5f9] text-[#475569] px-2 py-0.5 rounded">
                        {n}
                      </span>
                    ))}
                  </div>
                  {p.capabilities.length > 0 && (
                    <div className="mt-2 text-[11px] text-[#64748b]">
                      <span className="uppercase tracking-wide text-[#94a3b8]">Capabilities:</span>{" "}
                      {p.capabilities.join(", ")}
                    </div>
                  )}
                  {p.past_agencies.length > 0 && (
                    <div className="mt-1 text-[11px] text-[#64748b]">
                      <span className="uppercase tracking-wide text-[#94a3b8]">Past agencies:</span>{" "}
                      {p.past_agencies.join(", ")}
                    </div>
                  )}
                  {p.contact_email && (
                    <a
                      href={`mailto:${p.contact_email}`}
                      className="mt-3 inline-block text-xs text-[#2563eb] hover:underline"
                    >
                      {p.contact_email}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "sub_awards" ? (
        <div>
          <p className="text-xs text-[#64748b] mb-4">
            Public subcontract awards posted under federal prime contracts. Sourced from USAspending /
            FPDS sub-award feeds.
          </p>
          {subAwardsLoading ? (
            <div className="text-center text-[#94a3b8] py-12 text-sm">Loading sub-awards...</div>
          ) : subAwardsError ? (
            <div className="text-center text-[#dc2626] py-12 text-sm">{subAwardsError}</div>
          ) : subAwards.length === 0 ? (
            <div className="border border-[#e5e7eb] bg-white p-12 text-center">
              <div className="text-[#94a3b8] text-lg mb-2">No public sub-awards on file</div>
              <p className="text-sm text-[#64748b]">
                Sub-award rows will appear here once the USAspending feed has been ingested.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {subAwards.map((sa) => (
                <div
                  key={sa.id}
                  className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm text-[#0f172a] font-medium break-words">
                        {sa.sub_vendor}
                        {sa.prime_contractor ? (
                          <span className="text-[#64748b] font-normal"> · sub to {sa.prime_contractor}</span>
                        ) : null}
                      </h3>
                      <p className="text-xs text-[#64748b] mt-1">
                        {sa.agency ?? "Unknown agency"}
                        {sa.naics_code ? ` · NAICS ${sa.naics_code}` : ""}
                        {sa.prime_award_id ? ` · PIID ${sa.prime_award_id}` : ""}
                      </p>
                      {sa.description && (
                        <p className="text-xs text-[#64748b] mt-2 line-clamp-2">{sa.description}</p>
                      )}
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-mono bg-[#eff6ff] text-[#1d4ed8] rounded">
                      SUB-AWARD
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3 text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-4">
                      {sa.value != null && (
                        <span className="text-xs font-mono text-[#0f172a]">
                          ${Number(sa.value).toLocaleString()}
                        </span>
                      )}
                      {sa.awarded_at && (
                        <span className="text-xs font-mono text-[#94a3b8]">
                          Awarded {new Date(sa.awarded_at).toLocaleDateString()}
                        </span>
                      )}
                      {sa.sub_uei && (
                        <span className="text-xs font-mono text-[#94a3b8]">UEI {sa.sub_uei}</span>
                      )}
                    </div>
                    {sa.source_url && (
                      <a
                        href={sa.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#3b82f6] hover:underline"
                      >
                        Source →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="text-center text-[#94a3b8] py-12">Loading...</div>
      ) : tab === "opportunities" ? (
        <div>
          {opportunities.length === 0 ? (
            <div className="border border-[#e5e7eb] bg-white p-12 text-center">
              <div className="text-[#94a3b8] text-lg mb-2">No matching opportunities</div>
              <p className="text-sm text-[#64748b]">New teaming opportunities matching your profile will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {opportunities.map((opp) => {
                const score = computeMatchScore(opp);
                const alreadyInterested = opp.teaming_matches?.some(
                  (m: { id: string; interest_status: string }) => m.interest_status === "interested"
                );
                return (
                  <div key={opp.id} className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-sm text-[#0f172a] font-medium">{opp.title}</h3>
                          <span className={`px-2 py-0.5 text-[10px] font-mono ${
                            score >= 70 ? "bg-[#22c55e]/10 text-[#22c55e]" :
                            score >= 40 ? "bg-[#f59e0b]/10 text-[#f59e0b]" :
                            "bg-[#9ca3af]/10 text-[#94a3b8]"
                          }`}>
                            {score}% match
                          </span>
                        </div>
                        {opp.agency && <p className="text-xs text-[#64748b]">{opp.agency}</p>}
                        {opp.description && <p className="text-sm text-[#64748b] mt-2">{opp.description}</p>}
                        <div className="flex items-center gap-4 mt-2">
                          {opp.estimated_value && (
                            <span className="text-xs font-mono text-[#0f172a]">
                              ${Number(opp.estimated_value).toLocaleString()}
                            </span>
                          )}
                          {(opp.naics_codes?.length ?? 0) > 0 && (
                            <span className="text-xs font-mono text-[#94a3b8]">
                              NAICS: {opp.naics_codes!.join(", ")}
                            </span>
                          )}
                          {opp.deadline && (
                            <span className="text-xs font-mono text-[#94a3b8]">
                              Due: {new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-4">
                        {alreadyInterested ? (
                          <span className="px-3 py-1 text-xs text-[#22c55e] bg-[#22c55e]/10">Interested</span>
                        ) : (
                          <button
                            onClick={() => expressInterest(opp.id)}
                            disabled={expressingInterest === opp.id}
                            className="px-3 py-1 text-xs bg-[#2563eb] text-white hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
                          >
                            {expressingInterest === opp.id ? "..." : "Express Interest"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Post Form */}
          <div className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
            <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-4">Post Teaming Opportunity</h2>
            <form onSubmit={handlePost} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                    placeholder="Opportunity title"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">Agency</label>
                  <select
                    value={form.agency}
                    onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  >
                    <option value="">Select agency</option>
                    {["DoD","Army","Navy","Air Force","Marines","Space Force","DHS","VA","HHS","GSA","DOE","DOT","EPA","NASA","USDA","DOJ","DOI","DOL","Commerce","Treasury","State","Education","HUD","SBA","USAID","SSA","OPM","FEMA","CBP","ICE","USCG","FBI","DEA","DISA","DARPA","NGA","USACE","MDA","DHA","NRC","FAA","NOAA","IRS"].map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">Estimated Value</label>
                  <input
                    type="number"
                    value={form.estimated_value}
                    onChange={(e) => setForm((f) => ({ ...f, estimated_value: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">Geography</label>
                  <select
                    value={form.geography}
                    onChange={(e) => setForm((f) => ({ ...f, geography: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  >
                    <option value="">Select state</option>
                    <option value="Nationwide">Nationwide</option>
                    {["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX","UT","VT","VA","VI","WA","WV","WI","WY"].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">Required Certs</label>
                  <div className="flex flex-wrap gap-2">
                    {["8(a)", "SDVOSB", "WOSB", "EDWOSB", "HUBZone", "Small Business"].map(cert => {
                      const selected = form.required_certs.split(",").map(s => s.trim()).filter(Boolean).includes(cert);
                      return (
                        <button key={cert} type="button"
                          onClick={() => {
                            const current = form.required_certs.split(",").map(s => s.trim()).filter(Boolean);
                            const next = selected ? current.filter(c => c !== cert) : [...current, cert];
                            setForm(f => ({ ...f, required_certs: next.join(", ") }));
                          }}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                            selected
                              ? "bg-[#2563eb] text-white border-[#2563eb]"
                              : "bg-[#f8f9fb] text-[#64748b] border-[#e5e7eb] hover:border-[#cbd5e1]"
                          }`}>
                          {cert}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">NAICS Codes</label>
                  <div className="flex flex-wrap gap-2">
                    {(organization.naics_codes ?? []).map((code: string) => {
                      const selected = form.naics_codes.split(",").map(s => s.trim()).filter(Boolean).includes(code);
                      return (
                        <button key={code} type="button"
                          onClick={() => {
                            const current = form.naics_codes.split(",").map(s => s.trim()).filter(Boolean);
                            const next = selected ? current.filter(c => c !== code) : [...current, code];
                            setForm(f => ({ ...f, naics_codes: next.join(", ") }));
                          }}
                          className={`px-3 py-1.5 text-xs font-mono rounded-full border transition-colors ${
                            selected
                              ? "bg-[#2563eb] text-white border-[#2563eb]"
                              : "bg-[#f8f9fb] text-[#64748b] border-[#e5e7eb] hover:border-[#cbd5e1]"
                          }`}>
                          {code}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                    className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-4 py-2 text-sm focus:outline-none focus:border-[#2563eb] resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !form.title}
                className="bg-[#2563eb] text-white px-6 py-2 text-sm font-medium hover:bg-[#3b82f6] transition-colors disabled:opacity-50"
              >
                {submitting ? "Posting..." : "Post Opportunity"}
              </button>
            </form>
          </div>

          {/* Posted List */}
          {posted.length === 0 ? (
            <div className="border border-[#e5e7eb] bg-white p-12 text-center">
              <div className="text-[#94a3b8] text-lg mb-2">No posted opportunities</div>
              <p className="text-sm text-[#64748b]">Post your first teaming opportunity above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posted.map((opp) => {
                const matchCount = opp.teaming_matches?.filter(
                  (m: { id: string; interest_status: string }) => m.interest_status === "interested"
                ).length ?? 0;
                return (
                  <div key={opp.id} className="border border-[#e5e7eb] bg-white p-5 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm text-[#0f172a] font-medium">{opp.title}</h3>
                        {opp.agency && <p className="text-xs text-[#64748b] mt-0.5">{opp.agency}</p>}
                        <div className="flex items-center gap-4 mt-2">
                          {opp.estimated_value && (
                            <span className="text-xs font-mono text-[#0f172a]">
                              ${Number(opp.estimated_value).toLocaleString()}
                            </span>
                          )}
                          {opp.deadline && (
                            <span className="text-xs font-mono text-[#94a3b8]">
                              Due: {new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-mono ${
                        matchCount > 0 ? "bg-[#22c55e]/10 text-[#22c55e]" : "bg-[#9ca3af]/10 text-[#94a3b8]"
                      }`}>
                        {matchCount} interested
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 text-sm font-medium text-white bg-[#111827] shadow-lg rounded">
          {toast}
        </div>
      )}
    </div>
  );
}
