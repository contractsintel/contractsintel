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

    const { record_id, organization_id } = await request.json();

    const { data: record } = await supabase
      .from("past_performance")
      .select("*")
      .eq("id", record_id)
      .eq("organization_id", organization_id)
      .single();

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organization_id)
      .single();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const prompt = `Generate a Past Performance Questionnaire (PPQ) narrative for this government contract:

Company: ${org?.name ?? "N/A"}
Contract Title: ${record.contract_title}
Agency: ${record.agency}
Contract Number: ${record.contract_number ?? "N/A"}
Period of Performance: ${record.period_of_performance ?? "N/A"}
Contract Value: ${record.contract_value ? `$${record.contract_value.toLocaleString()}` : "N/A"}
Description: ${record.description ?? "N/A"}

Monthly Performance Logs:
${(record.monthly_logs ?? []).map((l: any) => `- ${l.date}: ${l.text}`).join("\n")}

Write a professional PPQ narrative (3-5 paragraphs) that:
1. Summarizes the scope and complexity of the work
2. Highlights key accomplishments and deliverables
3. Demonstrates on-time, on-budget performance
4. Emphasizes quality of work and customer satisfaction
5. Uses specific metrics and quantifiable results where possible

Write in third person, suitable for inclusion in a government proposal.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response" }, { status: 500 });
    }

    return NextResponse.json({ narrative: content.text });
  } catch (error) {
    console.error("PPQ generation error:", error);
    return NextResponse.json({ error: "Failed to generate PPQ narrative" }, { status: 500 });
  }
}
