import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get org from authenticated user
    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: userRec } = await admin
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();

    if (!userRec?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const { matchId, status } = await request.json();

    if (!matchId || !status) {
      return NextResponse.json({ error: "matchId and status required" }, { status: 400 });
    }

    const validStatuses = ["tracking", "bidding", "skipped", "new"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Map user_status to pipeline_stage so items appear on the Pipeline page.
    // Without this, clicking "Track" sets user_status but leaves pipeline_stage
    // null, causing the item to be invisible on the pipeline board.
    const statusToStage: Record<string, string> = {
      tracking: "monitoring",
      bidding: "preparing_bid",
      skipped: "skipped",
    };

    const updateData: Record<string, any> = { user_status: status };
    if (statusToStage[status]) {
      updateData.pipeline_stage = statusToStage[status];
    } else if (status === "new") {
      // Toggling back to "new" removes the contract from the pipeline
      updateData.pipeline_stage = null;
    }

    const { data, error } = await admin
      .from("opportunity_matches")
      .update(updateData)
      .eq("id", matchId)
      .eq("organization_id", userRec.organization_id)
      .select()
      .single();

    if (error) {
      console.error("Update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Match not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true, match: data });
  } catch (err) {
    console.error("Update status error:", err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
