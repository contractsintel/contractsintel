import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Derive organization from authenticated user — never trust client input
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = userRecord.organization_id;
    const { match_id } = await request.json();

    // Fetch the match — scoped to user's org
    const { data: match } = await supabase
      .from("opportunity_matches")
      .select("*, opportunities(*)")
      .eq("id", match_id)
      .eq("organization_id", orgId)
      .single();

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Fetch organization details — scoped to user's org
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .single();

    // Fetch past performance — scoped to user's org
    const { data: pastPerf } = await supabase
      .from("past_performance")
      .select("*")
      .eq("organization_id", orgId)
      .limit(5);

    const opp = match.opportunities;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const systemPrompt = `You are a government contract proposal writer specializing in federal procurement.
Write professional, compelling proposal sections that align with FAR requirements and evaluation criteria.
Use specific, quantifiable language. Reference past performance where relevant.
The company details: ${JSON.stringify(org)}
Past performance records: ${JSON.stringify(pastPerf ?? [])}`;

    const userPrompt = `Generate a proposal draft for this opportunity:

Title: ${opp?.title}
Agency: ${opp?.agency}
Solicitation: ${opp?.solicitation_number ?? "N/A"}
Description: ${opp?.description ?? "No description available"}
Set-Aside: ${opp?.set_aside_type ?? "None"}
NAICS: ${opp?.naics_code ?? "N/A"}
Estimated Value: ${opp?.value_estimate ? `$${opp.value_estimate.toLocaleString()}` : "N/A"}

Generate three sections in this exact JSON format:
{
  "Technical Approach": "...",
  "Past Performance": "...",
  "Executive Summary": "..."
}

Each section should be 3-5 paragraphs, professional, and specifically tailored to this opportunity.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response" }, { status: 500 });
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse proposal" }, { status: 500 });
    }

    const proposal = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ proposal });
  } catch (error) {
    console.error("Proposal generation error:", error);
    return NextResponse.json({ error: "Failed to generate proposal" }, { status: 500 });
  }
}
