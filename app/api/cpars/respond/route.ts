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
    const { rating_id } = await request.json();

    // Fetch rating scoped to org
    const { data: rating } = await supabase
      .from("cpars_ratings")
      .select("*, contracts(title, contract_number, agency, value)")
      .eq("id", rating_id)
      .eq("organization_id", orgId)
      .single();

    if (!rating) {
      return NextResponse.json({ error: "Rating not found" }, { status: 404 });
    }

    // Fetch organization details
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", orgId)
      .single();

    // Fetch past performance for context
    const { data: perfLogs } = await supabase
      .from("past_performance")
      .select("id, contract_title, contract_name, agency, contract_number, contract_value, award_amount, description")
      .eq("organization_id", orgId)
      .limit(5);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: 120_000,
      maxRetries: 2,
    });

    // P3.3: switch tone for Exceptional ratings — generate a thank-you /
    // marketing-asset draft instead of a defensive response.
    const isExceptional = rating.rating === "Exceptional";

    const systemPrompt = isExceptional
      ? `You are a government contracting expert helping a contractor capitalize on an Exceptional CPARS rating. Write a brief, professional thank-you letter that:
- Thanks the contracting officer warmly but professionally
- Reiterates the specific strengths called out in the evaluation
- Reinforces commitment to continued performance excellence
- Is suitable as a marketing asset / past performance reference
- Follows FAR 42.15 etiquette norms

Company: ${org?.name ?? "Unknown"}`
      : `You are a government contracting expert specializing in CPARS (Contractor Performance Assessment Reporting System) responses.
Write a formal, professional contractor response to a CPARS evaluation. The response should:
- Be respectful but firm in addressing inaccuracies
- Provide specific evidence and context
- Reference concrete deliverables and milestones
- Follow FAR 42.15 guidelines
- Be suitable for inclusion in the official CPARS record

Company: ${org?.name ?? "Unknown"}`;

    const userPrompt = isExceptional
      ? `Generate a thank-you / marketing-asset draft for the following Exceptional CPARS rating:

Contract: ${rating.contracts?.title ?? "Unknown"} (${rating.contracts?.contract_number ?? "N/A"})
Agency: ${rating.contracts?.agency ?? "Unknown"}
Category: ${rating.category}
Rating Received: ${rating.rating}
Evaluator Narrative: ${rating.narrative}

Past Performance Context: ${JSON.stringify(perfLogs ?? [])}

Write a 2-4 paragraph thank-you note that the contractor can send to the contracting officer AND repurpose as a marketing testimonial.`
      : `Generate a formal CPARS contractor response for the following evaluation:

Contract: ${rating.contracts?.title ?? "Unknown"} (${rating.contracts?.contract_number ?? "N/A"})
Agency: ${rating.contracts?.agency ?? "Unknown"}
Category: ${rating.category}
Rating Received: ${rating.rating}
Evaluator Narrative: ${rating.narrative}

Past Performance Context: ${JSON.stringify(perfLogs ?? [])}

Write a professional response that addresses the evaluation, provides context, and respectfully presents the contractor's perspective. The response should be 3-5 paragraphs.`;

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

    const responseText = content.text;

    // Save to cpars_ratings
    await supabase
      .from("cpars_ratings")
      .update({ response_draft: responseText })
      .eq("id", rating_id)
      .eq("organization_id", orgId);

    return NextResponse.json({ response: responseText });
  } catch (error) {
    console.error("CPARS response generation error:", error);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
  }
}
