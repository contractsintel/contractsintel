import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import type { RfpShred } from "@/lib/rfp-shredder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OutlineSubsection = {
  section_number: string;
  title: string;
  writing_instructions: string;
};

type OutlineSection = {
  section_number: string;
  title: string;
  page_limit: string;
  evaluation_weight: string;
  writing_instructions: string;
  key_themes: string[];
  evidence_needed: string[];
  subsections: OutlineSubsection[];
};

type ComplianceItem = {
  requirement: string;
  section: string;
  status: "required" | "recommended" | "optional";
};

type PageBudget = {
  total: number;
  sections: Record<string, number>;
};

type OutlineResponse = {
  outline: OutlineSection[];
  compliance_checklist: ComplianceItem[];
  page_budget: PageBudget;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a senior federal proposal manager creating an annotated proposal outline. Map every evaluation criterion to a proposal section. Include specific writing instructions that reference the solicitation requirements. Suggest evidence and proof points for each section.

Reply with ONE JSON object and nothing else. Schema:

{
  "outline": [
    {
      "section_number": "1.0",
      "title": "string",
      "page_limit": "string (e.g. '2 pages')",
      "evaluation_weight": "string — the evaluation factor this maps to",
      "writing_instructions": "string — detailed guidance referencing solicitation requirements",
      "key_themes": ["string"],
      "evidence_needed": ["string — specific contracts, certs, or data to cite"],
      "subsections": [
        {
          "section_number": "1.1",
          "title": "string",
          "writing_instructions": "string"
        }
      ]
    }
  ],
  "compliance_checklist": [
    {
      "requirement": "string",
      "section": "string — section_number where it is addressed",
      "status": "required | recommended | optional"
    }
  ],
  "page_budget": {
    "total": number,
    "sections": { "1.0": number, "2.0": number }
  }
}

Rules:
- Output JSON only, no markdown fences.
- Every evaluation criterion from Section M must map to at least one proposal section.
- Every instruction from Section L must appear in at least one writing_instructions or compliance_checklist entry.
- Page limits should sum to the total in page_budget.
- Be specific: reference solicitation section numbers (e.g. "L.3.1", "M.2") in writing instructions when available.
- For evidence_needed, reference real cert names, contract references, or data types the offeror should include.`;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // ---- Auth ----
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("id, organization_id")
      .eq("auth_id", user.id)
      .single();

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = userRecord.organization_id;

    // ---- Parse body ----
    const body = await request.json().catch(() => ({}));
    const matchId =
      typeof body?.match_id === "string" && body.match_id.length > 0
        ? body.match_id
        : null;
    const rfpShredId =
      typeof body?.rfp_shred_id === "string" && body.rfp_shred_id.length > 0
        ? body.rfp_shred_id
        : null;

    if (!matchId && !rfpShredId) {
      return NextResponse.json(
        { error: "Provide either match_id or rfp_shred_id" },
        { status: 400 },
      );
    }

    // ---- Resolve RFP shred ----
    let shred: RfpShred | null = null;
    let opportunityId: string | null = null;

    if (rfpShredId) {
      const { data: shredRow } = await supabase
        .from("rfp_shreds")
        .select("id, opportunity_id, sections, confidence")
        .eq("id", rfpShredId)
        .eq("organization_id", orgId)
        .single();

      if (!shredRow) {
        return NextResponse.json({ error: "RFP shred not found" }, { status: 404 });
      }
      shred = shredRow.sections as RfpShred;
      opportunityId = shredRow.opportunity_id;
    }

    if (matchId) {
      // Fetch match scoped to the user's org
      const { data: match } = await supabase
        .from("opportunity_matches")
        .select("*, opportunities(*)")
        .eq("id", matchId)
        .eq("organization_id", orgId)
        .single();

      if (!match) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }
      opportunityId = match.opportunity_id;

      // If we don't already have a shred, try to find one for this opportunity
      if (!shred) {
        const { data: existingShred } = await supabase
          .from("rfp_shreds")
          .select("id, sections, confidence")
          .eq("organization_id", orgId)
          .eq("opportunity_id", opportunityId)
          .order("extracted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingShred) {
          shred = existingShred.sections as RfpShred;
        }
      }
    }

    if (!shred) {
      return NextResponse.json(
        {
          error:
            "No RFP shred found. Run the RFP Decoder first (POST /api/proposals/shred) before generating an outline.",
        },
        { status: 400 },
      );
    }

    // ---- Fetch org data ----
    const { data: org } = await supabase
      .from("organizations")
      .select("name, naics_codes, certifications, entity_description, keywords")
      .eq("id", orgId)
      .single();

    // ---- Fetch past performance ----
    const { data: pastPerf } = await supabase
      .from("past_performance")
      .select(
        "contract_title, agency, contract_number, period_of_performance, contract_value, description",
      )
      .eq("organization_id", orgId)
      .order("contract_value", { ascending: false })
      .limit(10);

    // ---- Fetch opportunity metadata (if available) ----
    let oppContext = "";
    if (opportunityId) {
      const { data: opp } = await supabase
        .from("opportunities")
        .select(
          "title, agency, solicitation_number, naics_code, set_aside, estimated_value, place_of_performance, description",
        )
        .eq("id", opportunityId)
        .single();

      if (opp) {
        oppContext = `
Opportunity metadata:
- Title: ${opp.title}
- Agency: ${opp.agency}
- Solicitation: ${opp.solicitation_number ?? "N/A"}
- NAICS: ${opp.naics_code ?? "N/A"}
- Set-Aside: ${opp.set_aside ?? "Full & Open"}
- Estimated Value: ${opp.estimated_value ? `$${opp.estimated_value.toLocaleString()}` : "N/A"}
- Place of Performance: ${opp.place_of_performance ?? "N/A"}
- Description: ${(opp.description ?? "").substring(0, 2000)}`;
      }
    }

    // ---- Build Claude prompt ----
    const userPrompt = `Generate an annotated proposal outline based on the following RFP analysis and company information.

=== RFP DECODE ===

Section L (Instructions to Offerors):
${shred.section_l.length > 0 ? shred.section_l.map((s, i) => `  L.${i + 1}: ${s}`).join("\n") : "  (none extracted)"}

Section M (Evaluation Factors):
${shred.section_m.length > 0 ? shred.section_m.map((s, i) => `  M.${i + 1}: ${s}`).join("\n") : "  (none extracted)"}

Evaluation Criteria:
${shred.evaluation_criteria.length > 0 ? shred.evaluation_criteria.map((s, i) => `  ${i + 1}. ${s}`).join("\n") : "  (none extracted)"}

Deadlines:
${shred.deadlines.length > 0 ? shred.deadlines.map((d) => `  - ${d.label}: ${d.date}`).join("\n") : "  (none extracted)"}

Incumbent Hints:
${shred.incumbent_hints.length > 0 ? shred.incumbent_hints.join(", ") : "None identified"}

Summary: ${shred.summary || "N/A"}
${oppContext}

=== OFFEROR INFORMATION ===

Company: ${org?.name ?? "Unknown"}
NAICS Codes: ${(org?.naics_codes ?? []).join(", ") || "N/A"}
Certifications: ${(org?.certifications ?? []).join(", ") || "N/A"}
Description: ${org?.entity_description ?? "N/A"}
Keywords: ${(org?.keywords ?? []).join(", ") || "N/A"}

Past Performance:
${
  pastPerf && pastPerf.length > 0
    ? pastPerf
        .map(
          (pp) =>
            `  - ${pp.contract_title} (${pp.agency}) — ${pp.contract_number ?? "no contract #"} — $${pp.contract_value?.toLocaleString() ?? "N/A"}\n    ${(pp.description ?? "").substring(0, 300)}`,
        )
        .join("\n")
    : "  (no past performance records)"
}

Create the annotated proposal outline now. Map every evaluation criterion and Section L instruction to specific sections. Tailor writing instructions to this company's strengths and past performance.`;

    // ---- Call Claude ----
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 },
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected non-text response from model" },
        { status: 500 },
      );
    }

    // ---- Parse response ----
    const parsed = parseOutlineResponse(block.text);

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Proposal outline error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Response parser with validation
// ---------------------------------------------------------------------------

function parseOutlineResponse(raw: string): OutlineResponse {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try extracting JSON from surrounding text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Model returned non-JSON output");
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  // Validate and normalize outline sections
  const outline: OutlineSection[] = Array.isArray(parsed?.outline)
    ? parsed.outline.map(normalizeSection)
    : [];

  if (outline.length === 0) {
    throw new Error("Model returned empty outline");
  }

  // Validate compliance checklist
  const compliance_checklist: ComplianceItem[] = Array.isArray(
    parsed?.compliance_checklist,
  )
    ? parsed.compliance_checklist
        .filter(
          (c: any) =>
            c && typeof c.requirement === "string" && typeof c.section === "string",
        )
        .map((c: any) => ({
          requirement: c.requirement.slice(0, 300),
          section: c.section,
          status: ["required", "recommended", "optional"].includes(c.status)
            ? c.status
            : "required",
        }))
    : [];

  // Validate page budget
  const page_budget: PageBudget = normalizePageBudget(parsed?.page_budget, outline);

  return { outline, compliance_checklist, page_budget };
}

function normalizeSection(s: any): OutlineSection {
  const subsections: OutlineSubsection[] = Array.isArray(s?.subsections)
    ? s.subsections
        .filter((sub: any) => sub && typeof sub.title === "string")
        .map((sub: any) => ({
          section_number: String(sub.section_number ?? ""),
          title: sub.title.slice(0, 200),
          writing_instructions:
            typeof sub.writing_instructions === "string"
              ? sub.writing_instructions.slice(0, 1000)
              : "",
        }))
    : [];

  return {
    section_number: String(s?.section_number ?? ""),
    title: typeof s?.title === "string" ? s.title.slice(0, 200) : "Untitled",
    page_limit: typeof s?.page_limit === "string" ? s.page_limit.slice(0, 50) : "TBD",
    evaluation_weight:
      typeof s?.evaluation_weight === "string"
        ? s.evaluation_weight.slice(0, 200)
        : "",
    writing_instructions:
      typeof s?.writing_instructions === "string"
        ? s.writing_instructions.slice(0, 2000)
        : "",
    key_themes: Array.isArray(s?.key_themes)
      ? s.key_themes.filter((t: any): t is string => typeof t === "string")
      : [],
    evidence_needed: Array.isArray(s?.evidence_needed)
      ? s.evidence_needed.filter((e: any): e is string => typeof e === "string")
      : [],
    subsections,
  };
}

function normalizePageBudget(
  raw: any,
  outline: OutlineSection[],
): PageBudget {
  const sections: Record<string, number> = {};

  if (raw && typeof raw.sections === "object" && raw.sections !== null) {
    for (const [key, val] of Object.entries(raw.sections)) {
      if (typeof val === "number" && val > 0) {
        sections[key] = val;
      }
    }
  }

  // Derive total from sections if not provided or mismatched
  const summed = Object.values(sections).reduce((a, b) => a + b, 0);
  const total =
    typeof raw?.total === "number" && raw.total > 0 ? raw.total : summed || 50;

  return { total, sections };
}
