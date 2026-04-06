import type { ScraperResult } from "./index";

const MILITARY_SOURCES = [
  { id: "dla_dibbs", name: "DLA DIBBS", url: "https://www.dibbs.bsm.dla.mil/" },
  { id: "army_asfi", name: "Army ASFI", url: "https://acquisition.army.mil/asfi/" },
  { id: "army_acc", name: "Army Contracting Command", url: "https://acc.army.mil/contractingcenters/" },
  { id: "navy_neco", name: "Navy NECO", url: "https://www.neco.navy.mil/" },
  { id: "air_force", name: "Air Force Contracting", url: "https://www.afmc.af.mil/contracting/" },
  { id: "marines", name: "Marine Corps", url: "https://www.marcorsyscom.marines.mil/" },
  { id: "disa", name: "DISA Procurement", url: "https://www.disa.mil/About/Procurement" },
  { id: "darpa", name: "DARPA Contracts", url: "https://www.darpa.mil/work-with-us/contracting" },
  { id: "dha", name: "Defense Health Agency", url: "https://health.mil/About-MHS/OASDHA/Defense-Health-Agency/Procurement-and-Contracting" },
  { id: "mda", name: "Missile Defense Agency", url: "https://www.mda.mil/business/" },
  { id: "space_force", name: "Space Force", url: "https://www.spaceforce.mil/" },
  { id: "usace", name: "Army Corps of Engineers", url: "https://www.usace.army.mil/Business-With-Us/" },
  { id: "socom", name: "SOCOM", url: "https://www.socom.mil/SOF-ATL/Pages/default.aspx" },
  { id: "dcsa", name: "DCSA", url: "https://www.dcsa.mil/mc/pv/mbi/procurement/" },
];

export { MILITARY_SOURCES };

// All sources to attempt fetching
const FETCH_TARGETS = MILITARY_SOURCES;

function extractLinks(html: string, baseUrl: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text && text.length > 3 && text.length < 300) {
      const href = match[1].startsWith("http") ? match[1] : (() => {
        try { return new URL(match[1], baseUrl).toString(); } catch { return match[1]; }
      })();
      links.push({ text, href });
    }
  }
  return links;
}

function extractTableRows(html: string): string[] {
  const rows: string[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = trRegex.exec(html)) !== null) {
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(match[1])) !== null) {
      const text = tdMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text) cells.push(text);
    }
    if (cells.length >= 2) {
      rows.push(cells.join(" | "));
    }
  }
  return rows;
}

export async function scrapeMilitaryDefense(supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    let totalFound = 0;
    let totalUpserted = 0;
    const sourceResults: string[] = [];

    for (const target of FETCH_TARGETS) {
      try {
        console.log(`[military-defense] Fetching ${target.name} (${target.url})...`);

        const res = await fetch(target.url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; ContractsIntel/1.0)",
            Accept: "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });

        if (!res.ok) {
          console.log(`[military-defense] ${target.name}: HTTP ${res.status} BLOCKED`);
          sourceResults.push(`${target.id}: BLOCKED (HTTP ${res.status})`);
          continue;
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          console.log(`[military-defense] ${target.name}: Non-HTML response BLOCKED`);
          sourceResults.push(`${target.id}: BLOCKED (non-HTML)`);
          continue;
        }

        const html = await res.text();

        if (html.length < 500) {
          console.log(`[military-defense] ${target.name}: Empty/minimal response BLOCKED`);
          sourceResults.push(`${target.id}: BLOCKED (minimal response)`);
          continue;
        }

        // Try to extract procurement-related links and table data
        const procurementLinks = extractLinks(html, target.url).filter(
          (l) =>
            /bid|rfp|rfq|solicit|procurement|contract|award|opportunity/i.test(l.text) ||
            /bid|rfp|rfq|solicit|procurement|contract|award|opportunity/i.test(l.href)
        );
        const tableRows = extractTableRows(html);
        const hasData = procurementLinks.length >= 1 || tableRows.length >= 3;

        if (!hasData) {
          console.log(`[military-defense] ${target.name}: No parseable procurement data BLOCKED`);
          sourceResults.push(`${target.id}: BLOCKED (no parseable data)`);
          continue;
        }

        let sourceOpps = 0;

        // Store procurement links as opportunities
        for (let i = 0; i < Math.min(procurementLinks.length, 50); i++) {
          const link = procurementLinks[i];
          const noticeId = `mil-${target.id}-link-${i}-${Date.now()}`;

          const { error } = await supabase.from("opportunities").upsert(
            {
              notice_id: noticeId,
              title: `[${target.name}] ${link.text.substring(0, 200)}`,
              agency: target.name,
              source: "military_defense",
              source_url: link.href,
              description: link.text,
            },
            { onConflict: "notice_id" }
          );
          if (!error) {
            sourceOpps++;
            totalUpserted++;
          }
        }

        // Store table data as opportunities
        for (let i = 0; i < Math.min(tableRows.length, 50); i++) {
          const row = tableRows[i];
          const noticeId = `mil-${target.id}-table-${i}-${Date.now()}`;

          const { error } = await supabase.from("opportunities").upsert(
            {
              notice_id: noticeId,
              title: `[${target.name}] ${row.substring(0, 200)}`,
              agency: target.name,
              source: "military_defense",
              source_url: target.url,
              description: row,
            },
            { onConflict: "notice_id" }
          );
          if (!error) {
            sourceOpps++;
            totalUpserted++;
          }
        }

        totalFound += sourceOpps;
        console.log(`[military-defense] ${target.name}: Found ${sourceOpps} items`);
        sourceResults.push(`${target.id}: ${sourceOpps} items`);
      } catch (targetErr) {
        const msg = targetErr instanceof Error ? targetErr.message : String(targetErr);
        const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
        console.log(`[military-defense] ${target.name}: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`);
        sourceResults.push(`${target.id}: BLOCKED (${isTimeout ? "timeout" : msg.substring(0, 50)})`);
      }
    }

    console.log(`[military-defense] Attempted all ${FETCH_TARGETS.length} sources. Results: ${sourceResults.join(", ")}`);

    return {
      source: "military_defense",
      status: "success",
      opportunities_found: totalFound,
      matches_created: totalUpserted,
      error_message: totalFound === 0
        ? `Attempted ${FETCH_TARGETS.length} sources. ${sourceResults.join("; ")}`
        : undefined,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      source: "military_defense",
      status: "error",
      opportunities_found: 0,
      matches_created: 0,
      error_message: err instanceof Error ? err.message : String(err),
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }
}
