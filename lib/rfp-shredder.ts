import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";

export type RfpShred = {
  section_l: string[];          // instructions to offerors
  section_m: string[];          // evaluation factors
  evaluation_criteria: string[];// distilled scoring criteria
  deadlines: { label: string; date: string }[]; // ISO date strings if parseable, else free text
  incumbent_hints: string[];    // names, contract numbers, references
  summary: string;              // 1-2 sentence executive summary
};

export type RfpShredResult = {
  shred: RfpShred;
  confidence: number;
  source_hash: string;
};

const SYSTEM_PROMPT = `You analyze federal RFP / solicitation text and produce a structured shred. Reply with ONE JSON object and nothing else.

Schema:
{
  "section_l": string[],          // instructions to offerors — bullet phrases, max 200 chars each
  "section_m": string[],          // evaluation factors — bullet phrases, max 200 chars each
  "evaluation_criteria": string[],// distilled scoring criteria
  "deadlines": [{"label": string, "date": string}],  // date as YYYY-MM-DD if parseable, else free text
  "incumbent_hints": string[],    // any incumbent names, prior contract numbers, or hints
  "summary": string,              // 1-2 sentences capturing the buy
  "confidence": number            // 0..1 self-assessment of extraction quality
}

Rules:
- Output JSON only, no markdown fences.
- If a section is missing in the source, return [] for that key.
- Never invent facts; only extract what is present.
- Truncate any string field at 200 chars.`;

export async function shredRfp(text: string): Promise<RfpShredResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return {
      shred: {
        section_l: [],
        section_m: [],
        evaluation_criteria: [],
        deadlines: [],
        incumbent_hints: [],
        summary: "",
      },
      confidence: 0,
      source_hash: "",
    };
  }
  const source_hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: trimmed.slice(0, 80000) }],
  });
  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected non-text response from model");
  }
  return parseShred(block.text, source_hash);
}

export function parseShred(raw: string, source_hash: string): RfpShredResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Model returned non-JSON output");
  }
  const arr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.slice(0, 200))
      : [];
  const deadlines: { label: string; date: string }[] = Array.isArray(parsed?.deadlines)
    ? parsed.deadlines
        .filter((d: Record<string, any>) => d && (typeof d.label === "string" || typeof d.date === "string"))
        .map((d: Record<string, any>) => ({
          label: typeof d.label === "string" ? d.label.slice(0, 120) : "",
          date: typeof d.date === "string" ? d.date.slice(0, 40) : "",
        }))
    : [];
  const confidenceRaw = typeof parsed?.confidence === "number" ? parsed.confidence : 0.5;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));
  return {
    shred: {
      section_l: arr(parsed?.section_l),
      section_m: arr(parsed?.section_m),
      evaluation_criteria: arr(parsed?.evaluation_criteria),
      deadlines,
      incumbent_hints: arr(parsed?.incumbent_hints),
      summary: typeof parsed?.summary === "string" ? parsed.summary.slice(0, 400) : "",
    },
    confidence,
    source_hash,
  };
}
