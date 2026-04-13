import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: { award_type_codes: ["A","B","C","D"] },
        fields: ["Award ID","Recipient Name","Award Amount","Period of Performance Current End Date","Awarding Agency","Awarding Sub Agency","NAICS Code","generated_internal_id","Description"],
        limit: 100, page: 5, sort: "Award Amount", order: "desc", subawards: false
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) return NextResponse.json({ error: `USASpending ${res.status}` }, { status: 502 });

    const data = await res.json();
    const awards = data.results ?? [];
    let saved = 0;

    for (const a of awards) {
      const awardId = a["Award ID"]; if (!awardId) continue;
      const agency = [a["Awarding Agency"], a["Awarding Sub Agency"]].filter(Boolean).join(" / ");
      const incumbent = a["Recipient Name"];
      const amount = a["Award Amount"];
      const { error } = await supabase.from("opportunities").upsert({
        notice_id: `usaspending-${awardId}`,
        title: `Recompete: ${(a["Description"] || agency || "Contract").substring(0, 100)} (${incumbent || "Unknown"})`,
        agency: agency || "Unknown",
        solicitation_number: awardId,
        naics_code: a["NAICS Code"] ?? null,
        value_estimate: amount ?? null,
        response_deadline: a["Period of Performance Current End Date"] ?? null,
        source: "usaspending",
        source_url: `https://www.usaspending.gov/award/${a["generated_internal_id"] || awardId}`,
        incumbent_name: incumbent ?? null,
        incumbent_value: amount ?? null,
      }, { onConflict: "notice_id" });
      if (!error) saved++;
    }

    return NextResponse.json({ success: true, page: 5, fetched: awards.length, saved, hasNext: data.page_metadata?.hasNext ?? false });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
