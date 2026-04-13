import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Authenticate the caller and derive their org — never trust client-supplied orgId
    const authSupabase = await createAuthClient();
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userRecord } = await authSupabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const organizationId = userRecord.organization_id;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get org profile
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single();
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const orgNaics: string[] = org.naics_codes || [];
    const orgCerts: string[] = org.certifications || [];
    const orgKeywords: string[] = org.keywords || [];
    const minVal = org.min_contract_value || 0;
    const maxVal = org.max_contract_value || 999999999;
    const orgStates: string[] = (org.service_states || []).map((s: string) => s.toUpperCase());
    const nationwide = org.serves_nationwide !== false || orgStates.length === 0;

    let opportunities: Record<string, any>[] = [];

    // Batch 1: Direct NAICS matches
    if (orgNaics.length > 0) {
      const { data } = await supabaseAdmin
        .from("opportunities")
        .select("*")
        .in("naics_code", orgNaics)
        .limit(500);
      if (data) opportunities.push(...data);
    }

    // Batch 2a: Partial NAICS matches (same 4-digit family) — raised cap 200→400
    if (orgNaics.length > 0) {
      const prefixes4 = Array.from(new Set(orgNaics.map(n => n.substring(0, 4))));
      for (const prefix of prefixes4) {
        const { data } = await supabaseAdmin
          .from("opportunities")
          .select("*")
          .like("naics_code", `${prefix}%`)
          .limit(400);
        if (data) opportunities.push(...data);
      }
    }

    // Batch 2b: 3-digit NAICS group matches — previously invisible to fetch
    if (orgNaics.length > 0) {
      const prefixes3 = Array.from(new Set(orgNaics.map(n => n.substring(0, 3))));
      for (const prefix of prefixes3) {
        const { data } = await supabaseAdmin
          .from("opportunities")
          .select("*")
          .like("naics_code", `${prefix}%`)
          .limit(300);
        if (data) opportunities.push(...data);
      }
    }

    // Batch 3: Set-aside matches — use ALL certs, not just first 3
    if (orgCerts.length > 0) {
      for (const cert of orgCerts) {
        const keyword = cert.toLowerCase().substring(0, 6);
        const { data } = await supabaseAdmin
          .from("opportunities")
          .select("*")
          .ilike("set_aside_type", `%${keyword}%`)
          .limit(300);
        if (data) opportunities.push(...data);
      }
    }

    // Batch 4: Keyword matches in titles
    if (orgKeywords.length > 0) {
      for (const kw of orgKeywords.slice(0, 5)) {
        const { data } = await supabaseAdmin
          .from("opportunities")
          .select("*")
          .ilike("title", `%${kw}%`)
          .limit(100);
        if (data) opportunities.push(...data);
      }
    }

    // Batch 5: USASpending recompetes (they often have null NAICS)
    const { data: recompeteData } = await supabaseAdmin
      .from("opportunities")
      .select("*")
      .eq("source", "usaspending")
      .order("created_at", { ascending: false })
      .limit(300);
    if (recompeteData) opportunities.push(...recompeteData);

    // Batch 6: Recent SAM.gov opportunities
    const { data: recentData } = await supabaseAdmin
      .from("opportunities")
      .select("*")
      .eq("source", "sam_gov")
      .order("created_at", { ascending: false })
      .limit(300);
    if (recentData) opportunities.push(...recentData);

    // Batch 7: Broad catch-all — fetch ALL active opportunities not yet seen,
    // so that even accounts with niche NAICS codes still see adjacent opportunities.
    // The scoring engine will rank them appropriately.
    const { data: allActive } = await supabaseAdmin
      .from("opportunities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (allActive) opportunities.push(...allActive);

    // Deduplicate
    const seen = new Set<string>();
    opportunities = opportunities.filter(o => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

    // Filter out non-biddable notice types:
    //   (a) Award Notice — contract already awarded
    //   (u) Justification — agency decision memo, not a bid opportunity
    //   (g) Sale of Surplus Property — auction, not a service contract
    // The dedicated notice_type column is the authoritative source. Fall back
    // to contract_type (legacy) and title heuristics for rows that haven't
    // been re-backfilled yet.
    // USASpending rows are allowed through (they're recompete intel).
    const NON_BIDDABLE_CODES = new Set(["a", "u", "g"]);
    const AWARD_TITLE_PATTERNS = [
      "award synopsis",
      "notice of award",
      "award notice",
      "contract award",
      "intent to award",
    ];
    const beforeFilter = opportunities.length;
    opportunities = opportunities.filter(o => {
      if (o.source !== "sam_gov") return true;
      // Primary: notice_type code from the dedicated column
      if (o.notice_type && NON_BIDDABLE_CODES.has(o.notice_type.toLowerCase())) return false;
      // Secondary: legacy contract_type string for rows scraped before the column existed
      const t = (o.contract_type || "").toLowerCase();
      if (t.includes("(a)") || t.includes("(u)") || t.includes("(g)")) return false;
      // Tertiary: title heuristic for rows whose notice type was destroyed by old backfill
      const title = (o.title || "").toLowerCase();
      if (AWARD_TITLE_PATTERNS.some(p => title.includes(p))) return false;
      return true;
    });
    const filteredCount = beforeFilter - opportunities.length;

    // ── Recalibrated Scoring Engine ──────────────────────────────────────
    //
    // Design goals (from product requirements):
    //   • Every account should see 50-150 matched contracts
    //   • Score distribution: 10-15% Strong (75+), 30-40% Good (55-74), 45-55% Worth a Look (40-54)
    //   • Nothing below 40 displayed
    //   • Base score floor: any active opportunity starts at 42 (passes minimum relevance)
    //   • Set-asides are additive (certification match = bonus, full-and-open always included)
    //   • Value and geography are soft scoring, never hard filters
    //
    // Max possible = 42 (base) + 30 (NAICS) + 15 (set-aside) + 8 (keywords) + 5 (value) = 100
    //
    const matches = opportunities.map(opp => {
      // Base score — any active government opportunity has baseline relevance
      let score = 42;
      const reasons: string[] = [];

      // Signal 1: NAICS match (0–30 pts) — the primary relevance signal
      const oppNaics = opp.naics_code || "";
      if (oppNaics && orgNaics.includes(oppNaics)) {
        score += 30;
        reasons.push(`Direct NAICS match: ${oppNaics}`);
      } else if (oppNaics && orgNaics.some((n: string) => n.substring(0, 5) === oppNaics.substring(0, 5))) {
        score += 25;
        reasons.push(`Same NAICS sub-industry: ${oppNaics.substring(0, 5)}x`);
      } else if (oppNaics && orgNaics.some((n: string) => n.substring(0, 4) === oppNaics.substring(0, 4))) {
        score += 20;
        reasons.push(`Related NAICS family: ${oppNaics.substring(0, 4)}xx`);
      } else if (oppNaics && orgNaics.some((n: string) => n.substring(0, 3) === oppNaics.substring(0, 3))) {
        score += 15;
        reasons.push(`Same NAICS group: ${oppNaics.substring(0, 3)}xxx`);
      } else if (!oppNaics) {
        score += 10;
        reasons.push("No NAICS listed — may be relevant");
      } else if (oppNaics && orgNaics.some((n: string) => n.substring(0, 2) === oppNaics.substring(0, 2))) {
        score += 8;
        reasons.push(`Same sector: ${oppNaics.substring(0, 2)}xxxx`);
      } else {
        // Different sector — reduce base score to indicate low relevance
        score -= 10;
      }

      // Signal 2: Set-aside certification match (0–15 pts) — ADDITIVE bonus
      // Full-and-open contracts are always included (no penalty).
      // Matching certification = significant boost.
      const sa = (opp.set_aside_type || opp.set_aside_description || "").toLowerCase();
      const certLower = orgCerts.map((c: string) => c.toLowerCase());
      if (sa) {
        let certMatch = false;
        if ((sa.includes("8(a)") || sa.includes("8a")) && certLower.some((c: string) => c.includes("8(a)") || c.includes("8a"))) {
          score += 15; reasons.push("Your 8(a) certification qualifies"); certMatch = true;
        } else if ((sa.includes("sdvosb") || sa.includes("service-disabled")) && certLower.some((c: string) => c.includes("sdvosb") || c.includes("service-disabled"))) {
          score += 15; reasons.push("Your SDVOSB certification qualifies"); certMatch = true;
        } else if ((sa.includes("wosb") || sa.includes("women")) && certLower.some((c: string) => c.includes("wosb") || c.includes("edwosb"))) {
          score += 15; reasons.push("Your WOSB certification qualifies"); certMatch = true;
        } else if (sa.includes("hubzone") && certLower.some((c: string) => c.includes("hubzone"))) {
          score += 15; reasons.push("Your HUBZone certification qualifies"); certMatch = true;
        }
        if (!certMatch) {
          if (sa.includes("small business") && orgCerts.length > 0) {
            score += 10; reasons.push("Small business set-aside — you're eligible");
          } else if (orgCerts.length > 0) {
            score += 3; reasons.push("Set-aside present (different certification)");
          }
        }
      } else {
        score += 5; reasons.push("Full & open competition — all businesses eligible");
      }

      // Signal 3: Keywords (0–8 pts) — semantic relevance boost
      const text = ((opp.title || "") + " " + (opp.description || "")).toLowerCase();
      let kwPts = 0;
      const matched: string[] = [];
      orgKeywords.forEach((kw: string) => {
        const kwLower = kw.toLowerCase();
        if (text.includes(kwLower)) {
          kwPts += 4; matched.push(kw);
        } else {
          const words = kwLower.split(/\s+/).filter((w: string) => w.length >= 4);
          const hits = words.filter((w: string) => text.includes(w)).length;
          if (hits > 0) {
            kwPts += Math.min(1 + hits, 3);
            matched.push(kw + ` (partial)`);
          }
        }
      });
      score += Math.min(kwPts, 8);
      if (matched.length > 0) reasons.push(`Keywords: ${matched.slice(0, 3).join(", ")}`);

      // Signal 4: Value fit (0–5 pts) — soft scoring, never penalizes unknown
      const val = opp.estimated_value || opp.value_estimate || 0;
      if (val > 0 && val >= minVal && val <= maxVal) {
        score += 5; reasons.push("Value in your target range");
      } else if (val > 0 && val <= maxVal * 2) {
        score += 3;
      } else if (val <= 0) {
        score += 3; // Unknown value — benefit of the doubt
      }

      // Geographic preference — soft bonus, never penalizes
      if (nationwide) {
        // Already in base score
      } else {
        const pop = (opp.place_of_performance || "").toUpperCase();
        const stateMatch = orgStates.find((s: string) =>
          pop.includes(`, ${s}`) || pop.includes(` ${s} `) || pop === s ||
          pop.endsWith(` ${s}`) || pop.startsWith(`${s} `) || pop.startsWith(`${s},`)
        );
        if (stateMatch) {
          score += 3;
          reasons.push(`In your service area (${stateMatch})`);
        }
      }

      const finalScore = Math.min(Math.max(score, 0), 100);

      // Recommendation tiers
      let recommendation = "skip";
      if (finalScore >= 75) recommendation = "bid";
      else if (finalScore >= 55) recommendation = "monitor";
      else if (finalScore >= 40) recommendation = "review";

      if (opp.source === "usaspending" && finalScore >= 40) {
        recommendation = "recompete";
        reasons.push("Recompete alert: expiring contract");
      }

      return {
        organization_id: organizationId,
        opportunity_id: opp.id,
        match_score: finalScore,
        bid_recommendation: recommendation,
        recommendation_reasoning: reasons.join(". ") + ".",
        user_status: "new",
        is_demo: false,
      };
    });

    // Filter out matches below 40 (not worth showing) and take top 1000
    matches.sort((a, b) => b.match_score - a.match_score);
    const topMatches = matches.filter(m => m.match_score >= 40).slice(0, 1000);

    // Delete old matches for this org (clean slate)
    await supabaseAdmin
      .from("opportunity_matches")
      .delete()
      .eq("organization_id", organizationId)
      .eq("is_demo", false);

    // Insert in batches of 100
    for (let i = 0; i < topMatches.length; i += 100) {
      const batch = topMatches.slice(i, i + 100);
      const { error } = await supabaseAdmin
        .from("opportunity_matches")
        .insert(batch);
      if (error) console.error("[matching] Insert error:", error.message);
    }

    return NextResponse.json({
      success: true,
      matched: topMatches.length,
      topScore: topMatches[0]?.match_score || 0,
      filteredNonBiddable: filteredCount,
    });
  } catch (error) {
    console.error("[matching] Error:", error);
    return NextResponse.json({ error: "Matching failed" }, { status: 500 });
  }
}
