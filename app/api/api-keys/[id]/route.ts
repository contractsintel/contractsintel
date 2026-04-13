import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/api-keys/[id] — soft-revoke a key.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Scope to caller's org so users can't revoke another org's keys
  const { data: userRecord } = await supabase
    .from("users")
    .select("organization_id")
    .eq("auth_id", user.id)
    .single();
  if (!userRecord?.organization_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("org_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("organization_id", userRecord.organization_id);
  if (error) {
    console.error("api keys revoke error:", error);
    return NextResponse.json({ error: "Could not revoke key" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
