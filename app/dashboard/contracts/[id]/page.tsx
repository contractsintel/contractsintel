import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get user's organization to enforce data isolation
  const { data: userRecord } = await supabase
    .from("users")
    .select("organization_id")
    .eq("auth_id", user.id)
    .single();

  if (!userRecord?.organization_id) redirect("/login");

  // Only fetch contracts belonging to the user's organization
  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .eq("organization_id", userRecord.organization_id)
    .single();

  if (!contract) redirect("/dashboard");

  const { data: match } = await supabase
    .from("opportunity_matches")
    .select("*")
    .eq("organization_id", userRecord.organization_id)
    .eq("id", id)
    .single();

  const raw = contract.raw_json || {};
  const contacts = raw.pointOfContact || [];
  const deadline = contract.response_deadline
    ? new Date(contract.response_deadline).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "Not specified";
  const pop = raw.placeOfPerformance;
  const popStr = pop ? [pop.city?.name, pop.state?.name, pop.country?.name].filter(Boolean).join(", ") : "Not specified";

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-[#e5e7eb] bg-white/95 backdrop-blur-md px-6 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">CI</div>
          <span className="font-semibold text-[15px] text-[#0f172a]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
        </Link>
        <Link href="/dashboard" className="text-sm text-[#64748b] hover:text-[#0f172a]">← Back to Dashboard</Link>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="border border-[#e5e7eb] bg-white p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-[#0f172a] mb-2">{contract.title}</h1>
              <p className="text-sm text-[#64748b]">{contract.agency}</p>
            </div>
            {match && (
              <div className="text-center shrink-0">
                <div className={`text-4xl font-bold ${match.match_score >= 70 ? "text-[#22c55e]" : match.match_score >= 40 ? "text-[#eab308]" : "text-[#64748b]"}`}>
                  {match.match_score}
                </div>
                <span className={`${match.bid_recommendation === "bid" ? "bg-[#22c55e]" : match.bid_recommendation === "review" ? "bg-[#eab308]" : "bg-[#6b7280]"} text-white text-[10px] font-mono uppercase px-2 py-0.5 inline-block mt-1`}>
                  {match.bid_recommendation}
                </span>
              </div>
            )}
          </div>
          {match?.reasoning && <p className="text-sm text-[#94a3b8] mt-3 border-t border-[#e5e7eb] pt-3">{match.reasoning}</p>}
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-[1px] bg-[#e5e7eb] rounded-xl overflow-hidden mb-6">
          {[
            ["Notice ID", contract.notice_id],
            ["Type", raw.baseType || raw.type || "N/A"],
            ["NAICS Code", raw.naicsCode || "N/A"],
            ["Set-Aside", raw.typeOfSetAsideDescription || "None"],
            ["Posted", contract.posted_date ? new Date(contract.posted_date).toLocaleDateString() : "N/A"],
            ["Deadline", deadline],
            ["Place of Performance", popStr],
            ["Solicitation #", raw.solicitationNumber || "N/A"],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-white p-4">
              <div className="text-[10px] text-[#94a3b8] font-medium uppercase tracking-wide mb-1">{label}</div>
              <div className="text-sm text-[#0f172a]">{value}</div>
            </div>
          ))}
        </div>

        {/* Contacts */}
        {contacts.length > 0 && (
          <div className="border border-[#e5e7eb] bg-white p-6 mb-6">
            <h2 className="text-xs text-[#94a3b8] font-medium uppercase tracking-wide mb-4">Point of Contact</h2>
            <div className="space-y-3">
              {contacts.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-4 text-sm">
                  <span className="text-[#0f172a] font-medium">{c.fullName || "Unknown"}</span>
                  {c.title && <span className="text-[#94a3b8]">{c.title}</span>}
                  {c.email && <a href={`mailto:${c.email}`} className="text-[#3b82f6] hover:underline">{c.email}</a>}
                  {c.phone && <span className="text-[#64748b]">{c.phone}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SAM.gov Link */}
        {raw.uiLink && (
          <a href={raw.uiLink} target="_blank" rel="noopener noreferrer"
            className="inline-block bg-[#2563eb] text-white px-6 py-3 text-sm font-medium hover:bg-[#3b82f6] transition-colors">
            View on SAM.gov →
          </a>
        )}
      </main>
    </div>
  );
}
