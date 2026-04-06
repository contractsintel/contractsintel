import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const PAGES_PER_RUN = 50;
const RESULTS_PER_PAGE = 25;

export async function GET(request: NextRequest) {
  try {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Read cursor
    const { data: cursor } = await supabase
      .from("scraper_cursor")
      .select("*")
      .eq("source", "usaspending")
      .single();

    if (cursor?.completed) {
      return NextResponse.json({ status: "completed", message: "Backfill already complete", total_records: cursor.total_records });
    }

    const startPage = (cursor?.last_page ?? 0) + 1;
    let page = startPage;
    let totalFetched = 0;
    let totalSaved = 0;
    let hasNext = true;

    while (hasNext && page < startPage + PAGES_PER_RUN) {
      try {
        const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: { award_type_codes: ["A", "B", "C", "D"] },
            fields: ["Award ID", "Recipient Name", "Award Amount", "Period of Performance Current End Date", "Awarding Agency", "Awarding Sub Agency", "NAICS Code", "generated_internal_id", "Description"],
            limit: RESULTS_PER_PAGE,
            page,
            sort: "Award Amount",
            order: "desc",
            subawards: false,
          }),
          signal: AbortSignal.timeout(25000),
        });

        if (!res.ok) {
          console.log(`USASpending page ${page} error: ${res.status}`);
          break;
        }

        const data = await res.json();
        const awards = data.results ?? [];
        totalFetched += awards.length;
        hasNext = data.page_metadata?.hasNext === true;

        if (awards.length === 0) {
          hasNext = false;
          break;
        }

        for (const a of awards) {
          const awardId = a["Award ID"];
          if (!awardId) continue;
          const agency = [a["Awarding Agency"], a["Awarding Sub Agency"]].filter(Boolean).join(" / ");
          const { error } = await supabase.from("opportunities").upsert({
            notice_id: `usaspending-${awardId}`,
            title: `Recompete: ${(a["Description"] || agency || "Contract").substring(0, 100)} (${a["Recipient Name"] || "Unknown"})`,
            agency: agency || "Unknown",
            solicitation_number: awardId,
            naics_code: a["NAICS Code"] ?? null,
            value_estimate: a["Award Amount"] ?? null,
            response_deadline: a["Period of Performance Current End Date"] ?? null,
            source: "usaspending",
            source_url: `https://www.usaspending.gov/award/${a["generated_internal_id"] || awardId}`,
            incumbent_name: a["Recipient Name"] ?? null,
            incumbent_value: a["Award Amount"] ?? null,
          }, { onConflict: "notice_id" });
          if (!error) totalSaved++;
        }

        page++;
      } catch (err) {
        console.log(`USASpending page ${page} fetch error:`, err);
        break;
      }
    }

    // Update cursor
    const newLastPage = page - 1;
    const currentTotal = (cursor?.total_records ?? 0) + totalSaved;
    await supabase.from("scraper_cursor").upsert({
      source: "usaspending",
      last_page: newLastPage,
      total_records: currentTotal,
      completed: !hasNext,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      startPage,
      endPage: newLastPage,
      pagesProcessed: newLastPage - startPage + 1,
      fetched: totalFetched,
      saved: totalSaved,
      hasNext,
      completed: !hasNext,
      totalRecordsSoFar: currentTotal,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
