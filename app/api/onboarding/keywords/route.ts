import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = rateLimit(`ai:${user.id}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly." },
        { status: 429 },
      );
    }

    const { description } = await request.json();
    if (!description?.trim()) {
      return NextResponse.json({ error: "Description required" }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are a government contracting expert. Based on the user's description of their business services, generate 8-15 keyword phrases that would match them to relevant government contract opportunities on SAM.gov and other procurement sources. Keywords should be specific government contracting terms, not generic business terms. Return a JSON array of strings only, no other text.`,
      messages: [{ role: "user", content: `Generate government contracting keywords for this business:\n\n${description.substring(0, 2000)}` }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response" }, { status: 500 });
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse keywords" }, { status: 500 });
    }

    const keywords = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ keywords });
  } catch (error) {
    console.error("Keyword generation error:", error);
    return NextResponse.json({ error: "Failed to generate keywords" }, { status: 500 });
  }
}
