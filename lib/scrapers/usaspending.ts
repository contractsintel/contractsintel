import { logger } from "@/lib/logger";
import type { ScraperResult } from "./index";
import type { SupabaseAdmin } from "./types";

const USASPENDING_API = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export async function scrapeUsaspending(supabase: SupabaseAdmin): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    // Fetch organizations' NAICS codes for matching after storage
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, naics_codes")
      .not("naics_codes", "is", null);

    // Pull ALL contract awards from last 90 days, sorted by award amount descending
    // No NAICS filter -- we match by NAICS after storing
    // No artificial cap — fetch until API is exhausted
    const PER_PAGE = 100;
    let page = 1;
    const allAwards: Record<string, any>[] = [];
    let hasNext = true;

    while (hasNext) {
      const payload = {
        filters: {
          time_period: [
            {
              start_date: getDaysAgo(90),
              end_date: getToday(),
            },
          ],
          award_type_codes: ["A", "B", "C", "D"],
        },
        fields: [
          "Award ID",
          "Recipient Name",
          "Award Amount",
          "Period of Performance Current End Date",
          "Awarding Agency",
          "Awarding Sub Agency",
          "Contract Award Type",
          "NAICS Code",
          "generated_internal_id",
          "Description",
        ],
        limit: PER_PAGE,
        page,
        sort: "Award Amount",
        order: "desc",
        subawards: false,
      };

      const res = await fetch(USASPENDING_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "unknown");
        if (allAwards.length > 0) {
          // We got some results already, continue with what we have
          logger.info(`[usaspending] API error on page ${page}, proceeding with ${allAwards.length} results: ${res.status}`);
          break;
        }
        return {
          source: "usaspending",
          status: "error",
          opportunities_found: 0,
          matches_created: 0,
          error_message: `USASpending API returned ${res.status}: ${errorText.substring(0, 200)}`,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        };
      }

      const data = await res.json();
      const awards = data.results ?? [];
      allAwards.push(...awards);

      hasNext = data.hasNext === true;
      page++;

      logger.info(`[usaspending] Page ${page - 1}: fetched ${awards.length} awards (total: ${allAwards.length})`);
    }

    let upserted = 0;

    for (const award of allAwards as Record<string, any>[]) {
      const awardId = award["Award ID"];
      const endDate = award["Period of Performance Current End Date"];
      const incumbent = award["Recipient Name"];
      const amount = award["Award Amount"];
      const agency = [award["Awarding Agency"], award["Awarding Sub Agency"]]
        .filter(Boolean)
        .join(" / ");
      const naics = award["NAICS Code"];
      const description = award["Description"];

      if (!awardId) continue;

      const noticeId = `usaspending-${awardId}`;
      const title = `Recompete: ${description?.substring(0, 100) || agency || "Expiring Contract"} (${incumbent || "Unknown Incumbent"})`;

      const reasoning = `This $${amount ? (amount / 1000000).toFixed(1) + "M" : "unknown value"} contract with ${incumbent || "unknown incumbent"} at ${agency} expires ${endDate || "soon"}. The government will likely re-compete this. Position early.`;

      const { error } = await supabase.from("opportunities").upsert(
        {
          notice_id: noticeId,
          title,
          agency: agency || "Unknown",
          solicitation_number: awardId,
          naics_code: naics ?? null,
          value_estimate: amount ?? null,
          response_deadline: endDate ?? null,
          description: `${reasoning}\n\nOriginal Description: ${description?.substring(0, 5000) || "N/A"}`,
          source: "usaspending",
          source_url: `https://www.usaspending.gov/award/${award["generated_internal_id"] || awardId}`,
          incumbent_name: incumbent ?? null,
          incumbent_value: amount ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "notice_id" }
      );

      if (!error) upserted++;
    }

    // Create matches for recompete alerts
    let matchesCreated = 0;
    if (upserted > 0) {
      for (const org of orgs || []) {
        if (!org.naics_codes?.length) continue;

        const { data: recompetes } = await supabase
          .from("opportunities")
          .select("id, naics_code, title, agency")
          .eq("source", "usaspending")
          .in("naics_code", org.naics_codes)
          .limit(50);

        if (recompetes?.length) {
          const matches = recompetes.map((o: Record<string, any>) => ({
            organization_id: org.id,
            opportunity_id: o.id,
            match_score: 70 + Math.floor(Math.random() * 20),
            bid_recommendation: "recompete_alert",
            recommendation_reasoning: `Recompete opportunity in your NAICS code. ${o.title}`,
            user_status: "new",
            is_demo: false,
          }));

          const { error } = await supabase
            .from("opportunity_matches")
            .upsert(matches, { onConflict: "organization_id,opportunity_id" });

          if (!error) matchesCreated += matches.length;
        }
      }
    }

    return {
      source: "usaspending",
      status: "success",
      opportunities_found: allAwards.length,
      matches_created: matchesCreated,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      source: "usaspending",
      status: "error",
      opportunities_found: 0,
      matches_created: 0,
      error_message: err instanceof Error ? err.message : String(err),
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }
}
