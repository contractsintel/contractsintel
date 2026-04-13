import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { shredRfp } from "@/lib/rfp-shredder";
import { rateLimit } from "@/lib/rate-limit";

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

    const rl = rateLimit(`ai:${user.id}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly." },
        { status: 429 },
      );
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
    const opportunityId =
      typeof body?.opportunity_id === "string" && body.opportunity_id.length > 0
        ? body.opportunity_id
        : null;
    let text = typeof body?.text === "string" ? body.text : "";

    // If only an opportunity_id was provided, hydrate text from the opportunity row.
    if (!text && opportunityId) {
      const { data: opp } = await supabase
        .from("opportunities")
        .select("title, full_description, description, response_instructions, agency, naics_code")
        .eq("id", opportunityId)
        .single();
      if (opp) {
        text = [
          opp.title,
          opp.agency,
          opp.naics_code ? `NAICS ${opp.naics_code}` : "",
          opp.full_description,
          opp.description,
          opp.response_instructions,
        ]
          .filter(Boolean)
          .join("\n\n");
      }
    }

    if (!text || text.trim().length < 30) {
      return NextResponse.json(
        { error: "Need either text (>=30 chars) or an opportunity_id with description" },
        { status: 400 },
      );
    }
    if (text.length > 200000) {
      return NextResponse.json({ error: "text too long" }, { status: 400 });
    }

    const sourceLabel = typeof body?.source_label === "string" ? body.source_label.slice(0, 200) : null;
    const result = await shredRfp(text);

    const { data, error } = await supabase
      .from("rfp_shreds")
      .insert({
        organization_id: userRecord.organization_id,
        opportunity_id: opportunityId,
        source_label: sourceLabel ?? (opportunityId ? `opportunity:${opportunityId}` : "manual"),
        source_hash: result.source_hash,
        sections: result.shred,
        confidence: result.confidence,
        created_by: userRecord.id,
      })
      .select("id, opportunity_id, source_label, sections, confidence, extracted_at")
      .single();

    if (error) {
      console.error("rfp shred insert error:", error);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ shred: data });
  } catch (err: any) {
    console.error("rfp shred error:", err);
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

    const url = new URL(request.url);
    const opportunityId = url.searchParams.get("opportunity_id");
    let q = supabase
      .from("rfp_shreds")
      .select("id, opportunity_id, source_label, sections, confidence, extracted_at")
      .eq("organization_id", userRecord.organization_id)
      .order("extracted_at", { ascending: false })
      .limit(20);
    if (opportunityId) q = q.eq("opportunity_id", opportunityId);
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: "List failed" }, { status: 500 });
    }
    return NextResponse.json({ shreds: data ?? [] });
  } catch (err: any) {
    console.error("rfp shred GET error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
