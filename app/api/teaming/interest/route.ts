import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Derive organization from authenticated user
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = userRecord.organization_id;
    const { teaming_opportunity_id } = await request.json();

    if (!teaming_opportunity_id) {
      return NextResponse.json({ error: "teaming_opportunity_id required" }, { status: 400 });
    }

    // Verify the opportunity exists
    const { data: opp } = await supabase
      .from("teaming_opportunities")
      .select("id")
      .eq("id", teaming_opportunity_id)
      .single();

    if (!opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    // Upsert teaming_match
    const { data: existing } = await supabase
      .from("teaming_matches")
      .select("id")
      .eq("teaming_opportunity_id", teaming_opportunity_id)
      .eq("organization_id", orgId)
      .single();

    if (existing) {
      await supabase
        .from("teaming_matches")
        .update({ interest_status: "interested", updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("teaming_matches").insert({
        teaming_opportunity_id,
        organization_id: orgId,
        interest_status: "interested",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Teaming interest error:", error);
    return NextResponse.json({ error: "Failed to express interest" }, { status: 500 });
  }
}
