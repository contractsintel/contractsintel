import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GDPR Article 17: Right to erasure — delete all user and org data.
// Requires confirmation via POST body { confirm: "DELETE" }.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    if (body.confirm !== "DELETE") {
      return NextResponse.json(
        { error: 'Send { "confirm": "DELETE" } to confirm account deletion' },
        { status: 400 },
      );
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id, role")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = userRecord.organization_id;

    // Use admin client for cascading deletes
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Delete org-scoped data (order matters for FK constraints)
    const tables = [
      "cpars_ratings",
      "compliance_items",
      "pipeline_items",
      "tracked_competitors",
      "teaming_opportunities",
      "opportunity_matches",
      "contracts",
      "rfp_shreds",
      "org_api_keys",
    ];

    for (const table of tables) {
      await adminSupabase.from(table).delete().eq("organization_id", orgId);
    }

    // Delete users in this org
    const { data: orgUsers } = await adminSupabase
      .from("users")
      .select("auth_id")
      .eq("organization_id", orgId);

    await adminSupabase.from("users").delete().eq("organization_id", orgId);
    await adminSupabase.from("organizations").delete().eq("id", orgId);

    // Delete auth users
    if (orgUsers) {
      for (const u of orgUsers) {
        if (u.auth_id) {
          await adminSupabase.auth.admin.deleteUser(u.auth_id);
        }
      }
    }

    return NextResponse.json({ success: true, message: "Account and all data deleted" });
  } catch (error) {
    console.error("Account deletion error:", error);
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}
