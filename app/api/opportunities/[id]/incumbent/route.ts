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

    const { data: opp, error: oppErr } = await supabase
      .from("opportunities")
      .select(
        "id, agency, naics_code, set_aside_type, contract_type, incumbent_name, incumbent_value, posted_date"
      )
      .eq("id", ctx.params.id)
      .single();
    if (oppErr || !opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    // Build the "similar prior buys" query: same agency + naics, prior posted date,
    // any historical opportunity that carries either an incumbent or an estimated value.
    let priorQuery = supabase
      .from("opportunities")
      .select(
        "id, title, agency, naics_code, posted_date, response_deadline, estimated_value, value_estimate, incumbent_name, incumbent_value, set_aside_type, sam_url, source_url"
      )
      .neq("id", opp.id)
      .order("posted_date", { ascending: false })
      .limit(5);

    if (opp.agency) priorQuery = priorQuery.ilike("agency", `%${opp.agency}%`);
    if (opp.naics_code) priorQuery = priorQuery.eq("naics_code", opp.naics_code);

    const { data: priors } = await priorQuery;

    return NextResponse.json({
      incumbent: {
        name: opp.incumbent_name ?? null,
        value: opp.incumbent_value ?? null,
      },
      basis: {
        agency: opp.agency,
        naics_code: opp.naics_code,
        set_aside_type: opp.set_aside_type,
      },
      prior_buys: priors ?? [],
    });
  } catch (err: unknown) {
    console.error("incumbent route error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
