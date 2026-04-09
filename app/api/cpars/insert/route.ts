import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// P3.3: Server-side insert for cpars_ratings with explicit org ownership
// check. Belt-and-suspenders alongside RLS — refuses any insert whose
// contract_id doesn't belong to the caller's organization.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = userRecord.organization_id;

    const body = await request.json();
    const { contract_id, category, rating, narrative, evaluation_date } = body;
    if (!contract_id || !category || !rating || !narrative) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify the contract belongs to this org BEFORE inserting
    const { data: contract } = await supabase
      .from("contracts")
      .select("id, organization_id")
      .eq("id", contract_id)
      .single();
    if (!contract || contract.organization_id !== orgId) {
      return NextResponse.json({ error: "Contract not in your organization" }, { status: 403 });
    }

    const { data: inserted, error } = await supabase
      .from("cpars_ratings")
      .insert({
        organization_id: orgId,
        contract_id,
        category,
        rating,
        narrative,
        evaluation_date: evaluation_date || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rating: inserted });
  } catch (e: any) {
    console.error("[cpars insert] error", e?.message);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
}
