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
    const body = await request.json();
    const { match_id } = body;

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

    const custom_instructions = body.custom_instructions || "";

    const userPrompt = `Generate a proposal draft for this opportunity:

Title: ${opp?.title}
Agency: ${opp?.agency}
Solicitation: ${opp?.solicitation_number ?? "N/A"}
Full Description: ${(opp?.full_description || opp?.description || "No description available").substring(0, 4000)}
Set-Aside: ${opp?.set_aside_type ?? "None"}${opp?.set_aside_description ? ` — ${opp.set_aside_description}` : ""}
NAICS: ${opp?.naics_code ?? "N/A"}${opp?.naics_description ? ` — ${opp.naics_description}` : ""}
Estimated Value: ${opp?.value_estimate || opp?.estimated_value ? `$${(opp.value_estimate || opp.estimated_value).toLocaleString()}` : "N/A"}
Place of Performance: ${opp?.place_of_performance ?? "N/A"}
Contract Type: ${opp?.contract_type ?? "N/A"}
${custom_instructions ? `\nAdditional instructions from the user: ${custom_instructions}` : ""}

Generate four sections in this exact JSON format:
{
  "Executive Summary": "150-250 words summarizing why this company is the best fit",
  "Technical Approach": "300-500 words detailing how the work will be performed",
  "Past Performance": "150-250 words referencing relevant prior contracts",
  "Management Plan": "150-250 words covering project management, staffing, quality control"
}

Each section must be specifically tailored to THIS opportunity and THIS company. Use concrete details from the description. Do not use generic filler.`;

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
