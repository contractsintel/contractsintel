import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const { matchId, notes } = await request.json();
    if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

    const { error } = await admin
      .from("opportunity_matches")
      .update({
        user_notes: notes || null,
        notes_updated_at: new Date().toISOString(),
      })
      .eq("id", matchId)
      .eq("organization_id", userRec.organization_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to save notes" }, { status: 500 });
  }
}
