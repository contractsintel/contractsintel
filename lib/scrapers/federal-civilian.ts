import type { ScraperResult } from "./index";
import { fetchWithScrapingBee, logScrapingBeeUsage } from "./scrapingbee";

// Sources that are JS SPAs requiring browser rendering
const JS_FEDERAL_SOURCES: Record<string, string> = {
  gsa_ebuy: "https://www.ebuy.gsa.gov/ebuy/",
  nih_nitaac: "https://nitaac.nih.gov/buy/opportunities",
};

const FEDERAL_CIVILIAN_SOURCES = [
  { id: "gsa_ebuy", name: "GSA eBuy", url: "https://www.ebuy.gsa.gov/" },
  { id: "nasa_procurement", name: "NASA Procurement", url: "https://procurement.nasa.gov/" },
  { id: "nih_nitaac", name: "NIH NITAAC", url: "https://oamp.od.nih.gov/contracts/find-contract-opportunities" },
  { id: "epa_contracts", name: "EPA Contracts", url: "https://www.epa.gov/contracts" },
  { id: "doe_procurement", name: "DOE Procurement", url: "https://www.energy.gov/management/office-management/operational-management/procurement-and-acquisition" },
  { id: "dot_osdbu", name: "DOT OSDBU", url: "https://www.transportation.gov/osdbu" },
  { id: "hhs_contracts", name: "HHS Grants & Contracts", url: "https://www.hhs.gov/grants-contracts/index.html" },
  { id: "doj_procurement", name: "DOJ Procurement", url: "https://www.justice.gov/jmd/procurement" },
  { id: "doi_acquisition", name: "DOI Acquisition", url: "https://www.doi.gov/pam/acquisition" },
  { id: "usda_procurement", name: "USDA Procurement", url: "https://www.dm.usda.gov/procurement/" },
  { id: "commerce_oam", name: "Commerce OAM", url: "https://www.commerce.gov/oam" },
  { id: "treasury_procurement", name: "Treasury Procurement", url: "https://home.treasury.gov/about/offices/management/procurement" },
  { id: "ssa_contracts", name: "SSA Contracts", url: "https://www.ssa.gov/oag/contracts/" },
  { id: "va_procurement", name: "VA Procurement", url: "https://www.va.gov/opal/nac/" },
  { id: "dhs_procurement", name: "DHS Procurement", url: "https://www.dhs.gov/procurement-operations" },
  { id: "state_procurement", name: "State Dept Procurement", url: "https://www.state.gov/key-topics-bureau-of-administration/procurement/" },
  { id: "hud_cpo", name: "HUD CPO", url: "https://www.hud.gov/program_offices/cpo" },
  { id: "ed_contracts", name: "Education Contracts", url: "https://www.ed.gov/fund/contract" },
  { id: "dol_procurement", name: "Labor Procurement", url: "https://www.dol.gov/general/procurement" },
  { id: "opm_procurement", name: "OPM Procurement", url: "https://www.opm.gov/about-us/doing-business-with-opm/" },
  { id: "faa_contracting", name: "FAA Contracting", url: "https://faaco.faa.gov/" },
  { id: "fema_procurement", name: "FEMA Procurement", url: "https://www.fema.gov/about/doing-business-with-fema" },
  { id: "gsa_subcontracting", name: "GSA Subcontracting", url: "https://www.gsa.gov/small-business/subcontracting-opportunities/subcontracting-directory" },
];

export { FEDERAL_CIVILIAN_SOURCES };

function extractLinks(html: string, baseUrl: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text && text.length > 5 && text.length < 300) {
      const href = match[1].startsWith("http")
        ? match[1]
        : (() => { try { return new URL(match[1], baseUrl).toString(); } catch { return match[1]; } })();
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

export async function scrapeFederalCivilian(supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  let totalFound = 0;
  let totalUpserted = 0;
  const sourceResults: string[] = [];

  for (const source of FEDERAL_CIVILIAN_SOURCES) {
    try {
      console.log(`[federal-civilian] Fetching ${source.name} (${source.url})...`);

      const res = await fetch(source.url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });

      if (!res.ok) {
        console.log(`[federal-civilian] ${source.name}: HTTP ${res.status} — will still attempt to parse body`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        sourceResults.push(`${source.id}: BLOCKED (non-HTML)`);
        continue;
      }

      let html = await res.text();

      if (html.length < 500 || html.includes("JavaScript is required") || html.includes("enable JavaScript")) {
        const reason = html.length < 500 ? "minimal response" : "requires JavaScript";

        // Try ScrapingBee fallback for ALL blocked sources (not just known JS SPAs)
        if (process.env.SCRAPINGBEE_KEY) {
          const sbUrl = JS_FEDERAL_SOURCES[source.id] || source.url;
          console.log(`[federal-civilian] ${source.name}: ${reason}, trying ScrapingBee for ${sbUrl}...`);
          try {
            html = await fetchWithScrapingBee(sbUrl, 5000);
            console.log(`[federal-civilian] ${source.name}: ScrapingBee returned ${html.length} bytes`);
          } catch (sbErr) {
            const sbMsg = sbErr instanceof Error ? sbErr.message : String(sbErr);
            console.log(`[federal-civilian] ${source.name}: ScrapingBee failed: ${sbMsg}`);
            await supabase.from("scraper_runs").insert({
              source: source.id,
              status: "error",
              opportunities_found: 0,
              matches_created: 0,
              error_message: `BLOCKED: ${reason} + ScrapingBee failed: ${sbMsg}`,
              started_at: startedAt,
              completed_at: new Date().toISOString(),
            });
            sourceResults.push(`${source.id}: BLOCKED (${reason} + ScrapingBee failed)`);
            continue;
          }
        } else {
          console.log(`[federal-civilian] ${source.name}: ${reason} BLOCKED`);
          await supabase.from("scraper_runs").insert({
            source: source.id,
            status: "error",
            opportunities_found: 0,
            matches_created: 0,
            error_message: `BLOCKED: ${reason}`,
            started_at: startedAt,
            completed_at: new Date().toISOString(),
          });
          sourceResults.push(`${source.id}: BLOCKED (${reason})`);
          continue;
        }
      }

      // Look for procurement related links and tables
      let procLinks = extractLinks(html, source.url).filter(
        (l) =>
          /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.text) ||
          /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.href)
      );
      let tableRows = extractTableRows(html);
      const hasData = procLinks.length >= 1 || tableRows.length >= 3;

      if (!hasData) {
        // Try ScrapingBee fallback for ALL sources that returned HTML but no data
        if (process.env.SCRAPINGBEE_KEY) {
          const sbUrl = JS_FEDERAL_SOURCES[source.id] || source.url;
          console.log(`[federal-civilian] ${source.name}: No parseable data, trying ScrapingBee for ${sbUrl}...`);
          try {
            html = await fetchWithScrapingBee(sbUrl, 5000);
            console.log(`[federal-civilian] ${source.name}: ScrapingBee returned ${html.length} bytes`);
            // Re-parse with ScrapingBee-rendered HTML
            procLinks = extractLinks(html, source.url).filter(
              (l) =>
                /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.text) ||
                /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.href)
            );
            tableRows = extractTableRows(html);
          } catch (sbErr) {
            const sbMsg = sbErr instanceof Error ? sbErr.message : String(sbErr);
            console.log(`[federal-civilian] ${source.name}: ScrapingBee failed: ${sbMsg}`);
          }
        }

        // Re-check after potential ScrapingBee attempt
        if (procLinks.length < 1 && tableRows.length < 3) {
          console.log(`[federal-civilian] ${source.name}: No parseable procurement data BLOCKED`);
          await supabase.from("scraper_runs").insert({
            source: source.id,
            status: "error",
            opportunities_found: 0,
            matches_created: 0,
            error_message: "BLOCKED: no parseable procurement data in HTML",
            started_at: startedAt,
            completed_at: new Date().toISOString(),
          });
          sourceResults.push(`${source.id}: BLOCKED (no parseable data)`);
          continue;
        }
      }

      let sourceOpps = 0;

      for (let i = 0; i < Math.min(procLinks.length, 50); i++) {
        const link = procLinks[i];
        const noticeId = `fedciv-${source.id}-link-${i}-${Date.now()}`;
        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: noticeId,
            title: `[${source.name}] ${link.text.substring(0, 200)}`,
            agency: source.name,
            source: "federal_civilian",
            source_url: link.href,
            description: link.text,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "notice_id" }
        );
        if (!error) {
          sourceOpps++;
          totalUpserted++;
        }
      }

      for (let i = 0; i < Math.min(tableRows.length, 50); i++) {
        const row = tableRows[i];
        const noticeId = `fedciv-${source.id}-table-${i}-${Date.now()}`;
        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: noticeId,
            title: `[${source.name}] ${row.substring(0, 200)}`,
            agency: source.name,
            source: "federal_civilian",
            source_url: source.url,
            description: row,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "notice_id" }
        );
        if (!error) {
          sourceOpps++;
          totalUpserted++;
        }
      }

      totalFound += sourceOpps;
      console.log(`[federal-civilian] ${source.name}: Found ${sourceOpps} items`);
      sourceResults.push(`${source.id}: ${sourceOpps} items`);
    } catch (srcErr) {
      const msg = srcErr instanceof Error ? srcErr.message : String(srcErr);
      const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
      console.log(`[federal-civilian] ${source.name}: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`);
      await supabase.from("scraper_runs").insert({
        source: source.id,
        status: "error",
        opportunities_found: 0,
        matches_created: 0,
        error_message: `BLOCKED: ${isTimeout ? "timeout" : msg.substring(0, 100)}`,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      });
      sourceResults.push(`${source.id}: BLOCKED (${isTimeout ? "timeout" : msg.substring(0, 50)})`);
    }
  }

  console.log(`[federal-civilian] Results: ${sourceResults.join(", ")}`);

  // Log ScrapingBee API usage for budget tracking
  await logScrapingBeeUsage(supabase);

  return {
    source: "federal_civilian",
    status: "success",
    opportunities_found: totalFound,
    matches_created: totalUpserted,
    error_message: totalFound === 0
      ? `Attempted ${FEDERAL_CIVILIAN_SOURCES.length} federal civilian sources. ${sourceResults.join("; ")}`
      : undefined,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
