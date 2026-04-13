import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const API = "https://apply07.grants.gov/grantsws/rest/opportunities/search";

function parseDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[2]}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`;
  return d;
}

export async function GET(request: NextRequest) {
  try {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ keyword: "", oppStatuses: "posted", sortBy: "openDate|desc", rows: 100, offset: 800 }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return NextResponse.json({ error: `Grants.gov ${res.status}` }, { status: 502 });
    const data = await res.json();
    const opps = data.oppHits ?? [];
    let saved = 0;
    for (const opp of opps) {
      const id = opp.id ?? opp.opportunityId;
      if (!id) continue;
      const { error } = await supabase.from("opportunities").upsert({
        notice_id: `grants-gov-${id}`,
        title: opp.title ?? opp.opportunityTitle ?? "Untitled Grant",
        agency: opp.agency ?? opp.agencyCode ?? "Unknown",
        solicitation_number: opp.number ?? opp.opportunityNumber ?? String(id),
        response_deadline: parseDate(opp.closeDate ?? opp.closeDateStr),
        posted_date: parseDate(opp.openDate ?? opp.openDateStr),
        source: "grants_gov",
        source_url: `https://www.grants.gov/search-results-detail/${id}`,
      }, { onConflict: "notice_id" });
      if (!error) saved++;
    }
    return NextResponse.json({ success: true, page: 9, offset: 800, fetched: opps.length, saved, total: data.hitCount ?? 0 });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}
