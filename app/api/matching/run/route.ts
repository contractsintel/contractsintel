import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// 5-signal scoring engine
function scoreOpportunity(opp: any, org: any): { score: number; recommendation: string; reasoning: string } {
  let score = 0;
  const reasons: string[] = [];

  // ═══ Signal 1: NAICS Classification Match (35 pts) ═══
  const oppNaics = opp.naics_code || "";
  const orgNaics: string[] = org.naics_codes || [];
  if (oppNaics && orgNaics.includes(oppNaics)) {
    score += 35;
    reasons.push(`Direct NAICS match: ${oppNaics}`);
  } else if (oppNaics && orgNaics.some((n: string) => n.substring(0, 4) === oppNaics.substring(0, 4))) {
    score += 25;
    reasons.push(`Related NAICS group: ${oppNaics.substring(0, 4)}xx`);
  } else if (oppNaics && orgNaics.some((n: string) => n.substring(0, 2) === oppNaics.substring(0, 2))) {
    score += 10;
    reasons.push(`Same NAICS sector: ${oppNaics.substring(0, 2)}`);
  } else if (!oppNaics) {
    score += 15;
    reasons.push("No NAICS specified on opportunity");
  }

  // ═══ Signal 2: Set-Aside Eligibility (25 pts) ═══
  const setAsideMap: Record<string, string[]> = {
    "8(a)": ["8(a)"],
    "8a": ["8(a)"],
    "sdvosb": ["SDVOSB", "Service-Disabled Veteran"],
    "service-disabled": ["SDVOSB", "Service-Disabled Veteran"],
    "wosb": ["WOSB", "EDWOSB"],
    "women-owned": ["WOSB", "EDWOSB"],
    "edwosb": ["EDWOSB"],
    "hubzone": ["HUBZone"],
    "small business": ["8(a)", "HUBZone", "WOSB", "EDWOSB", "SDVOSB", "Small Business", "Service-Disabled Veteran"],
  };

  const sa = (opp.set_aside_type || opp.set_aside_description || "").toLowerCase();
  const orgCerts: string[] = org.certifications || [];
  let setAsideMatched = false;

  if (sa) {
    for (const [pattern, matchingCerts] of Object.entries(setAsideMap)) {
      if (sa.includes(pattern)) {
        const matchedCert = orgCerts.find((c: string) => matchingCerts.includes(c));
        if (matchedCert) {
          score += 25;
          reasons.push(`Set-aside match: your ${matchedCert} certification qualifies`);
          setAsideMatched = true;
          break;
        }
      }
    }
    if (!setAsideMatched && orgCerts.length > 0) {
      reasons.push(`Set-aside: ${opp.set_aside_type || sa} — may not match your certifications`);
    } else if (!setAsideMatched) {
      reasons.push(`Set-aside: ${opp.set_aside_type || sa}`);
    }
  } else {
    score += 10;
    reasons.push("Full & open competition — no set-aside restriction");
  }

  // ═══ Signal 3: Agency History Affinity (15 pts) ═══
  const preferredAgencies: string[] = org.preferred_agencies || [];
  const oppAgency = (opp.agency || "").toLowerCase();
  if (preferredAgencies.length > 0 && preferredAgencies.some((a: string) => oppAgency.includes(a.toLowerCase()))) {
    score += 15;
    reasons.push(`Preferred agency: ${opp.agency}`);
  }

  // ═══ Signal 4: Contract Value Fit (10 pts) ═══
  const oppValue = opp.estimated_value || opp.value_estimate || 0;
  const minVal = org.min_contract_value || 0;
  const maxVal = org.max_contract_value || 0;
  if (oppValue > 0 && maxVal > 0) {
    if (oppValue >= minVal && oppValue <= maxVal) {
      score += 10;
      reasons.push("Contract value within your target range");
    } else if (oppValue <= maxVal * 2) {
      score += 5;
      reasons.push("Contract value slightly above your range");
    }
  } else {
    score += 5; // Unknown value or no preference, neutral
  }

  // ═══ Signal 5: Content Relevance — Keyword Match (15 pts) ═══
  const keywords: string[] = org.keywords || [];
  const text = ((opp.title || "") + " " + (opp.description || "")).toLowerCase();
  const matchedKeywords: string[] = [];
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
    }
  }

  if (matchedKeywords.length >= 3) {
    score += 15;
    reasons.push(`Strong keyword match: ${matchedKeywords.slice(0, 3).join(", ")}`);
  } else if (matchedKeywords.length >= 2) {
    score += 10;
    reasons.push(`Keyword match: ${matchedKeywords.join(", ")}`);
  } else if (matchedKeywords.length >= 1) {
    score += 5;
    reasons.push(`Partial keyword match: ${matchedKeywords[0]}`);
  }

  // Determine recommendation
  let recommendation = "skip";
  if (score >= 75) recommendation = "bid";
  else if (score >= 45) recommendation = "monitor";

  // Recompete override
  if (opp.source === "usaspending" || (opp.title || "").toLowerCase().includes("recompete")) {
    recommendation = "recompete";
    if (!reasons.some(r => r.includes("ecompete"))) {
      reasons.push("Recompete alert: expiring contract may be re-solicited");
    }
  }

  return {
    score: Math.min(score, 100),
    recommendation,
    reasoning: reasons.join(". ") + ".",
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const orgId = body.organizationId;

    // Fetch org profile
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .single();
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    // Fetch active opportunities in batches
    let totalMatched = 0;
    let offset = 0;
    const BATCH = 500;

    while (true) {
      const { data: opps } = await supabase
        .from("opportunities")
        .select("id, title, agency, naics_code, set_aside_type, set_aside_description, estimated_value, value_estimate, description, source, status")
        .in("source", ["sam_gov", "usaspending"])
        .eq("status", "active")
        .range(offset, offset + BATCH - 1);

      if (!opps || opps.length === 0) break;

      // Score each opportunity
      const matches = opps.map(opp => {
        const { score, recommendation, reasoning } = scoreOpportunity(opp, org);
        return {
          organization_id: orgId,
          opportunity_id: opp.id,
          match_score: score,
          bid_recommendation: recommendation,
          recommendation_reasoning: reasoning,
          user_status: "new",
          is_demo: false,
        };
      }).filter(m => m.match_score >= 15); // Only save if at least some signal

      // Upsert in batches of 200
      for (let i = 0; i < matches.length; i += 200) {
        await supabase
          .from("opportunity_matches")
          .upsert(matches.slice(i, i + 200), { onConflict: "organization_id,opportunity_id" });
      }

      totalMatched += matches.length;
      offset += BATCH;

      // Safety limit
      if (offset > 100000) break;
    }

    return NextResponse.json({ success: true, matched: totalMatched });
  } catch (error) {
    console.error("Matching error:", error);
    return NextResponse.json({ error: "Matching failed" }, { status: 500 });
  }
}
