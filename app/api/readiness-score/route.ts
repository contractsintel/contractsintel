import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScoreFactor {
  label: string;
  score: number;
  max: number;
  status: "complete" | "partial" | "missing";
  action: string;
  link: string;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Look up org via users table (same pattern as other API routes)
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 404 });

    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", userRecord.organization_id)
      .single();

    if (!org) return NextResponse.json({ error: "No organization" }, { status: 404 });

    const factors: ScoreFactor[] = [];

    // 1. SAM Registration (0-15)
    const hasUei = !!org.uei && org.uei.length > 3;
    const hasCage = !!org.cage_code && org.cage_code.length > 2;
    const samScore = (hasUei ? 8 : 0) + (hasCage ? 7 : 0);
    factors.push({
      label: "SAM.gov Registration",
      score: samScore, max: 15,
      status: samScore >= 15 ? "complete" : samScore > 0 ? "partial" : "missing",
      action: samScore >= 15 ? "UEI and CAGE code verified" : !hasUei ? "Add your UEI number" : "Add your CAGE code",
      link: "/dashboard/settings",
    });

    // 2. NAICS Codes (0-10)
    const naicsCount = (org.naics_codes || []).length;
    const naicsScore = naicsCount >= 3 ? 10 : naicsCount >= 1 ? 6 : 0;
    factors.push({
      label: "NAICS Codes",
      score: naicsScore, max: 10,
      status: naicsScore >= 10 ? "complete" : naicsScore > 0 ? "partial" : "missing",
      action: naicsScore >= 10 ? `${naicsCount} NAICS codes configured` : naicsCount > 0 ? `Only ${naicsCount} NAICS code — add more for better matching` : "Add your NAICS codes for opportunity matching",
      link: "/dashboard/settings",
    });

    // 3. Certifications (0-15)
    const certCount = (org.certifications || []).length;
    const certScore = certCount >= 3 ? 15 : certCount >= 1 ? 8 : 0;
    factors.push({
      label: "SBA Certifications",
      score: certScore, max: 15,
      status: certScore >= 15 ? "complete" : certScore > 0 ? "partial" : "missing",
      action: certScore >= 15 ? `${certCount} certifications on file` : certCount > 0 ? `${certCount} certification — check if you qualify for more` : "No certifications — check your eligibility",
      link: "/dashboard/compliance",
    });

    // 4. Entity Description / Keywords (0-10)
    const hasDesc = !!org.entity_description && org.entity_description.length > 50;
    const hasKeywords = (org.keywords || []).length >= 3;
    const descScore = (hasDesc ? 5 : 0) + (hasKeywords ? 5 : 0);
    factors.push({
      label: "Business Profile",
      score: descScore, max: 10,
      status: descScore >= 10 ? "complete" : descScore > 0 ? "partial" : "missing",
      action: descScore >= 10 ? "Description and keywords set" : !hasDesc ? "Add a business description (50+ chars)" : "Add capability keywords for better AI matching",
      link: "/dashboard/settings",
    });

    // PERF: Fire all 3 count queries in parallel instead of sequentially
    const [ppResult, capResult, pipeResult] = await Promise.all([
      supabase.from("past_performance").select("id", { count: "estimated", head: true }).eq("organization_id", org.id),
      supabase.from("capability_statements").select("id", { count: "estimated", head: true }).eq("organization_id", org.id),
      supabase.from("opportunity_matches").select("id", { count: "estimated", head: true }).eq("organization_id", org.id).not("pipeline_stage", "is", null),
    ]);
    const ppCount = ppResult.count;
    const capCount = capResult.count;
    const pipeCount = pipeResult.count;

    // 5. Past Performance (0-15)
    const ppScore = (ppCount ?? 0) >= 3 ? 15 : (ppCount ?? 0) >= 1 ? 8 : 0;
    factors.push({
      label: "Past Performance",
      score: ppScore, max: 15,
      status: ppScore >= 15 ? "complete" : ppScore > 0 ? "partial" : "missing",
      action: ppScore >= 15 ? `${ppCount} past performance records` : (ppCount ?? 0) > 0 ? `Only ${ppCount} record — add more to strengthen proposals` : "No past performance — add commercial or federal experience",
      link: "/dashboard/past-performance",
    });

    // 6. Capability Statement (0-10)
    const capScore = (capCount ?? 0) >= 1 ? 10 : 0;
    factors.push({
      label: "Capability Statement",
      score: capScore, max: 10,
      status: capScore >= 1 ? "complete" : "missing",
      action: capScore >= 1 ? "Capability statement generated" : "Generate your capability statement PDF",
      link: "/dashboard/past-performance/capability",
    });

    // 7. Pipeline Activity (0-10)
    const pipeScore = (pipeCount ?? 0) >= 5 ? 10 : (pipeCount ?? 0) >= 1 ? 5 : 0;
    factors.push({
      label: "Pipeline Activity",
      score: pipeScore, max: 10,
      status: pipeScore >= 10 ? "complete" : pipeScore > 0 ? "partial" : "missing",
      action: pipeScore >= 10 ? `${pipeCount} opportunities in pipeline` : (pipeCount ?? 0) > 0 ? `${pipeCount} in pipeline — add more pursuits` : "Start tracking opportunities in your pipeline",
      link: "/dashboard/pipeline",
    });

    // 8. Service Area (0-5)
    const hasArea = org.serves_nationwide || (org.service_states || []).length > 0;
    const areaScore = hasArea ? 5 : 0;
    factors.push({
      label: "Service Area",
      score: areaScore, max: 5,
      status: areaScore >= 5 ? "complete" : "missing",
      action: areaScore >= 5 ? (org.serves_nationwide ? "Nationwide coverage" : `${(org.service_states || []).length} states configured`) : "Define your service area for geographic matching",
      link: "/dashboard/settings",
    });

    // 9. Setup Wizard (0-5)
    const wizScore = org.setup_wizard_complete ? 5 : 0;
    factors.push({
      label: "Setup Wizard",
      score: wizScore, max: 5,
      status: wizScore >= 5 ? "complete" : "missing",
      action: wizScore >= 5 ? "Onboarding complete" : "Complete the setup wizard",
      link: "/dashboard/onboarding/setup",
    });

    // 10. Contract Value Range (0-5)
    const hasRange = org.min_contract_value > 0 || org.max_contract_value > 0;
    const rangeScore = hasRange ? 5 : 0;
    factors.push({
      label: "Target Contract Value",
      score: rangeScore, max: 5,
      status: rangeScore >= 5 ? "complete" : "missing",
      action: rangeScore >= 5 ? "Contract value range configured" : "Set your target contract value range",
      link: "/dashboard/settings",
    });

    const totalScore = factors.reduce((s, f) => s + f.score, 0);
    const maxScore = factors.reduce((s, f) => s + f.max, 0);
    const percentage = Math.round((totalScore / maxScore) * 100);

    // Readiness level
    let level: string;
    let levelDetail: string;
    if (percentage >= 90) { level = "Contract Ready"; levelDetail = "Your profile is optimized for winning. Focus on bidding and relationship building."; }
    else if (percentage >= 70) { level = "Competitive"; levelDetail = "Strong foundation. Fill the remaining gaps to maximize win probability."; }
    else if (percentage >= 50) { level = "Developing"; levelDetail = "Good start, but significant gaps remain. Complete the missing items to compete effectively."; }
    else if (percentage >= 25) { level = "Foundation"; levelDetail = "Basic setup done. Prioritize the red items below to become bid-ready."; }
    else { level = "Getting Started"; levelDetail = "Just beginning your GovCon journey. Complete the setup wizard and registration first."; }

    return NextResponse.json({
      score: totalScore,
      maxScore,
      percentage,
      level,
      levelDetail,
      factors,
    });
  } catch (err: unknown) {
    console.error("readiness-score error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
