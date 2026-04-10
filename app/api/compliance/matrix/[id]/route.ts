import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("compliance_matrices")
      .select("id, organization_id, opportunity_id, source_label, rows, created_at, updated_at")
      .eq("id", ctx.params.id)
      .eq("organization_id", userRecord.organization_id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ matrix: data });
  } catch (err: any) {
    console.error("compliance matrix [id] GET error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!rows) {
      return NextResponse.json({ error: "Missing rows" }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Too many rows" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("compliance_matrices")
      .update({ rows, updated_at: new Date().toISOString() })
      .eq("id", ctx.params.id)
      .eq("organization_id", userRecord.organization_id)
      .select("id, rows, updated_at")
      .single();

    if (error || !data) {
      console.error("compliance matrix PATCH error:", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ matrix: data });
  } catch (err: any) {
    console.error("compliance matrix [id] PATCH error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
