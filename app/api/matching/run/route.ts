import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { organizationId } = await request.json();
    if (!organizationId) return NextResponse.json({ error: "organizationId required" }, { status: 400 });

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
    const nationwide = org.serves_nationwide !== false;

    let opportunities: any[] = [];

    // Batch 1: Direct NAICS matches
    if (orgNaics.length > 0) {
      const { data } = await supabaseAdmin
        .from("opportunities")
        .select("id, title, description, naics_code, set_aside_type, set_aside_description, agency, estimated_value, value_estimate, place_of_performance, response_deadline, source, contract_type, notice_type")
        .in("naics_code", orgNaics)
        .eq("status", "active")
        .limit(500);
      if (data) opportunities.push(...data);
    }

    // Batch 2a: Partial NAICS matches (same 4-digit family) — raised cap 200→400
    if (orgNaics.length > 0) {
      const prefixes4 = Array.from(new Set(orgNaics.map(n => n.substring(0, 4))));
      for (const prefix of prefixes4) {
        const { data } = await supabaseAdmin
          .from("opportunities")
          .select("id, title, description, naics_code, set_aside_type, set_aside_description, agency, estimated_value, value_estimate, place_of_performance, response_deadline, source, contract_type, notice_type")
          .like("naics_code", `${prefix}%`)
          .eq("status", "active")
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
          .select("id, title, description, naics_code, set_aside_type, set_aside_description, agency, estimated_value, value_estimate, place_of_performance, response_deadline, source, contract_type, notice_type")
          .like("naics_code", `${prefix}%`)
          .eq("status", "active")
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
          .select("id, title, description, naics_code, set_aside_type, set_aside_description, agency, estimated_value, value_estimate, place_of_performance, response_deadline, source, contract_type, notice_type")
          .ilike("set_aside_type", `%${keyword}%`)
          .eq("status", "active")
          .limit(300);
        if (data) opportunities.push(...data);
      }
    }

    // Batch 4: Keyword matches in titles
    if (orgKeywords.length > 0) {
      for (const kw of orgKeywords.slice(0, 5)) {
        const { data } = await supabaseAdmin
          .from("opportunities")
          .select("id, title, description, naics_code, set_aside_type, set_aside_description, agency, estimated_value, value_estimate, place_of_performance, response_deadline, source, contract_type, notice_type")
          .ilike("title", `%${kw}%`)
          .eq("status", "active")
          .limit(100);
        if (data) opportunities.push(...data);
      }
    }

    // Batch 5: USASpending recompetes (they often have null NAICS)
    const { data: recompeteData } = await supabaseAdmin
      .from("opportunities")
      .select("id, title, description, naics_code, set_aside_type, set_aside_description, agency, estimated_value, value_estimate, place_of_performance, response_deadline, source, contract_type, notice_type")
      .eq("source", "usaspending")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(300);
    if (recompeteData) opportunities.push(...recompeteData);

    // Batch 6: Recent SAM.gov opportunities
    const { data: recentData } = await supabaseAdmin
      .from("opportunities")
      .select("id, title, description, naics_code, set_aside_type, set_aside_description, agency, estimated_value, value_estimate, place_of_performance, response_deadline, source, contract_type, notice_type")
      .eq("source", "sam_gov")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(300);
    if (recentData) opportunities.push(...recentData);

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
    console.log(`[matching] Filtered ${beforeFilter - opportunities.length} non-biddable notices (awards/justifications)`);

    console.log(`[matching] Scoring ${opportunities.length} opportunities for org ${organizationId}`);

    // Score each opportunity
    const matches = opportunities.map(opp => {
      let score = 0;
      const reasons: string[] = [];

      // Signal 1: NAICS (35 pts) — graduated tiers
      const oppNaics = opp.naics_code || "";
      if (oppNaics && orgNaics.includes(oppNaics)) {
        score += 35;
        reasons.push(`Direct NAICS match: ${oppNaics}`);
      } else if (oppNaics && orgNaics.some(n => n.substring(0, 5) === oppNaics.substring(0, 5))) {
        score += 30;
        reasons.push(`Same NAICS sub-industry: ${oppNaics.substring(0, 5)}x`);
      } else if (oppNaics && orgNaics.some(n => n.substring(0, 4) === oppNaics.substring(0, 4))) {
        score += 25;
        reasons.push(`Related NAICS family: ${oppNaics.substring(0, 4)}xx`);
      } else if (oppNaics && orgNaics.some(n => n.substring(0, 3) === oppNaics.substring(0, 3))) {
        score += 22;
        reasons.push(`Same NAICS group: ${oppNaics.substring(0, 3)}xxx`);
      } else if (!oppNaics) {
        score += 15;
        reasons.push("No NAICS on opportunity");
      } else if (oppNaics && orgNaics.some(n => n.substring(0, 2) === oppNaics.substring(0, 2))) {
        score += 12;
        reasons.push(`Same sector: ${oppNaics.substring(0, 2)}`);
      }

      // Signal 2: Set-aside (25 pts)
      const sa = (opp.set_aside_type || opp.set_aside_description || "").toLowerCase();
      const certLower = orgCerts.map(c => c.toLowerCase());
      if (sa) {
        if ((sa.includes("8(a)") || sa.includes("8a")) && certLower.some(c => c.includes("8(a)") || c.includes("8a"))) {
          score += 25; reasons.push("Your 8(a) certification qualifies");
        } else if ((sa.includes("sdvosb") || sa.includes("service-disabled")) && certLower.some(c => c.includes("sdvosb") || c.includes("service-disabled"))) {
          score += 25; reasons.push("Your SDVOSB certification qualifies");
        } else if ((sa.includes("wosb") || sa.includes("women")) && certLower.some(c => c.includes("wosb") || c.includes("edwosb"))) {
          score += 25; reasons.push("Your WOSB certification qualifies");
        } else if (sa.includes("hubzone") && certLower.some(c => c.includes("hubzone"))) {
          score += 25; reasons.push("Your HUBZone certification qualifies");
        } else if (sa.includes("small business") && orgCerts.length > 0) {
          score += 20; reasons.push("Small business set-aside");
        } else {
          score += 8; // set-aside exists but doesn't match — still meaningful context
        }
      } else {
        score += 12; reasons.push("Full & open competition");
      }

      // Signal 3: Keywords (15 pts) — full matches + partial word hits
      const text = ((opp.title || "") + " " + (opp.description || "")).toLowerCase();
      let kwPts = 0;
      const matched: string[] = [];
      orgKeywords.forEach(kw => {
        const kwLower = kw.toLowerCase();
        if (text.includes(kwLower)) {
          kwPts += 5; matched.push(kw);
        } else {
          const words = kwLower.split(/\s+/).filter(w => w.length >= 4);
          const hits = words.filter(w => text.includes(w)).length;
          if (hits > 0) {
            kwPts += Math.min(2 + hits, 4); // 3 pts for 1 word, 4 pts for 2+ words
            matched.push(kw + ` (${hits} word${hits > 1 ? "s" : ""})`);
          }
        }
      });
      score += Math.min(kwPts, 15);
      if (matched.length > 0) reasons.push(`${matched.length} keyword match${matched.length > 1 ? "es" : ""}: ${matched.slice(0, 3).join(", ")}`);

      // Signal 4: Value fit (10 pts) — value often null on SAM, don't over-penalize
      const val = opp.estimated_value || opp.value_estimate || 0;
      if (val > 0 && val >= minVal && val <= maxVal) {
        score += 10; reasons.push("Value in your target range");
      } else if (val > 0 && val <= maxVal * 2) {
        score += 6;
      } else {
        score += 8; // unknown value — modest benefit of the doubt
      }

      // Signal 5: Geographic (15 pts)
      if (nationwide) {
        score += 15;
        reasons.push("Nationwide service area");
      }

      const finalScore = Math.min(score, 100);
      let recommendation = "skip";
      if (finalScore >= 70) recommendation = "bid";
      else if (finalScore >= 40) recommendation = "monitor";

      if (opp.source === "usaspending") {
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

    // Sort by score, take top 500
    matches.sort((a, b) => b.match_score - a.match_score);
    const topMatches = matches.slice(0, 1000);

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

    console.log(`[matching] Done: ${topMatches.length} matches saved, top score: ${topMatches[0]?.match_score || 0}`);
    return NextResponse.json({
      success: true,
      matched: topMatches.length,
      topScore: topMatches[0]?.match_score || 0,
      filteredNonBiddable: beforeFilter - opportunities.length,
    });
  } catch (error) {
    console.error("[matching] Error:", error);
    return NextResponse.json({ error: "Matching failed" }, { status: 500 });
  }
}
