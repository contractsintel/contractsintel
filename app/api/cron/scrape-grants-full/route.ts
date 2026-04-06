import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const API = "https://apply07.grants.gov/grantsws/rest/opportunities/search";

function parseDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}`;
  return d;
}

export async function GET(request: NextRequest) {
  try {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    let offset = 0;
    let totalFetched = 0;
    let totalSaved = 0;
    let hitCount = 0;
    const PER_PAGE = 100;

    do {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ keyword: "", oppStatuses: "posted", sortBy: "openDate|desc", rows: PER_PAGE, offset }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) { console.log(`Grants.gov error at offset ${offset}: ${res.status}`); break; }

      const data = await res.json();
      const opps = data.oppHits ?? [];
      hitCount = data.hitCount ?? 0;
      totalFetched += opps.length;

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
          last_seen_at: new Date().toISOString(),
        }, { onConflict: "notice_id" });
        if (!error) totalSaved++;
      }

      offset += PER_PAGE;
      if (opps.length < PER_PAGE) break;
    } while (offset < hitCount && offset < 5000);

    return NextResponse.json({ success: true, hitCount, fetched: totalFetched, saved: totalSaved, pagesProcessed: Math.ceil(offset / PER_PAGE) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
