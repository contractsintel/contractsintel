import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();

  if (!contract) redirect("/dashboard");

  const { data: match } = await supabase
    .from("user_matches")
    .select("*")
    .eq("user_id", user.id)
    .eq("contract_id", id)
    .single();

  const raw = contract.raw_json || {};
  const contacts = raw.pointOfContact || [];
  const deadline = contract.response_deadline
    ? new Date(contract.response_deadline).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "Not specified";
  const pop = raw.placeOfPerformance;
  const popStr = pop ? [pop.city?.name, pop.state?.name, pop.country?.name].filter(Boolean).join(", ") : "Not specified";

  return (
    <div className="min-h-screen bg-[#080a0f]">
      <nav className="border-b border-[#1e2535] bg-[#080a0f]/95 backdrop-blur-md px-6 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">CI</div>
          <span className="font-semibold text-[15px] text-[#e8edf8]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
        </Link>
        <Link href="/dashboard" className="text-sm text-[#8b9ab5] hover:text-[#e8edf8]">← Back to Dashboard</Link>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="border border-[#1e2535] bg-[#0d1018] p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-[#e8edf8] mb-2">{contract.title}</h1>
              <p className="text-sm text-[#8b9ab5]">{contract.agency}</p>
            </div>
            {match && (
              <div className="text-center shrink-0">
                <div className={`text-4xl font-bold ${match.match_score >= 70 ? "text-[#22c55e]" : match.match_score >= 40 ? "text-[#eab308]" : "text-[#6b7280]"}`}>
                  {match.match_score}
                </div>
                <span className={`${match.bid_recommendation === "bid" ? "bg-[#22c55e]" : match.bid_recommendation === "review" ? "bg-[#eab308]" : "bg-[#6b7280]"} text-white text-[10px] font-mono uppercase px-2 py-0.5 inline-block mt-1`}>
                  {match.bid_recommendation}
                </span>
              </div>
            )}
          </div>
          {match?.reasoning && <p className="text-sm text-[#4a5a75] mt-3 border-t border-[#1e2535] pt-3">{match.reasoning}</p>}
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-px bg-[#1e2535] border border-[#1e2535] mb-6">
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
            <div key={label as string} className="bg-[#0d1018] p-4">
              <div className="text-[10px] text-[#4a5a75] font-mono uppercase tracking-wider mb-1">{label}</div>
              <div className="text-sm text-[#e8edf8]">{value}</div>
            </div>
          ))}
        </div>

        {/* Contacts */}
        {contacts.length > 0 && (
          <div className="border border-[#1e2535] bg-[#0d1018] p-6 mb-6">
            <h2 className="text-xs text-[#4a5a75] font-mono uppercase tracking-wider mb-4">Point of Contact</h2>
            <div className="space-y-3">
              {contacts.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-4 text-sm">
                  <span className="text-[#e8edf8] font-medium">{c.fullName || "Unknown"}</span>
                  {c.title && <span className="text-[#4a5a75]">{c.title}</span>}
                  {c.email && <a href={`mailto:${c.email}`} className="text-[#3b82f6] hover:underline">{c.email}</a>}
                  {c.phone && <span className="text-[#8b9ab5]">{c.phone}</span>}
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
