import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Derive organization from authenticated user
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

    const { title, description, estimated_value, agency, required_certs, naics_codes, geography, deadline } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const { data, error } = await supabase.from("teaming_opportunities").insert({
      organization_id: orgId,
      title,
      description: description || null,
      estimated_value: estimated_value || null,
      agency: agency || null,
      required_certs: required_certs ?? [],
      naics_codes: naics_codes ?? [],
      geography: geography || null,
      deadline: deadline || null,
    }).select().single();

    if (error) {
      console.error("Teaming post error:", error);
      return NextResponse.json({ error: "Failed to create opportunity" }, { status: 500 });
    }

    return NextResponse.json({ opportunity: data });
  } catch (error) {
    console.error("Teaming post error:", error);
    return NextResponse.json({ error: "Failed to create opportunity" }, { status: 500 });
  }
}
