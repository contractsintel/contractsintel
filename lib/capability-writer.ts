import Anthropic from "@anthropic-ai/sdk";

export type CapabilityInput = {
  organization: {
    name: string;
    uei?: string | null;
    cage_code?: string | null;
    naics_codes?: string[] | null;
    certifications?: string[] | null;
    entity_description?: string | null;
    keywords?: string[] | null;
  };
  past_performance: Array<{
    contract_title?: string | null;
    contract_name?: string | null;
    agency?: string | null;
    contract_number?: string | null;
    contract_value?: number | null;
    award_amount?: number | null;
    period_of_performance?: string | null;
    description?: string | null;
  }>;
};

export type CapabilityResult = {
  markdown: string;
  source_summary: {
    past_performance_count: number;
    naics: string[];
    certs: string[];
  };
};

const SYSTEM_PROMPT = `You write concise, professional capability statements for federal contractors.
Output valid Markdown only — no JSON, no fences. Keep the whole document under ~750 words so it fits two pages.

Required sections (in order, using ## H2 headers):
## Company Snapshot
## Core Capabilities
## Differentiators
## Past Performance Highlights
## Corporate Data
- UEI, CAGE, primary NAICS, certifications, point of contact placeholder

Rules:
- Use bullet points where appropriate.
- Never invent facts that are not in the input. If a field is missing, omit it gracefully.
- Past performance section should pull at most 4 of the strongest contracts as bullets.
- Use a confident but factual tone — no marketing fluff or superlatives.`;

export async function writeCapabilityStatement(input: CapabilityInput): Promise<CapabilityResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const org = input.organization;
  const naics = (org.naics_codes ?? []).filter(Boolean);
  const certs = (org.certifications ?? []).filter(Boolean);

  const ppLines = (input.past_performance ?? []).slice(0, 8).map((r) => {
    const title = r.contract_title || r.contract_name || "Untitled contract";
    const value = r.contract_value ?? r.award_amount;
    const valueStr = typeof value === "number" ? `$${value.toLocaleString()}` : "";
    return `- ${title}${r.agency ? ` — ${r.agency}` : ""}${valueStr ? ` (${valueStr})` : ""}${r.period_of_performance ? `, ${r.period_of_performance}` : ""}${r.description ? `: ${r.description}` : ""}`;
  });

  const userMessage = `Compose a capability statement for this federal contractor.

COMPANY:
- Name: ${org.name}
- UEI: ${org.uei ?? "(not provided)"}
- CAGE: ${org.cage_code ?? "(not provided)"}
- NAICS: ${naics.length ? naics.join(", ") : "(not provided)"}
- Certifications: ${certs.length ? certs.join(", ") : "(none on file)"}
- Description: ${org.entity_description ?? "(not provided)"}
- Keywords: ${(org.keywords ?? []).filter(Boolean).join(", ") || "(none)"}

PAST PERFORMANCE (${input.past_performance?.length ?? 0} records):
${ppLines.length ? ppLines.join("\n") : "(no past performance records on file)"}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected non-text response from model");
  }
  const markdown = block.text.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();

  return {
    markdown,
    source_summary: {
      past_performance_count: input.past_performance?.length ?? 0,
      naics,
      certs,
    },
  };
}
