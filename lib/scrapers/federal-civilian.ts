import { logger } from "@/lib/logger";
import type { ScraperResult } from "./index";
import type { SupabaseAdmin } from "./types";
import { fetchWithPuppeteer, logPuppeteerUsage } from "./puppeteer";
import { createHash } from "crypto";

// Sources that are JS SPAs requiring browser rendering
const JS_FEDERAL_SOURCES: Record<string, string> = {
  gsa_ebuy: "https://www.ebuy.gsa.gov/ebuy/",
  nih_nitaac: "https://nitaac.nih.gov/buy/opportunities",
  faa_contracting: "https://faaco.faa.gov/index.cfm/announcement/list",
  sba_subnet: "https://eweb1.sba.gov/subnet/client/dsp_Landing.cfm",
  sbir_dod: "https://www.dodsbirsttr.mil/submissions/",
};

function stableId(source: string, text: string, href: string): string {
  const hash = createHash("md5").update(`${source}|${text}|${href}`).digest("hex").substring(0, 12);
  return `fedciv-${source}-${hash}`;
}

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

/**
 * Extract all next-page URLs from HTML pagination controls.
 */
function followPagination(html: string, baseUrl: string): string[] {
  const nextUrls: string[] = [];
  const seen = new Set<string>();

  // "Next" links
  const nextLinkRegex = /<a[^>]+href="([^"]*)"[^>]*>(?:[^<]*(?:next|Next|NEXT|›|&gt;|&raquo;|>>)[^<]*)<\/a>/gi;
  let m;
  while ((m = nextLinkRegex.exec(html)) !== null) {
    const href = m[1];
    if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
      try {
        const full = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
        if (!seen.has(full)) { seen.add(full); nextUrls.push(full); }
      } catch { /* skip */ }
    }
  }

  // aria-label="next" or rel="next"
  const ariaNextRegex = /<a[^>]+(?:aria-label="[^"]*next[^"]*"|rel="next")[^>]*href="([^"]*)"[^>]*>/gi;
  while ((m = ariaNextRegex.exec(html)) !== null) {
    const href = m[1];
    if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
      try {
        const full = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
        if (!seen.has(full)) { seen.add(full); nextUrls.push(full); }
      } catch { /* skip */ }
    }
  }

  // Numbered page param links
  const pageParamRegex = /<a[^>]+href="([^"]*(?:[?&](?:page|p|pg|start|offset|pageNumber|pagenumber)=[0-9]+)[^"]*)"/gi;
  while ((m = pageParamRegex.exec(html)) !== null) {
    const href = m[1];
    if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
      try {
        const full = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
        if (!seen.has(full)) { seen.add(full); nextUrls.push(full); }
      } catch { /* skip */ }
    }
  }

  return nextUrls;
}

export async function scrapeFederalCivilian(supabase: SupabaseAdmin): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  let totalFound = 0;
  let totalUpserted = 0;
  const sourceResults: string[] = [];

  for (const source of FEDERAL_CIVILIAN_SOURCES) {
    try {
      logger.info(`[federal-civilian] Fetching ${source.name} (${source.url})...`);

      const res = await fetch(source.url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(30000),
        redirect: "follow",
      });

      if (!res.ok) {
        logger.info(`[federal-civilian] ${source.name}: HTTP ${res.status} — will still attempt to parse body`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        sourceResults.push(`${source.id}: BLOCKED (non-HTML)`);
        continue;
      }

      let html = await res.text();

      if (html.length < 500 || html.includes("JavaScript is required") || html.includes("enable JavaScript")) {
        const reason = html.length < 500 ? "minimal response" : "requires JavaScript";

        // Try Puppeteer fallback for ALL blocked sources
        const pbUrl = JS_FEDERAL_SOURCES[source.id] || source.url;
        logger.info(`[federal-civilian] ${source.name}: ${reason}, trying Puppeteer for ${pbUrl}...`);
        try {
          html = await fetchWithPuppeteer(pbUrl, 10000);
          logger.info(`[federal-civilian] ${source.name}: Puppeteer returned ${html.length} bytes`);
        } catch (pbErr) {
          const pbMsg = pbErr instanceof Error ? pbErr.message : String(pbErr);
          logger.info(`[federal-civilian] ${source.name}: Puppeteer failed: ${pbMsg}`);
          await supabase.from("scraper_runs").insert({
            source: source.id,
            status: "error",
            opportunities_found: 0,
            matches_created: 0,
            error_message: `BLOCKED: ${reason} + Puppeteer failed: ${pbMsg}`,
            started_at: startedAt,
            completed_at: new Date().toISOString(),
          });
          sourceResults.push(`${source.id}: BLOCKED (${reason} + Puppeteer failed)`);
          continue;
        }
      }

      // Collect all HTML pages (page 1 + pagination)
      const allHtmlPages: string[] = [html];

      // Look for procurement related links and tables
      let procLinks = extractLinks(html, source.url).filter(
        (l) =>
          /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.text) ||
          /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.href)
      );
      let tableRows = extractTableRows(html);
      const hasData = procLinks.length >= 1 || tableRows.length >= 3;

      if (!hasData) {
        // Try Puppeteer fallback for ALL sources that returned HTML but no data
        {
          const pbUrl = JS_FEDERAL_SOURCES[source.id] || source.url;
          logger.info(`[federal-civilian] ${source.name}: No parseable data, trying Puppeteer for ${pbUrl}...`);
          try {
            html = await fetchWithPuppeteer(pbUrl, 10000);
            logger.info(`[federal-civilian] ${source.name}: Puppeteer returned ${html.length} bytes`);
            allHtmlPages[0] = html;
            // Re-parse with Puppeteer-rendered HTML
            procLinks = extractLinks(html, source.url).filter(
              (l) =>
                /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.text) ||
                /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.href)
            );
            tableRows = extractTableRows(html);
          } catch (pbErr) {
            const pbMsg = pbErr instanceof Error ? pbErr.message : String(pbErr);
            logger.info(`[federal-civilian] ${source.name}: Puppeteer failed: ${pbMsg}`);
          }
        }

        // Re-check after Puppeteer attempt
        if (procLinks.length < 1 && tableRows.length < 3) {
          logger.info(`[federal-civilian] ${source.name}: No parseable procurement data BLOCKED`);
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

      // Follow pagination on page 1 HTML (free for direct-fetched sources)
      {
        let currentHtml = allHtmlPages[0];
        let currentUrl = source.url;
        let pageNum = 1;

        while (true) {
          const paginationUrls = followPagination(currentHtml, currentUrl);
          if (paginationUrls.length === 0) break;

          const urlToFetch = paginationUrls[0];
          if (!urlToFetch || urlToFetch === currentUrl) break;

          pageNum++;
          logger.info(`[federal-civilian] ${source.name}: Fetching page ${pageNum} (${urlToFetch})...`);

          try {
            const isJsSource = !!JS_FEDERAL_SOURCES[source.id];
            let pageHtml: string;

            if (isJsSource) {
              pageHtml = await fetchWithPuppeteer(urlToFetch, 10000);
            } else {
              const pageRes = await fetch(urlToFetch, {
                method: "GET",
                headers: {
                  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  Accept: "text/html,application/xhtml+xml",
                },
                signal: AbortSignal.timeout(10000),
                redirect: "follow",
              });
              if (!pageRes.ok) {
                logger.info(`[federal-civilian] ${source.name}: Page ${pageNum} returned HTTP ${pageRes.status}, stopping pagination`);
                break;
              }
              pageHtml = await pageRes.text();
            }

            if (pageHtml.length < 200) {
              logger.info(`[federal-civilian] ${source.name}: Page ${pageNum} too small, stopping pagination`);
              break;
            }

            const newProcLinks = extractLinks(pageHtml, source.url).filter(
              (l) =>
                /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.text) ||
                /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.href)
            );
            const newTableRows = extractTableRows(pageHtml);

            if (newProcLinks.length === 0 && newTableRows.length === 0) {
              logger.info(`[federal-civilian] ${source.name}: Page ${pageNum} has no procurement data, stopping pagination`);
              break;
            }

            logger.info(`[federal-civilian] ${source.name}: Page ${pageNum} has ${newProcLinks.length} links, ${newTableRows.length} rows`);
            procLinks.push(...newProcLinks);
            tableRows.push(...newTableRows);
            allHtmlPages.push(pageHtml);
            currentHtml = pageHtml;
            currentUrl = urlToFetch;
          } catch (pageErr) {
            logger.info(`[federal-civilian] ${source.name}: Page ${pageNum} error: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
            break;
          }
        }

        if (allHtmlPages.length > 1) {
          logger.info(`[federal-civilian] ${source.name}: Fetched ${allHtmlPages.length} total pages`);
        }
      }

      let sourceOpps = 0;

      for (let i = 0; i < procLinks.length; i++) {
        const link = procLinks[i];
        const noticeId = stableId(source.id, link.text.substring(0, 200), link.href);
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

      for (let i = 0; i < tableRows.length; i++) {
        const row = tableRows[i];
        const noticeId = stableId(source.id, row.substring(0, 200), source.url);
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
      logger.info(`[federal-civilian] ${source.name}: Found ${sourceOpps} items across ${allHtmlPages.length} pages`);
      sourceResults.push(`${source.id}: ${sourceOpps} items`);
    } catch (srcErr) {
      const msg = srcErr instanceof Error ? srcErr.message : String(srcErr);
      const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
      logger.info(`[federal-civilian] ${source.name}: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}, retrying with Puppeteer...`);

      // Retry the whole source through Puppeteer on timeout/fetch failure
      try {
        const pbUrl = JS_FEDERAL_SOURCES[source.id] || source.url;
        const html = await fetchWithPuppeteer(pbUrl, 15000);
        const procLinks = extractLinks(html, source.url).filter(
          (l) => /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.text) ||
                 /bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition/i.test(l.href)
        );
        const tableRows = extractTableRows(html);
        let retryOpps = 0;

        for (const link of procLinks) {
          const noticeId = stableId(source.id, link.text.substring(0, 200), link.href);
          const { error } = await supabase.from("opportunities").upsert({
            notice_id: noticeId, title: `[${source.name}] ${link.text.substring(0, 200)}`,
            agency: source.name, source: "federal_civilian", source_url: link.href,
            description: link.text, last_seen_at: new Date().toISOString(),
          }, { onConflict: "notice_id" });
          if (!error) { retryOpps++; totalUpserted++; }
        }
        for (const row of tableRows) {
          const noticeId = stableId(source.id, row.substring(0, 200), source.url);
          const { error } = await supabase.from("opportunities").upsert({
            notice_id: noticeId, title: `[${source.name}] ${row.substring(0, 200)}`,
            agency: source.name, source: "federal_civilian", source_url: source.url,
            description: row, last_seen_at: new Date().toISOString(),
          }, { onConflict: "notice_id" });
          if (!error) { retryOpps++; totalUpserted++; }
        }

        if (retryOpps > 0) {
          totalFound += retryOpps;
          logger.info(`[federal-civilian] ${source.name}: Puppeteer retry found ${retryOpps} items`);
          sourceResults.push(`${source.id}: ${retryOpps} items (Puppeteer retry)`);
        } else {
          logger.info(`[federal-civilian] ${source.name}: Puppeteer retry returned no data`);
          sourceResults.push(`${source.id}: BLOCKED (Puppeteer retry: no data)`);
        }
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        logger.info(`[federal-civilian] ${source.name}: Puppeteer retry also failed: ${retryMsg}`);
        await supabase.from("scraper_runs").insert({
          source: source.id, status: "error", opportunities_found: 0, matches_created: 0,
          error_message: `BLOCKED: ${isTimeout ? "timeout" : msg.substring(0, 50)} + Puppeteer: ${retryMsg.substring(0, 50)}`,
          started_at: startedAt, completed_at: new Date().toISOString(),
        });
        sourceResults.push(`${source.id}: BLOCKED (${isTimeout ? "timeout" : "error"} + Puppeteer failed)`);
      }
    }
  }

  logger.info(`[federal-civilian] Results: ${sourceResults.join(", ")}`);

  await logPuppeteerUsage(supabase);

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
