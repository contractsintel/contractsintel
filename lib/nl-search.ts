import Anthropic from "@anthropic-ai/sdk";

export type NLSearchFilters = {
  keywords: string[];
  naics: string[];
  psc: string[];
  set_asides: string[];
  agencies: string[];
  value_min: number | null;
  value_max: number | null;
  states: string[];
  rationale: string;
};

const SYSTEM_PROMPT = `You translate plain-English descriptions of a federal contractor's business into a structured search filter for the SAM.gov opportunities database. Reply with ONE JSON object and nothing else, matching this TypeScript shape exactly:

{
  "keywords": string[],          // 3-8 specific terms a search index would match
  "naics": string[],             // 6-digit NAICS codes if you can confidently infer them, else []
  "psc": string[],               // PSC / FSC codes if confidently inferable, else []
  "set_asides": string[],        // any of "8(a)","SDVOSB","WOSB","HUBZone","SDB","VOSB"; only if user mentions
  "agencies": string[],          // agency names if user names one, else []
  "value_min": number | null,    // dollars; null if not mentioned
  "value_max": number | null,    // dollars; null if not mentioned
  "states": string[],            // 2-letter postal codes if user names a place, else []
  "rationale": string            // one sentence explaining your filter choices
}

Rules:
- Output JSON only, no prose, no markdown fences.
- Prefer fewer high-precision filters over a long list of weak ones.
- If the user mentions a certification, include it in set_asides.
- If they say "small contracts" or similar, do NOT guess a value range; leave both null.
- Never invent NAICS codes you are not confident about.`;

export async function translateNLQuery(prompt: string): Promise<NLSearchFilters> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt.trim() }],
  });
  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected non-text response from model");
  }
  return parseFilters(block.text);
}

export function parseFilters(raw: string): NLSearchFilters {
  // Strip accidental ``` fences if the model adds them.
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
  return {
    keywords: arrayOfStrings(parsed.keywords),
    naics: arrayOfStrings(parsed.naics),
    psc: arrayOfStrings(parsed.psc),
    set_asides: arrayOfStrings(parsed.set_asides),
    agencies: arrayOfStrings(parsed.agencies),
    value_min: numberOrNull(parsed.value_min),
    value_max: numberOrNull(parsed.value_max),
    states: arrayOfStrings(parsed.states).map((s) => s.toUpperCase().slice(0, 2)),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}

function arrayOfStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
