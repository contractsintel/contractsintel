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
    } while (offset < hitCount);

    // Per-agency queries to ensure coverage beyond the general query's first 984 results
    const AGENCIES = ["DOD","HHS","DOE","NSF","NASA","EPA","USDA","DOJ","DOI","DOT","DHS","VA","HUD","ED","DOL","DOC","USDOT","DOS","IMLS","NEA","NEH","PAMS","MCC","ONDCP","AC"];
    let agencySaved = 0;

    for (const agencyCode of AGENCIES) {
      let agencyOffset = 0;
      let agencyHitCount = 0;
      let agencyPageNum = 0;
      const AGENCY_PER_PAGE = 100;

      try {
        do {
          agencyPageNum++;
          const agencyRes = await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              keyword: "",
              oppStatuses: "posted",
              sortBy: "openDate|desc",
              rows: AGENCY_PER_PAGE,
              offset: agencyOffset,
              agencies: agencyCode,
            }),
            signal: AbortSignal.timeout(30000),
          });

          if (!agencyRes.ok) {
            console.log(`Grants.gov agency ${agencyCode} error at offset ${agencyOffset}: ${agencyRes.status}`);
            break;
          }

          const agencyData = await agencyRes.json();
          const agencyOpps = agencyData.oppHits ?? [];
          agencyHitCount = agencyData.hitCount ?? 0;
          totalFetched += agencyOpps.length;

          for (const opp of agencyOpps) {
            const id = opp.id ?? opp.opportunityId;
            if (!id) continue;
            const { error } = await supabase.from("opportunities").upsert({
              notice_id: `grants-gov-${id}`,
              title: opp.title ?? opp.opportunityTitle ?? "Untitled Grant",
              agency: opp.agency ?? opp.agencyCode ?? agencyCode,
              solicitation_number: opp.number ?? opp.opportunityNumber ?? String(id),
              response_deadline: parseDate(opp.closeDate ?? opp.closeDateStr),
              posted_date: parseDate(opp.openDate ?? opp.openDateStr),
              source: "grants_gov",
              source_url: `https://www.grants.gov/search-results-detail/${id}`,
              last_seen_at: new Date().toISOString(),
            }, { onConflict: "notice_id" });
            if (!error) { totalSaved++; agencySaved++; }
          }

          console.log(`Grants.gov agency ${agencyCode} page ${agencyPageNum}: ${agencyOpps.length} opps fetched (offset ${agencyOffset}, hitCount ${agencyHitCount})`);

          agencyOffset += AGENCY_PER_PAGE;

          // Stop if we got fewer results than requested or reached hitCount
          if (agencyOpps.length < AGENCY_PER_PAGE) break;
        } while (agencyOffset < agencyHitCount);

      } catch (agencyErr) {
        console.log(`Grants.gov agency ${agencyCode} failed at offset ${agencyOffset}: ${agencyErr}`);
      }
    }

    console.log(`Grants.gov per-agency queries saved ${agencySaved} additional records`);

    return NextResponse.json({ success: true, hitCount, fetched: totalFetched, saved: totalSaved, pagesProcessed: Math.ceil(offset / PER_PAGE), agencySaved });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
