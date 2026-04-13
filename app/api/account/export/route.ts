import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GDPR Article 20: Data portability — export all user/org data as JSON.
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userRecord } = await supabase
      .from("users")
      .select("*")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = userRecord.organization_id;

    // Fetch all org-scoped data in parallel
    const [org, users, matches, contracts, cpars, pipeline, competitors, compliance, teamingOpps] =
      await Promise.all([
        supabase.from("organizations").select("*").eq("id", orgId).single(),
        supabase.from("users").select("id, email, full_name, role, created_at").eq("organization_id", orgId),
        supabase.from("opportunity_matches").select("*").eq("organization_id", orgId).limit(500),
        supabase.from("contracts").select("*").eq("organization_id", orgId),
        supabase.from("cpars_ratings").select("*").eq("organization_id", orgId),
        supabase.from("pipeline_items").select("*").eq("organization_id", orgId),
        supabase.from("tracked_competitors").select("*").eq("organization_id", orgId),
        supabase.from("compliance_items").select("*").eq("organization_id", orgId),
        supabase.from("teaming_opportunities").select("*").eq("organization_id", orgId),
      ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user: {
        email: user.email,
        full_name: userRecord.full_name,
        role: userRecord.role,
        created_at: userRecord.created_at,
      },
      organization: org.data,
      team_members: users.data,
      opportunity_matches: matches.data,
      contracts: contracts.data,
      cpars_ratings: cpars.data,
      pipeline: pipeline.data,
      competitors: competitors.data,
      compliance_items: compliance.data,
      teaming_opportunities: teamingOpps.data,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="contractsintel-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("Data export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
