import type { ScraperResult } from "./index";

const SBIR_API = "https://www.sbir.gov/api/solicitations.json";

const SBIR_SOURCES = [
  { id: "sbir_gov", name: "SBIR.gov", url: "https://www.sbir.gov/" },
  { id: "sbir_dod", name: "DoD SBIR", url: "https://www.defensesbirsttr.mil/" },
  { id: "sbir_nih", name: "NIH SBIR", url: "https://seed.nih.gov/" },
  { id: "sbir_nsf", name: "NSF SBIR", url: "https://seedfund.nsf.gov/" },
  { id: "sbir_doe", name: "DOE SBIR", url: "https://science.osti.gov/sbir" },
  { id: "sbir_nasa", name: "NASA SBIR", url: "https://sbir.nasa.gov/" },
  { id: "sbir_usda", name: "USDA SBIR", url: "https://www.nifa.usda.gov/grants/programs/sbir-program" },
];

export { SBIR_SOURCES };

export async function scrapeSbirSttr(supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    console.log(`[sbir-sttr] Attempting SBIR.gov API fetch with 30s timeout...`);

    const res = await fetch(SBIR_API, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown");
      console.log(`[sbir-sttr] SBIR.gov API returned ${res.status}: ${errorText.substring(0, 200)}`);
      return {
        source: "sbir_sttr",
        status: "error",
        opportunities_found: 0,
        matches_created: 0,
        error_message: `SBIR.gov API returned ${res.status}: ${errorText.substring(0, 200)}`,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      };
    }

    const data = await res.json();
    const solicitations: any[] = Array.isArray(data) ? data : (data.solicitations ?? data.results ?? []);

    console.log(`[sbir-sttr] Fetched ${solicitations.length} solicitations from SBIR.gov`);

    let upserted = 0;

    for (const sol of solicitations) {
      const solId = sol.id ?? sol.solicitation_id ?? sol.solicitationId;
      if (!solId) continue;

      const noticeId = `sbir-${solId}`;
      const title = sol.solicitation_title ?? sol.title ?? "SBIR/STTR Solicitation";
      const agency = sol.agency ?? sol.branch ?? "Unknown";
      const solNumber = sol.solicitation_number ?? sol.number ?? String(solId);
      const closeDate = sol.close_date ?? sol.closeDate ?? sol.application_due_date ?? null;
      const openDate = sol.open_date ?? sol.openDate ?? sol.release_date ?? null;
      const description = sol.description ?? sol.summary ?? sol.abstract ?? null;
      const program = sol.program ?? sol.type ?? null;

      const { error } = await supabase.from("opportunities").upsert(
        {
          notice_id: noticeId,
          title: `[${program || "SBIR/STTR"}] ${title}`,
          agency,
          solicitation_number: solNumber,
          value_estimate: null,
          response_deadline: closeDate ?? null,
          posted_date: openDate ?? null,
          description: description?.substring(0, 10000) ?? null,
          source: "sbir_sttr",
          source_url: sol.solicitation_url ?? sol.url ?? `https://www.sbir.gov/node/${solId}`,
        },
        { onConflict: "notice_id" }
      );

      if (!error) upserted++;
    }

    return {
      source: "sbir_sttr",
      status: "success",
      opportunities_found: solicitations.length,
      matches_created: upserted,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort") || message.includes("timeout") || message.includes("TimeoutError");

    console.log(`[sbir-sttr] ${isTimeout ? "API timeout" : "Error"}: ${message}`);

    return {
      source: "sbir_sttr",
      status: "error",
      opportunities_found: 0,
      matches_created: 0,
      error_message: isTimeout
        ? `SBIR.gov API timeout after 30s. ${SBIR_SOURCES.length} sources registered.`
        : message,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }
}
