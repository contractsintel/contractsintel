import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeCapabilityStatement } from "@/lib/capability-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
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

    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, uei, cage_code, naics_codes, certifications, entity_description, keywords")
      .eq("id", userRecord.organization_id)
      .single();
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { data: pastPerf } = await supabase
      .from("past_performance")
      .select("contract_title, contract_name, agency, contract_number, contract_value, award_amount, period_of_performance, description")
      .eq("organization_id", userRecord.organization_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const result = await writeCapabilityStatement({
      organization: org,
      past_performance: pastPerf ?? [],
    });

    const { data: inserted, error: insertError } = await supabase
      .from("capability_statements")
      .insert({
        organization_id: userRecord.organization_id,
        title: `${org.name} Capability Statement`,
        markdown: result.markdown,
        source_summary: result.source_summary,
        created_by: userRecord.id,
      })
      .select("id, title, markdown, source_summary, created_at")
      .single();

    if (insertError) {
      console.error("capability statement insert error:", insertError);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ statement: inserted });
  } catch (err: any) {
    console.error("capability statement generate error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
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
      .from("capability_statements")
      .select("id, title, markdown, source_summary, created_at")
      .eq("organization_id", userRecord.organization_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      return NextResponse.json({ error: "List failed" }, { status: 500 });
    }
    return NextResponse.json({ statements: data ?? [] });
  } catch (err: any) {
    console.error("capability statement list error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
