import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the authenticated user's organization
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { status, pipeline_stage, award_amount, contract_number, loss_reason, loss_notes } =
      await request.json();

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.user_status = status;
    if (pipeline_stage !== undefined) updateData.pipeline_stage = pipeline_stage;
    if (award_amount !== undefined) updateData.award_amount = award_amount;
    if (contract_number !== undefined) updateData.contract_number = contract_number;
    if (loss_reason !== undefined) updateData.loss_reason = loss_reason;
    if (loss_notes !== undefined) updateData.loss_notes = loss_notes;

    // Only update if the match belongs to the user's organization
    const { data, error } = await supabase
      .from("opportunity_matches")
      .update(updateData)
      .eq("id", params.id)
      .eq("organization_id", userRecord.organization_id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ match: data });
  } catch (error) {
    console.error("Status update error:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
