import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "@/lib/rate-limit";

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
    const { competitor_id } = await request.json();

    // Fetch competitor scoped to org
    const { data: competitor } = await supabase
      .from("competitors")
      .select("*, competitor_encounters(*)")
      .eq("id", competitor_id)
      .eq("organization_id", orgId)
      .single();

    if (!competitor) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    // Fetch org details
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .single();

    const encounters = competitor.competitor_encounters ?? [];
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: 120_000,
      maxRetries: 2,
    });

    const systemPrompt = `You are a government contracting competitive intelligence analyst.
Provide actionable competitive analysis based on encounter history and known competitor information.
Focus on patterns, strengths/weaknesses, and strategic recommendations.`;

    const userPrompt = `Analyze this competitor for ${org?.name ?? "our organization"}:

Competitor: ${competitor.name}
UEI: ${competitor.uei ?? "Unknown"}
Certifications: ${JSON.stringify(competitor.certifications ?? [])}
NAICS Codes: ${JSON.stringify(competitor.naics_codes ?? [])}
Notes: ${competitor.notes ?? "None"}

Encounter History (${encounters.length} total):
${encounters.map((e: any) => `- ${e.opportunity_title ?? "Unknown"}: ${e.outcome ?? "pending"} | Agency: ${e.agency ?? "N/A"} | Value: ${e.value ? "$" + Number(e.value).toLocaleString() : "N/A"}`).join("\n")}

Our Organization:
- Name: ${org?.name}
- Certifications: ${JSON.stringify(org?.certifications ?? [])}
- NAICS: ${JSON.stringify(org?.naics_codes ?? [])}

Provide:
1. Win/loss pattern analysis
2. Competitor strengths and weaknesses
3. Agencies/domains where they are strongest
4. Recommended counter-strategies
5. Opportunities where we have advantages`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response" }, { status: 500 });
    }

    return NextResponse.json({ analysis: content.text });
  } catch (error) {
    console.error("Competitor analysis error:", error);
    return NextResponse.json({ error: "Failed to analyze competitor" }, { status: 500 });
  }
}
