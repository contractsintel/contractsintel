import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { description, keywords } = await request.json();
    if (!description?.trim() && (!keywords || keywords.length === 0)) {
      return NextResponse.json({ error: "Description or keywords required" }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: `You are a government contracting NAICS code expert. Based on the business description and keywords, suggest 10-15 relevant NAICS codes with their titles. Return ONLY a JSON array of objects with "code" and "title" fields. Example: [{"code": "541512", "title": "Computer Systems Design Services"}]. Only include real, valid 6-digit NAICS codes.`,
      messages: [{
        role: "user",
        content: `Business description: ${(description || "").substring(0, 2000)}\n\nKeywords: ${(keywords || []).join(", ")}`,
      }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ naics: [] });
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ naics: [] });
    }

    const naics = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ naics });
  } catch (error) {
    console.error("NAICS generation error:", error);
    return NextResponse.json({ naics: [] });
  }
}
