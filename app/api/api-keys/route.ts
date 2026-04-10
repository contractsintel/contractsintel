import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveOrgId(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Unauthorized", status: 401 as const };
  const { data: userRow } = await supabase
    .from("users")
    .select("id, organization_id")
    .eq("auth_id", user.id)
    .single();
  if (!userRow?.organization_id) {
    return { supabase, error: "Unauthorized", status: 401 as const };
  }
  return { supabase, userRow };
}

// GET /api/api-keys — list keys for the user's org (no secrets, just metadata).
export async function GET(request: NextRequest) {
  const r = await resolveOrgId(request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { supabase, userRow } = r;

  const { data, error } = await supabase
    .from("org_api_keys")
    .select("id, name, prefix, scopes, last_used_at, revoked_at, created_at")
    .eq("organization_id", userRow!.organization_id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("api keys list error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({ api_keys: data ?? [] });
}

// POST /api/api-keys — issue a new key. Returns the raw key ONCE.
export async function POST(request: NextRequest) {
  const r = await resolveOrgId(request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { supabase, userRow } = r;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Name too long" }, { status: 400 });

  const { rawKey, prefix, hashed } = generateApiKey();
  const { data, error } = await supabase
    .from("org_api_keys")
    .insert({
      organization_id: userRow!.organization_id,
      created_by: userRow!.id,
      name,
      prefix,
      hashed_key: hashed,
      scopes: ["read"],
    })
    .select("id, name, prefix, scopes, created_at")
    .single();
  if (error || !data) {
    console.error("api keys create error:", error);
    return NextResponse.json({ error: "Could not create key" }, { status: 500 });
  }
  return NextResponse.json({ api_key: { ...data, raw_key: rawKey } });
}
