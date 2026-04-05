import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: matches } = await supabase
    .from("user_matches")
    .select(`
      id, match_score, bid_recommendation, reasoning, created_at,
      contracts:contract_id (id, title, agency, response_deadline, raw_json, notice_id)
    `)
    .eq("user_id", user.id)
    .order("match_score", { ascending: false })
    .limit(20);

  const { count: totalMatches } = await supabase
    .from("user_matches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const avgScore = matches?.length
    ? Math.round(matches.reduce((sum, m) => sum + (m.match_score || 0), 0) / matches.length)
    : 0;

  const upcoming = matches?.filter((m: any) => {
    const d = m.contracts?.response_deadline;
    return d && new Date(d) > new Date();
  }).length || 0;

  return (
    <div className="min-h-screen bg-[#080a0f]">
      <nav className="border-b border-[#1e2535] bg-[#080a0f]/95 backdrop-blur-md px-6 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] flex items-center justify-center text-white text-xs font-mono font-medium">CI</div>
          <span className="font-semibold text-[15px] text-[#e8edf8]">Contracts<span className="text-[#3b82f6]">Intel</span></span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/settings" className="text-sm text-[#8b9ab5] hover:text-[#e8edf8]">Settings</Link>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-[#8b9ab5] hover:text-[#e8edf8]">Sign Out</button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[#e8edf8]">
            Welcome{profile?.company_name ? `, ${profile.company_name}` : ""}
          </h1>
          <p className="text-[#8b9ab5] text-sm mt-1">
            {profile?.plan === "trial" ? "Free trial — " : ""}Your personalized contract intelligence feed
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-px bg-[#1e2535] border border-[#1e2535] mb-8">
          <div className="bg-[#0d1018] p-6">
            <div className="text-3xl font-bold text-[#e8edf8]">{totalMatches || 0}</div>
            <div className="text-xs text-[#4a5a75] mt-1 font-mono uppercase tracking-wider">Matched Contracts</div>
          </div>
          <div className="bg-[#0d1018] p-6">
            <div className="text-3xl font-bold text-[#3b82f6]">{avgScore}</div>
            <div className="text-xs text-[#4a5a75] mt-1 font-mono uppercase tracking-wider">Avg Match Score</div>
          </div>
          <div className="bg-[#0d1018] p-6">
            <div className="text-3xl font-bold text-[#22c55e]">{upcoming}</div>
            <div className="text-xs text-[#4a5a75] mt-1 font-mono uppercase tracking-wider">Open Deadlines</div>
          </div>
        </div>

        {/* Contract Feed */}
        <div className="space-y-px">
          {matches && matches.length > 0 ? (
            matches.map((match: any) => {
              const c = match.contracts;
              if (!c) return null;
              const deadline = c.response_deadline
                ? new Date(c.response_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "TBD";
              const scoreColor = match.match_score >= 70 ? "text-[#22c55e]" : match.match_score >= 40 ? "text-[#eab308]" : "text-[#6b7280]";
              const recColor = match.bid_recommendation === "bid" ? "bg-[#22c55e]" : match.bid_recommendation === "review" ? "bg-[#eab308]" : "bg-[#6b7280]";

              return (
                <Link key={match.id} href={`/dashboard/contracts/${c.id}`}
                  className="block border border-[#1e2535] bg-[#0d1018] hover:border-[#2a3548] transition-colors">
                  <div className="flex items-center p-5 gap-6">
                    <div className={`text-3xl font-bold ${scoreColor} w-16 text-center shrink-0`}>
                      {match.match_score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-[#e8edf8] font-medium text-sm truncate">{c.title}</h3>
                        <span className={`${recColor} text-white text-[10px] font-mono uppercase px-2 py-0.5 shrink-0`}>
                          {match.bid_recommendation}
                        </span>
                      </div>
                      <div className="text-xs text-[#8b9ab5] truncate">{c.agency}</div>
                      <div className="text-xs text-[#4a5a75] mt-1">{match.reasoning}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-[#4a5a75] font-mono uppercase tracking-wider">Deadline</div>
                      <div className="text-sm text-[#8b9ab5]">{deadline}</div>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="border border-[#1e2535] bg-[#0d1018] p-12 text-center">
              <div className="text-[#4a5a75] text-lg mb-2">No matches yet</div>
              <p className="text-[#8b9ab5] text-sm">
                We&apos;re analyzing contracts against your profile. Check back soon or{" "}
                <Link href="/dashboard/settings" className="text-[#3b82f6]">update your NAICS codes</Link> for better matches.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
