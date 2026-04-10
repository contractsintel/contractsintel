import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractComplianceMatrix } from "@/lib/compliance-matrix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
      .select("id, organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rfpText = typeof body?.rfp_text === "string" ? body.rfp_text : "";
    const opportunityId =
      typeof body?.opportunity_id === "string" && body.opportunity_id.length > 0
        ? body.opportunity_id
        : null;
    const sourceLabel = typeof body?.source_label === "string" ? body.source_label.slice(0, 200) : null;

    if (!rfpText.trim()) {
      return NextResponse.json({ error: "Missing rfp_text" }, { status: 400 });
    }
    if (rfpText.length > 200000) {
      return NextResponse.json({ error: "rfp_text too long" }, { status: 400 });
    }

    const { rows, source_hash } = await extractComplianceMatrix(rfpText);

    const { data, error } = await supabase
      .from("compliance_matrices")
      .insert({
        organization_id: userRecord.organization_id,
        opportunity_id: opportunityId,
        source_label: sourceLabel,
        source_hash,
        rows,
        created_by: userRecord.id,
      })
      .select("id, organization_id, opportunity_id, source_label, rows, created_at")
      .single();

    if (error) {
      console.error("compliance matrix insert error:", error);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ matrix: data, row_count: rows.length });
  } catch (err: any) {
    console.error("compliance matrix POST error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
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
      .select("id, opportunity_id, source_label, created_at, rows")
      .eq("organization_id", userRecord.organization_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("compliance matrix list error:", error);
      return NextResponse.json({ error: "List failed" }, { status: 500 });
    }

    return NextResponse.json({
      matrices: (data ?? []).map((m: any) => ({
        id: m.id,
        opportunity_id: m.opportunity_id,
        source_label: m.source_label,
        created_at: m.created_at,
        row_count: Array.isArray(m.rows) ? m.rows.length : 0,
      })),
    });
  } catch (err: any) {
    console.error("compliance matrix GET error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
