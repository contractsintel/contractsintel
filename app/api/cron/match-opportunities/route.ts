import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Bulk NAICS-based matching: matches all organizations against unmatched opportunities
// Runs after scraper rotations and on a cron schedule

const BATCH_SIZE = 500;

function computeScore(
  opp: { naics_code?: string; set_aside_type?: string; set_aside?: string; title?: string; source?: string; value_estimate?: number; estimated_value?: number; description?: string },
  org: { naics_codes?: string[]; certifications?: string[]; keywords?: string[] }
): { score: number; recommendation: string; reasoning: string } {
  let score = 0;
  const reasons: string[] = [];

  // NAICS match: primary signal (0-50 points)
  if (opp.naics_code && org.naics_codes?.length) {
    const exactMatch = org.naics_codes.includes(opp.naics_code);
    const prefixMatch = org.naics_codes.some(
      (n) => opp.naics_code!.startsWith(n.substring(0, 4)) || n.startsWith(opp.naics_code!.substring(0, 4))
    );
    if (exactMatch) {
      score += 50;
      reasons.push(`NAICS ${opp.naics_code} exact match`);
    } else if (prefixMatch) {
      score += 30;
      reasons.push(`NAICS ${opp.naics_code} sector match`);
    }
  }

  // Set-aside / certification alignment (0-20 points)
  const setAside = opp.set_aside_type || opp.set_aside;
  if (setAside && org.certifications?.length) {
    const sa = setAside.toLowerCase();
    const certMap: Record<string, string[]> = {
      "8(a)": ["8a", "8(a)"],
      sdvosb: ["sdvosb", "service-disabled veteran"],
      hubzone: ["hubzone"],
      wosb: ["wosb", "women-owned"],
      edwosb: ["edwosb", "economically disadvantaged women"],
      small: ["small business", "sba", "small"],
    };
    for (const [key, terms] of Object.entries(certMap)) {
      if (terms.some((t) => sa.includes(t))) {
        if (org.certifications.some((c) => c.toLowerCase().includes(key))) {
          score += 20;
          reasons.push(`${key} set-aside matches certification`);
          break;
        }
      }
    }
  }

  // Keyword relevance from title/description (0-20 points)
  if (org.keywords?.length) {
    const text = `${opp.title || ""} ${(opp.description || "").substring(0, 2000)}`.toLowerCase();
    const hits = org.keywords.filter((kw) => text.includes(kw.toLowerCase()));
    if (hits.length >= 3) {
      score += 20;
      reasons.push(`${hits.length} keyword matches`);
    } else if (hits.length >= 1) {
      score += 10;
      reasons.push(`${hits.length} keyword match`);
    }
  }

  // Source bonus: SAM.gov and federal sources slightly more relevant (0-5 points)
  if (opp.source === "sam_gov" || opp.source === "federal_civilian") {
    score += 5;
  }

  // Value alignment bonus (0-5 points)
  const estValue = opp.value_estimate || opp.estimated_value;
  if (estValue && estValue > 0) {
    score += 5;
    reasons.push(`est. value: $${(estValue / 1000).toFixed(0)}K`);
  }

  // Clamp score
  score = Math.min(score, 100);

  // Determine recommendation
  let recommendation = "monitor";
  if (score >= 70) recommendation = "bid";
  else if (score >= 40) recommendation = "monitor";
  else recommendation = "skip";

  return {
    score,
    recommendation,
    reasoning: reasons.length > 0 ? reasons.join("; ") : "General opportunity in your sector",
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (
      authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      process.env.NODE_ENV === "production"
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all organizations with NAICS codes
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, naics_codes, certifications");

    if (orgErr || !orgs?.length) {
      return NextResponse.json({
        success: false,
        error: orgErr?.message || "No organizations found",
      });
    }

    // Filter to orgs that have NAICS codes
    const activeOrgs = orgs.filter(
      (o: any) => o.naics_codes && o.naics_codes.length > 0
    );

    if (!activeOrgs.length) {
      return NextResponse.json({
        success: true,
        message: "No organizations with NAICS codes to match",
        matched: 0,
      });
    }

    let totalMatched = 0;

    for (const org of activeOrgs) {
      // Get existing match opportunity IDs for this org
      const { data: existingMatches } = await supabase
        .from("opportunity_matches")
        .select("opportunity_id")
        .eq("organization_id", org.id)
        .eq("is_demo", false);

      const existingIds = new Set(
        (existingMatches || []).map((m: any) => m.opportunity_id)
      );

      // Find unmatched opportunities with matching NAICS codes
      // Query in batches by NAICS code prefix
      const allNaics = org.naics_codes || [];
      const unmatchedOpps: any[] = [];

      for (const naics of allNaics) {
        // Exact NAICS match
        let offset = 0;
        while (true) {
          const { data: opps } = await supabase
            .from("opportunities")
            .select("id, notice_id, title, agency, naics_code, set_aside_type, value_estimate, source, description, response_deadline")
            .eq("naics_code", naics)
            .range(offset, offset + BATCH_SIZE - 1);

          if (!opps?.length) break;

          for (const opp of opps) {
            if (!existingIds.has(opp.id)) {
              unmatchedOpps.push(opp);
              existingIds.add(opp.id); // prevent duplicates across NAICS codes
            }
          }

          if (opps.length < BATCH_SIZE) break;
          offset += BATCH_SIZE;
        }

        // 4-digit prefix match (related NAICS)
        const prefix = naics.substring(0, 4);
        offset = 0;
        while (true) {
          const { data: opps } = await supabase
            .from("opportunities")
            .select("id, notice_id, title, agency, naics_code, set_aside_type, value_estimate, source, description, response_deadline")
            .like("naics_code", `${prefix}%`)
            .neq("naics_code", naics)
            .range(offset, offset + BATCH_SIZE - 1);

          if (!opps?.length) break;

          for (const opp of opps) {
            if (!existingIds.has(opp.id)) {
              unmatchedOpps.push(opp);
              existingIds.add(opp.id);
            }
          }

          if (opps.length < BATCH_SIZE) break;
          offset += BATCH_SIZE;
        }
      }

      if (unmatchedOpps.length === 0) continue;

      // Score and create matches in batches
      const matchRecords = unmatchedOpps
        .map((opp) => {
          const { score, recommendation, reasoning } = computeScore(opp, org);
          if (score < 20) return null; // skip very low scores
          return {
            organization_id: org.id,
            opportunity_id: opp.id,
            match_score: score,
            bid_recommendation: recommendation,
            recommendation_reasoning: reasoning,
            user_status: "new",
            is_demo: false,
          };
        })
        .filter(Boolean);

      // Upsert in batches
      for (let i = 0; i < matchRecords.length; i += 200) {
        const batch = matchRecords.slice(i, i + 200);
        const { error } = await supabase
          .from("opportunity_matches")
          .upsert(batch as any[], {
            onConflict: "organization_id,opportunity_id",
          });
        if (error) {
          console.error(`Match upsert error for org ${org.id}:`, error.message);
        }
      }

      totalMatched += matchRecords.length;
      console.log(
        `Matched ${matchRecords.length} opportunities for ${org.name || org.id}`
      );
    }

    return NextResponse.json({
      success: true,
      organizations_processed: activeOrgs.length,
      total_matches_created: totalMatched,
    });
  } catch (error) {
    console.error("Match opportunities error:", error);
    return NextResponse.json(
      { error: "Failed to match opportunities" },
      { status: 500 }
    );
  }
}
