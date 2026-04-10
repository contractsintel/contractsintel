import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SECTION_KEYS = [
  "executive_summary",
  "technical_approach",
  "past_performance",
  "management_plan",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

type SectionReview = {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
};

type PinkTeamReview = {
  overall_score: number;
  overall_assessment: string;
  section_reviews: Record<SectionKey, SectionReview>;
  compliance_gaps: string[];
  win_probability: "Low" | "Medium" | "High";
  recommended_improvements: string[];
};

const SYSTEM_PROMPT = `You are a senior federal proposal reviewer conducting a Pink Team review. Score the proposal against the solicitation requirements and evaluation criteria. Be specific, actionable, and cite FAR/DFARS where relevant. Focus on compliance gaps and win-probability factors.

Reply with ONE JSON object matching this schema exactly — no markdown fences, no extra text:
{
  "overall_score": <number 0-100>,
  "overall_assessment": "<string>",
  "section_reviews": {
    "executive_summary": { "score": <number 0-100>, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."] },
    "technical_approach": { "score": <number 0-100>, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."] },
    "past_performance": { "score": <number 0-100>, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."] },
    "management_plan": { "score": <number 0-100>, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."] }
  },
  "compliance_gaps": ["..."],
  "win_probability": "Low" | "Medium" | "High",
  "recommended_improvements": ["..."]
}`;

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
    const { match_id, sections } = body;

    if (!match_id || typeof match_id !== "string") {
      return NextResponse.json({ error: "match_id is required" }, { status: 400 });
    }

    // Validate that all four sections are provided and non-empty
    for (const key of SECTION_KEYS) {
      if (!sections?.[key] || typeof sections[key] !== "string" || sections[key].trim().length === 0) {
        return NextResponse.json(
          { error: `Section "${key}" is required and must be a non-empty string` },
          { status: 400 },
        );
      }
    }

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

    const opp = match.opportunities;

    // Fetch the most recent RFP shred for this opportunity (if any)
    const { data: shred } = await supabase
      .from("rfp_shreds")
      .select("sections, confidence")
      .eq("organization_id", orgId)
      .eq("opportunity_id", opp?.id)
      .order("extracted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Build evaluation context from shred data
    let evaluationContext = "";
    if (shred?.sections) {
      const s = shred.sections as Record<string, unknown>;
      const evalCriteria = Array.isArray(s.evaluation_criteria) ? s.evaluation_criteria : [];
      const sectionM = Array.isArray(s.section_m) ? s.section_m : [];
      const sectionL = Array.isArray(s.section_l) ? s.section_l : [];

      if (evalCriteria.length > 0) {
        evaluationContext += `\nEvaluation Criteria (from RFP shred):\n${evalCriteria.map((c: string) => `- ${c}`).join("\n")}`;
      }
      if (sectionM.length > 0) {
        evaluationContext += `\nSection M — Evaluation Factors:\n${sectionM.map((f: string) => `- ${f}`).join("\n")}`;
      }
      if (sectionL.length > 0) {
        evaluationContext += `\nSection L — Instructions to Offerors:\n${sectionL.map((i: string) => `- ${i}`).join("\n")}`;
      }
    }

    const userPrompt = `Review the following proposal draft against the solicitation requirements.

--- OPPORTUNITY ---
Title: ${opp?.title ?? "N/A"}
Agency: ${opp?.agency ?? "N/A"}
Solicitation: ${opp?.solicitation_number ?? "N/A"}
Description: ${(opp?.full_description || opp?.description || "No description available").substring(0, 6000)}
Set-Aside: ${opp?.set_aside_type ?? "None"}${opp?.set_aside_description ? ` — ${opp.set_aside_description}` : ""}
NAICS: ${opp?.naics_code ?? "N/A"}${opp?.naics_description ? ` — ${opp.naics_description}` : ""}
Contract Type: ${opp?.contract_type ?? "N/A"}
Place of Performance: ${opp?.place_of_performance ?? "N/A"}
${evaluationContext}

--- PROPOSAL SECTIONS ---

Executive Summary:
${sections.executive_summary}

Technical Approach:
${sections.technical_approach}

Past Performance:
${sections.past_performance}

Management Plan:
${sections.management_plan}

--- INSTRUCTIONS ---
Score each section 0-100 and the proposal overall. Identify compliance gaps referencing specific FAR/DFARS clauses where applicable. Assess win probability as Low, Medium, or High. Provide concrete, actionable improvement suggestions.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response" }, { status: 500 });
    }

    // Parse JSON from the model response — tolerate markdown fences
    const cleaned = content.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse review" }, { status: 500 });
    }

    const review: PinkTeamReview = JSON.parse(jsonMatch[0]);

    // Clamp scores to 0-100 and validate structure
    review.overall_score = Math.max(0, Math.min(100, Math.round(review.overall_score ?? 0)));
    for (const key of SECTION_KEYS) {
      if (review.section_reviews?.[key]) {
        review.section_reviews[key].score = Math.max(
          0,
          Math.min(100, Math.round(review.section_reviews[key].score ?? 0)),
        );
      }
    }
    if (!["Low", "Medium", "High"].includes(review.win_probability)) {
      review.win_probability = "Medium";
    }

    return NextResponse.json({ review });
  } catch (error) {
    console.error("Pink team review error:", error);
    return NextResponse.json({ error: "Failed to generate review" }, { status: 500 });
  }
}
