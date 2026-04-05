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

    const { status, pipeline_stage, award_amount, contract_number, loss_reason, loss_notes } =
      await request.json();

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.user_status = status;
    if (pipeline_stage !== undefined) updateData.pipeline_stage = pipeline_stage;
    if (award_amount !== undefined) updateData.award_amount = award_amount;
    if (contract_number !== undefined) updateData.contract_number = contract_number;
    if (loss_reason !== undefined) updateData.loss_reason = loss_reason;
    if (loss_notes !== undefined) updateData.loss_notes = loss_notes;

    const { data, error } = await supabase
      .from("opportunity_matches")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ match: data });
  } catch (error) {
    console.error("Status update error:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
