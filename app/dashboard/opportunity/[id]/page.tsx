"use client";

import { useDashboard } from "../../context";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { htmlToPlainText } from "@/app/lib/html";

function formatCurrency(n: number | null | undefined): string {
  if (!n || n <= 0) return "TBD";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function cleanTitle(s: string): string {
  return (s || "").replace(/^\[[^\]]*\]\s*/, "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n))).replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}

export default function OpportunityDetailPage() {
  const { organization } = useDashboard();
  const params = useParams();
  const oppId = params.id as string;
  const supabase = createClient();

  const [opp, setOpp] = useState<any>(null);
  const [match, setMatch] = useState<any>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [toast, setToast] = useState("");
  const [expandDesc, setExpandDesc] = useState(false);

  useEffect(() => {
    (async () => {
      // Load opportunity
      const { data: oppData } = await supabase.from("opportunities").select("*").eq("id", oppId).single();
      setOpp(oppData);

      // Load match for this org
      const { data: matchData } = await supabase
        .from("opportunity_matches")
        .select("*")
        .eq("opportunity_id", oppId)
        .eq("organization_id", organization.id)
        .single();
      setMatch(matchData);
      if (matchData?.user_notes) setNoteText(matchData.user_notes);

      // Load related opportunities (same NAICS or agency)
      if (oppData?.naics_code) {
        const { data: rel } = await supabase
          .from("opportunities")
          .select("id, title, agency, source, response_deadline")
          .eq("naics_code", oppData.naics_code)
          .neq("id", oppId)
          .neq("status", "expired")
          .order("created_at", { ascending: false })
          .limit(5);
        setRelated(rel ?? []);
      }

      setLoading(false);
    })();
  }, [oppId, organization.id, supabase]);

  const updateStatus = async (status: string) => {
    if (!match) return;
    await fetch("/api/opportunities/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: match.id, status }),
    });
    setMatch({ ...match, user_status: status });
    setToast(status === "tracking" ? "Tracking" : status === "bidding" ? "Preparing Bid" : "Skipped");
    setTimeout(() => setToast(""), 3000);
  };

  const saveNote = async () => {
    if (!match) return;
    await fetch("/api/opportunities/update-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: match.id, notes: noteText }),
    });
    setMatch({ ...match, user_notes: noteText });
    setEditingNote(false);
    setToast("Note saved");
    setTimeout(() => setToast(""), 3000);
  };

  // P1.3: Allow user to track an opportunity that has no match row yet.
  // Inserts a fresh opportunity_matches row with pipeline_stage='monitoring'.
  const trackOpportunity = async () => {
    const { data: inserted, error } = await supabase
      .from("opportunity_matches")
      .insert({
        organization_id: organization.id,
        opportunity_id: oppId,
        match_score: 0,
        bid_recommendation: "monitor",
        recommendation_reasoning: "Manually tracked from opportunity detail page.",
        user_status: "tracking",
        pipeline_stage: "monitoring",
        is_demo: false,
      })
      .select()
      .single();
    if (error) {
      setToast("Failed to track — try again");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setMatch(inserted);
    setToast("Now tracking");
    setTimeout(() => setToast(""), 3000);
  };

  if (loading) return <div className="p-12 text-center text-[#94a3b8]">Loading contract details...</div>;
  if (!opp) return <div className="p-12 text-center text-[#94a3b8]">Contract not found</div>;

  const days = daysUntil(opp.response_deadline);
  const deadlineColor = days !== null && days <= 7 ? "text-[#dc2626]" : days !== null && days <= 14 ? "text-[#d97706]" : "text-[#059669]";
  const val = opp.estimated_value ?? opp.value_estimate ?? 0;
  const attachments = (() => { try { return JSON.parse(opp.attachments || "[]"); } catch { return []; } })();

  const sourceLabel: Record<string, string> = {
    sam_gov: "SAM.gov", usaspending: "USASpending", grants_gov: "Grants.gov",
    federal_civilian: "Federal Civilian", sbir_sttr: "SBIR/STTR", military_defense: "Military/Defense",
    subcontracting: "Subcontracting", forecasts: "Forecasts",
  };
  const sourceName = sourceLabel[opp.source] || (opp.source?.startsWith("state_") ? opp.source.replace("state_", "").toUpperCase() : opp.source || "Unknown");
  const sourceSearchUrls: Record<string, string> = {
    sam_gov: "https://sam.gov/search/?index=opp",
    usaspending: "https://www.usaspending.gov/search",
    grants_gov: "https://www.grants.gov/search-grants",
  };
  const hasValidUrl = opp.sam_url || (opp.source_url && !opp.source_url.includes("undefined"));
  const isExpired = opp.status === "expired" || (days !== null && days < 0);
  const isRecompete = opp.source === "usaspending";

  return (
    <div className="max-w-4xl">
      {/* Back link */}
      <Link href="/dashboard" className="text-sm text-[#2563eb] hover:text-[#1d4ed8] mb-4 inline-block">&larr; Back to matches</Link>

      {/* Header */}
      <div className="ci-card p-6 mb-6">
        <div className="flex items-start gap-4">
          {match && (
            <div className={`ci-score-ring text-xl ${match.match_score >= 90 ? "border-[#059669] text-[#059669]" : match.match_score >= 80 ? "border-[#2563eb] text-[#2563eb]" : match.match_score >= 70 ? "border-[#d97706] text-[#d97706]" : "border-[#94a3b8] text-[#94a3b8]"}`}>
              {match.match_score}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="ci-serif text-[24px] tracking-[-0.01em] text-[#0f172a] mb-1">{cleanTitle(opp.title)}</h1>
            <p className="text-[14px] text-[#475569] mb-1">{opp.agency}</p>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#f1f5f9] text-[#475569]">{sourceName}</span>
              {isExpired && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#fef2f2] text-[#dc2626]">Expired</span>}
              {isRecompete && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#fefce8] text-[#a16207]">Recompete Alert</span>}
              {opp.set_aside_type && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#ecfdf5] text-[#059669]">{opp.set_aside_type}</span>}
            </div>
            <div className="flex items-center gap-2">
              {match?.user_status === "tracking" ? (
                <span className="px-3 py-1.5 text-xs text-[#059669] bg-[#ecfdf5] rounded-lg font-medium">Tracking</span>
              ) : match?.user_status === "bidding" ? (
                <span className="px-3 py-1.5 text-xs text-[#2563eb] bg-[#eff6ff] rounded-lg font-medium">Preparing Bid</span>
              ) : match ? (
                <>
                  <button onClick={() => updateStatus("tracking")} className="px-4 py-1.5 text-xs border border-[#e2e8f0] text-[#475569] hover:border-[#059669] hover:text-[#059669] rounded-lg ci-btn">Track</button>
                  <button onClick={() => updateStatus("bidding")} className="px-4 py-1.5 text-xs bg-[#2563eb] text-white hover:bg-[#1d4ed8] rounded-lg ci-btn">Bid</button>
                  <button onClick={() => updateStatus("skipped")} className="px-4 py-1.5 text-xs text-[#94a3b8] hover:text-[#475569] rounded-lg ci-btn">Skip</button>
                </>
              ) : null}
              {opp.response_deadline && (
                <a href={`https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(cleanTitle(opp.title))}&dates=${opp.response_deadline.replace(/-/g,"").substring(0,8)}/${opp.response_deadline.replace(/-/g,"").substring(0,8)}&details=${encodeURIComponent(`Deadline for ${opp.solicitation_number || opp.title}`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs border border-[#e2e8f0] text-[#475569] hover:bg-[#f1f5f9] rounded-lg ci-btn">
                  Add to Calendar
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key Details */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Key Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
              <div><span className="text-[#94a3b8]">Solicitation</span><div className="ci-mono text-[#0f172a] font-medium mt-0.5">{opp.solicitation_number || <span className="text-[#94a3b8] italic font-normal">Not specified</span>}</div></div>
              <div><span className="text-[#94a3b8]">Value</span><div className="text-[#0f172a] font-semibold mt-0.5">{formatCurrency(val)}</div></div>
              <div><span className="text-[#94a3b8]">Set-Aside</span><div className="text-[#0f172a] mt-0.5">{opp.set_aside_description || opp.set_aside_type || <span className="text-[#94a3b8] italic">Full & Open</span>}</div></div>
              <div><span className="text-[#94a3b8]">NAICS Code</span><div className="ci-mono text-[#0f172a] mt-0.5">{opp.naics_code ? `${opp.naics_code}${opp.naics_description ? ` — ${opp.naics_description}` : ""}` : <span className="text-[#94a3b8] italic font-normal">Not specified</span>}</div></div>
              <div><span className="text-[#94a3b8]">Response Deadline</span><div className={`font-medium mt-0.5 ${opp.response_deadline ? deadlineColor : "text-[#94a3b8]"}`}>{opp.response_deadline ? `${new Date(opp.response_deadline).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}${days !== null ? ` (${days > 0 ? days + "d left" : "passed"})` : ""}` : <span className="italic font-normal">Check solicitation</span>}</div></div>
              <div><span className="text-[#94a3b8]">Location</span><div className="text-[#0f172a] mt-0.5">{opp.place_of_performance || <span className="text-[#94a3b8] italic">Not specified</span>}</div></div>
              {opp.contract_type && <div><span className="text-[#94a3b8]">Contract Type</span><div className="text-[#0f172a] mt-0.5">{opp.contract_type}</div></div>}
              {opp.period_of_performance && <div><span className="text-[#94a3b8]">Period of Performance</span><div className="text-[#0f172a] mt-0.5">{opp.period_of_performance}</div></div>}
              <div><span className="text-[#94a3b8]">Posted</span><div className="text-[#0f172a] mt-0.5">{opp.posted_date ? new Date(opp.posted_date).toLocaleDateString() : <span className="text-[#94a3b8] italic">Unknown</span>}</div></div>
              <div><span className="text-[#94a3b8]">Source</span><div className="text-[#0f172a] mt-0.5">{sourceName}</div></div>
              {opp.incumbent_name && <div><span className="text-[#94a3b8]">Incumbent</span><div className="text-[#0f172a] mt-0.5">{opp.incumbent_name}</div></div>}
            </div>
          </div>

          {/* Full Description */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Description</h2>
            {(() => {
              const plain = htmlToPlainText(opp.full_description || opp.description || "");
              if (!plain) {
                return <p className="text-[13px] text-[#94a3b8] italic">No description available. Check the solicitation documents or the original listing for details.</p>;
              }
              return (
                <div className="relative">
                  <div className={`text-[13px] text-[#475569] leading-relaxed whitespace-pre-wrap ${!expandDesc ? "max-h-[180px] overflow-hidden" : ""}`}>
                    {plain}
                  </div>
                  {!expandDesc && plain.length > 400 && (
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                  )}
                  {plain.length > 400 && (
                    <button onClick={() => setExpandDesc(!expandDesc)}
                      className="mt-2 text-[13px] font-medium text-[#2563eb] hover:text-[#1d4ed8]">
                      {expandDesc ? "Show less" : "Show full description"}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Contact Information */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Contact Information</h2>
            {(opp.contact_name || opp.contact_email || opp.contact_phone) ? (
              <div className="text-[13px] space-y-1">
                {opp.contact_name && <div className="text-[#0f172a] font-medium">{opp.contact_name}</div>}
                {opp.contact_email && <a href={`mailto:${opp.contact_email}`} className="text-[#2563eb] hover:text-[#1d4ed8] block">{opp.contact_email}</a>}
                {opp.contact_phone && <a href={`tel:${opp.contact_phone}`} className="text-[#2563eb] hover:text-[#1d4ed8] block">{opp.contact_phone}</a>}
              </div>
            ) : (
              <p className="text-[13px] text-[#94a3b8] italic">Contact information not available. Check the solicitation documents for contracting officer details.</p>
            )}
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="ci-card p-6">
              <h2 className="ci-section-label mb-4">Documents & Attachments</h2>
              <div className="space-y-2">
                {attachments.map((a: any, i: number) => {
                  const isPdf = (a.url || "").toLowerCase().endsWith(".pdf") || (a.name || "").toLowerCase().endsWith(".pdf");
                  const proxyBase = process.env.NEXT_PUBLIC_ATTACHMENT_PROXY_URL || "https://puppeteer-production-f147.up.railway.app";
                  const proxyUrl = `${proxyBase}/proxy-document?url=${encodeURIComponent(a.url)}`;
                  return (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-[#f1f5f9] hover:bg-[#f8fafc]">
                      <div className="flex items-center gap-2 text-[13px] min-w-0">
                        <svg className="w-4 h-4 shrink-0 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="text-[#0f172a] truncate">{a.name || "Document"}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isPdf && (
                          <a href={proxyUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#2563eb] hover:text-[#1d4ed8] font-medium">View</a>
                        )}
                        <a href={proxyUrl} target="_blank" rel="noopener noreferrer" download className="text-[11px] text-[#475569] hover:text-[#0f172a] font-medium">Download</a>
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#94a3b8] hover:text-[#475569]">Source</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Response Instructions */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Response Instructions</h2>
            {opp.response_instructions ? (
              <div className="text-[13px] text-[#475569] leading-relaxed whitespace-pre-wrap">{opp.response_instructions}</div>
            ) : (
              <p className="text-[13px] text-[#94a3b8] italic">Check the solicitation documents above for submission instructions, or contact the contracting officer.</p>
            )}
          </div>

          {/* Incumbent Info (for recompetes) */}
          {(opp.incumbent_name || isRecompete) && (
            <div className="ci-card p-6">
              <h2 className="ci-section-label mb-4">Incumbent Information</h2>
              {opp.incumbent_name ? (
                <div className="text-[13px] space-y-1">
                  <div className="text-[#0f172a] font-medium">{opp.incumbent_name}</div>
                  {opp.incumbent_value && <div className="text-[#475569]">Previous award: {formatCurrency(opp.incumbent_value)}</div>}
                </div>
              ) : (
                <p className="text-[13px] text-[#94a3b8] italic">Incumbent information not available. Check USASpending.gov for contract history.</p>
              )}
            </div>
          )}

          {/* Find This Contract fallback (when no valid direct URL) */}
          {!hasValidUrl && (
            <div className="ci-card p-6 border-l-4 border-l-[#d97706]">
              <h2 className="ci-section-label mb-4">Find This Contract</h2>
              <div className="text-[13px] text-[#475569] space-y-3">
                {opp.solicitation_number && (
                  <div><span className="text-[#94a3b8]">Solicitation #:</span> <span className="ci-mono font-medium text-[#0f172a] select-all">{opp.solicitation_number}</span></div>
                )}
                <div className="flex flex-wrap gap-2">
                  {sourceSearchUrls[opp.source] && (
                    <a href={sourceSearchUrls[opp.source]} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs border border-[#e2e8f0] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb] rounded-lg">Search on {sourceName}</a>
                  )}
                  <a href={`https://www.google.com/search?q=${encodeURIComponent((opp.solicitation_number || "") + " " + cleanTitle(opp.title))}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs border border-[#e2e8f0] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb] rounded-lg">Search Google</a>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="ci-card p-6">
            <h2 className="ci-section-label mb-4">Timeline</h2>
            <div className="text-[13px] space-y-2">
              {opp.posted_date && <div className="flex justify-between"><span className="text-[#94a3b8]">Posted</span><span className="text-[#0f172a]">{new Date(opp.posted_date).toLocaleDateString()}</span></div>}
              {opp.created_at && <div className="flex justify-between"><span className="text-[#94a3b8]">Scraped</span><span className="text-[#0f172a]">{new Date(opp.created_at).toLocaleDateString()}</span></div>}
              {opp.response_deadline && <div className="flex justify-between"><span className={`${deadlineColor} font-medium`}>Deadline</span><span className={`font-medium ${deadlineColor}`}>{new Date(opp.response_deadline).toLocaleDateString()}{days !== null ? ` (${days > 0 ? days + "d left" : "passed"})` : ""}</span></div>}
              {!opp.posted_date && !opp.response_deadline && <p className="text-[#94a3b8] italic">No date information available.</p>}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Not yet matched — show track CTA when no match row exists */}
          {!match && (
            <div className="ci-card p-5">
              <div className="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold mb-3 bg-[#f1f5f9] text-[#64748b]">
                Not yet matched
              </div>
              <p className="text-[13px] text-[#475569] mb-3">
                This opportunity isn&apos;t in your match list yet. Track it to follow updates and surface it on your dashboard.
              </p>
              <button
                onClick={trackOpportunity}
                className="w-full px-4 py-2 text-xs font-medium bg-[#2563eb] text-white hover:bg-[#1d4ed8] rounded-lg ci-btn"
              >
                Track this opportunity
              </button>
            </div>
          )}

          {/* AI Analysis */}
          {match && (
            <div className="p-5 rounded-xl border border-[#bfdbfe]" style={{background: "linear-gradient(135deg, #eff6ff, #f5f3ff)"}}>
              <h2 className="ci-section-label mb-3">Match Analysis</h2>
              <div className="text-[13px] leading-relaxed">
                <div className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold mb-3 ${
                  match.match_score >= 80 ? "bg-[#ecfdf5] text-[#059669]" :
                  match.match_score >= 70 ? "bg-[#eff6ff] text-[#2563eb]" :
                  match.match_score >= 60 ? "bg-[#fffbeb] text-[#d97706]" :
                  "bg-[#f1f5f9] text-[#64748b]"
                }`}>
                  {match.match_score >= 80 ? "Strong Match" :
                   match.match_score >= 70 ? "Good Potential" :
                   match.match_score >= 60 ? "Partial Match" : "Weak Match"} — {match.match_score}/100
                </div>
                {match.recommendation_reasoning && (
                  <p className="text-[#475569] mb-3">{match.recommendation_reasoning}</p>
                )}
                <div className={`text-xs font-medium px-2 py-1 rounded ${
                  match.bid_recommendation === "bid" ? "bg-[#ecfdf5] text-[#059669]" :
                  match.bid_recommendation === "monitor" ? "bg-[#eff6ff] text-[#2563eb]" :
                  match.bid_recommendation === "recompete" ? "bg-[#fefce8] text-[#a16207]" :
                  "bg-[#f1f5f9] text-[#64748b]"
                }`}>
                  {match.bid_recommendation === "bid" ? "Recommended: Bid" :
                   match.bid_recommendation === "monitor" ? "Recommended: Monitor" :
                   match.bid_recommendation === "recompete" ? "Recompete Alert" :
                   "Low Priority"}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="ci-card p-5">
            <h2 className="ci-section-label mb-3">Notes</h2>
            {editingNote ? (
              <div className="space-y-2">
                <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4}
                  className="w-full px-3 py-2 text-[13px] border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-[#2563eb] resize-none" placeholder="Add notes about this contract..." autoFocus />
                <div className="flex gap-2">
                  <button onClick={saveNote} className="px-3 py-1 text-xs bg-[#2563eb] text-white rounded-lg ci-btn">Save</button>
                  <button onClick={() => setEditingNote(false)} className="text-xs text-[#94a3b8]">Cancel</button>
                </div>
              </div>
            ) : match?.user_notes ? (
              <div>
                <p className="text-[13px] text-[#475569] mb-2">{match.user_notes}</p>
                <button onClick={() => setEditingNote(true)} className="text-xs text-[#2563eb]">Edit note</button>
              </div>
            ) : (
              <button onClick={() => setEditingNote(true)} className="text-[13px] text-[#94a3b8] hover:text-[#475569] italic">Add a note...</button>
            )}
          </div>

          {/* Related Opportunities */}
          {related.length > 0 && (
            <div className="ci-card p-5">
              <h2 className="ci-section-label mb-3">Similar Opportunities</h2>
              <div className="space-y-2">
                {related.map((r) => (
                  <Link key={r.id} href={`/dashboard/opportunity/${r.id}`} className="block text-[13px] text-[#475569] hover:text-[#0f172a] py-1.5 border-b border-[#f1f5f9] last:border-0">
                    <div className="font-medium truncate">{cleanTitle(r.title)}</div>
                    <div className="text-[11px] text-[#94a3b8]">{r.agency}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Verification status */}
          {opp.last_verified_at && (
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  (Date.now() - new Date(opp.last_verified_at).getTime()) < 3 * 86400000 ? "bg-[#22c55e]" : "bg-[#f59e0b]"
                }`} />
                Verified active {(() => {
                  const h = Math.floor((Date.now() - new Date(opp.last_verified_at).getTime()) / 3600000);
                  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
                })()}
              </div>
            </div>
          )}

          {/* Original source link (secondary) */}
          {(opp.sam_url || opp.source_url) && (
            <a href={opp.sam_url || opp.source_url} target="_blank" rel="noopener noreferrer"
              className="block text-[12px] text-[#94a3b8] hover:text-[#475569] text-center">
              View original listing on source website &rarr;
            </a>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-[100] px-4 py-3 bg-white rounded-xl shadow-lg border border-[#e2e8f0] text-sm font-medium text-[#0f172a]" style={{ animation: "slideInRight 0.3s ease" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
