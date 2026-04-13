import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";

export type ComplianceRow = {
  section: string;          // e.g. "L.3.2", "M.4.1"
  requirement: string;      // verbatim or paraphrased shall-statement
  evidence_required: string;// what reviewer must produce
  owner: string;            // free-text role; defaults to ""
  status: "pending" | "in_progress" | "complete";
  page_ref: string;         // optional page/section pointer in the source
};

export type ComplianceMatrixResult = {
  rows: ComplianceRow[];
  source_hash: string;
};

const SYSTEM_PROMPT = `You extract compliance matrix rows from federal RFP text. The input is the full or partial body of a Section L (Instructions to Offerors) and/or Section M (Evaluation Factors) document. Reply with ONE JSON object and nothing else.

Schema:
{
  "rows": [
    {
      "section": string,            // section reference like "L.3.2", "M.4.1", "C.5"; "" if unknown
      "requirement": string,        // the shall-statement, instruction, or evaluation criterion (max 280 chars)
      "evidence_required": string,  // what the proposal must include (max 200 chars); "" if not implied
      "owner": "",
      "status": "pending",
      "page_ref": string            // page/section pointer if present, else ""
    }
  ]
}

Rules:
- Output JSON only, no markdown fences, no prose.
- Extract every distinct shall-statement or numbered instruction. Do not invent rows.
- Prefer verbatim quotes for the requirement field, truncated to 280 chars.
- If the input is too short or contains no compliance items, return {"rows": []}.
- Always set owner to "" and status to "pending"; the user fills these in later.`;

export async function extractComplianceMatrix(rfpText: string): Promise<ComplianceMatrixResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const trimmed = rfpText.trim();
  if (!trimmed) {
    return { rows: [], source_hash: "" };
  }
  const source_hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 32);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: trimmed.slice(0, 60000) }],
  });
  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected non-text response from model");
  }
  const rows = parseRows(block.text);
  return { rows, source_hash };
}

export function parseRows(raw: string): ComplianceRow[] {
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
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  return rows
    .map((r: Record<string, any>) => ({
      section: typeof r?.section === "string" ? r.section.slice(0, 32) : "",
      requirement: typeof r?.requirement === "string" ? r.requirement.slice(0, 280) : "",
      evidence_required: typeof r?.evidence_required === "string" ? r.evidence_required.slice(0, 200) : "",
      owner: "",
      status: "pending" as const,
      page_ref: typeof r?.page_ref === "string" ? r.page_ref.slice(0, 32) : "",
    }))
    .filter((r: ComplianceRow) => r.requirement.length > 0);
}
