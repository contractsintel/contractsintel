import { logger } from "@/lib/logger";
import type { ScraperResult } from "./index";
import type { SupabaseAdmin } from "./types";
import { fetchWithPuppeteer, logPuppeteerUsage } from "./puppeteer";

const SBIR_API = "https://www.sbir.gov/api/solicitations.json";

// Sources that are JS SPAs requiring browser rendering
const JS_SBIR_SOURCES: Record<string, string> = {
  sbir_dod: "https://www.dodsbirsttr.mil/submissions/",
};

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

const SBIR_SOURCES = [
  { id: "sbir_gov", name: "SBIR.gov", url: "https://www.sbir.gov/" },
  { id: "sbir_dod", name: "DoD SBIR", url: "https://www.dodsbirsttr.mil/submissions/" },
  { id: "sbir_nih", name: "NIH SBIR", url: "https://seed.nih.gov/" },
  { id: "sbir_nsf", name: "NSF SBIR", url: "https://seedfund.nsf.gov/" },
  { id: "sbir_doe", name: "DOE SBIR", url: "https://science.osti.gov/sbir" },
  { id: "sbir_nasa", name: "NASA SBIR", url: "https://sbir.nasa.gov/" },
  { id: "sbir_usda", name: "USDA SBIR", url: "https://www.nifa.usda.gov/grants/programs/sbir-program" },
];

export { SBIR_SOURCES };

export async function scrapeSbirSttr(supabase: SupabaseAdmin): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();
  let apiFound = 0;
  let apiUpserted = 0;

  try {
    logger.info(`[sbir-sttr] Attempting SBIR.gov API fetch with 30s timeout...`);

    const res = await fetch(SBIR_API, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown");
      logger.info(`[sbir-sttr] SBIR.gov API returned ${res.status}: ${errorText.substring(0, 200)}`);
      // Don't return early - continue to agency HTML sources below
    } else {
      const data = await res.json();
      const solicitations: Record<string, any>[] = Array.isArray(data) ? data : (data.solicitations ?? data.results ?? []);

      logger.info(`[sbir-sttr] Fetched ${solicitations.length} solicitations from SBIR.gov`);
      apiFound = solicitations.length;

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
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "notice_id" }
      );

      if (!error) apiUpserted++;
    }

    } // end else (API success)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort") || message.includes("timeout") || message.includes("TimeoutError");

    logger.info(`[sbir-sttr] ${isTimeout ? "API timeout" : "Error"}: ${message}`);

    // Even if main API fails, try the individual agency sources below
  }

  // Now attempt each additional SBIR agency source via HTML scraping
  const additionalSources = SBIR_SOURCES.filter((s) => s.id !== "sbir_gov");
  let htmlFound = 0;
  let htmlUpserted = 0;
  const sourceResults: string[] = [];

  for (const source of additionalSources) {
    try {
      logger.info(`[sbir-sttr] Fetching ${source.name} (${source.url})...`);

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
        logger.info(`[sbir-sttr] ${source.name}: HTTP ${res.status} — will still attempt to parse body`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        sourceResults.push(`${source.id}: BLOCKED (non-HTML)`);
        continue;
      }

      let html = await res.text();

      if (html.length < 500 || html.includes("JavaScript is required") || html.includes("enable JavaScript")) {
        const reason = html.length < 500 ? "minimal response" : "requires JavaScript";

        // Try Puppeteer fallback for known JS SPA sources
        if (JS_SBIR_SOURCES[source.id] && true /* Puppeteer always available */) {
          const sbUrl = JS_SBIR_SOURCES[source.id];
          logger.info(`[sbir-sttr] ${source.name}: ${reason}, trying Puppeteer for ${sbUrl}...`);
          try {
            html = await fetchWithPuppeteer(sbUrl);
            logger.info(`[sbir-sttr] ${source.name}: Puppeteer returned ${html.length} bytes`);
          } catch (sbErr) {
            const sbMsg = sbErr instanceof Error ? sbErr.message : String(sbErr);
            logger.info(`[sbir-sttr] ${source.name}: Puppeteer failed: ${sbMsg}`);
            await supabase.from("scraper_runs").insert({
              source: source.id,
              status: "error",
              opportunities_found: 0,
              matches_created: 0,
              error_message: `BLOCKED: ${reason} + Puppeteer failed: ${sbMsg}`,
              started_at: startedAt,
              completed_at: new Date().toISOString(),
            });
            sourceResults.push(`${source.id}: BLOCKED (${reason} + Puppeteer failed)`);
            continue;
          }
        } else {
          logger.info(`[sbir-sttr] ${source.name}: ${reason} BLOCKED`);
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

      // Extract solicitation links
      const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const solLinks: Array<{ text: string; href: string }> = [];
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const text = match[2].replace(/<[^>]+>/g, "").trim();
        if (
          text &&
          text.length > 5 &&
          text.length < 300 &&
          /sbir|sttr|solicit|topic|fund|grant|award|proposal/i.test(text + " " + match[1])
        ) {
          const href = match[1].startsWith("http")
            ? match[1]
            : (() => { try { return new URL(match[1], source.url).toString(); } catch { return match[1]; } })();
          solLinks.push({ text, href });
        }
      }

      if (solLinks.length === 0) {
        // Try Puppeteer fallback for known JS SPA sources with no parseable data
        if (JS_SBIR_SOURCES[source.id] && true /* Puppeteer always available */) {
          const sbUrl = JS_SBIR_SOURCES[source.id];
          logger.info(`[sbir-sttr] ${source.name}: No parseable data, trying Puppeteer for ${sbUrl}...`);
          try {
            html = await fetchWithPuppeteer(sbUrl, 5000);
            logger.info(`[sbir-sttr] ${source.name}: Puppeteer returned ${html.length} bytes`);
            // Re-parse rendered HTML for solicitation links
            const sbLinkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
            let sbMatch;
            while ((sbMatch = sbLinkRegex.exec(html)) !== null) {
              const text = sbMatch[2].replace(/<[^>]+>/g, "").trim();
              if (
                text &&
                text.length > 5 &&
                text.length < 300 &&
                /sbir|sttr|solicit|topic|fund|grant|award|proposal/i.test(text + " " + sbMatch[1])
              ) {
                const href = sbMatch[1].startsWith("http")
                  ? sbMatch[1]
                  : (() => { try { return new URL(sbMatch[1], source.url).toString(); } catch { return sbMatch[1]; } })();
                solLinks.push({ text, href });
              }
            }
          } catch (sbErr) {
            const sbMsg = sbErr instanceof Error ? sbErr.message : String(sbErr);
            logger.info(`[sbir-sttr] ${source.name}: Puppeteer failed: ${sbMsg}`);
          }
        }

        if (solLinks.length === 0) {
          logger.info(`[sbir-sttr] ${source.name}: No parseable solicitation data BLOCKED`);
          await supabase.from("scraper_runs").insert({
            source: source.id,
            status: "error",
            opportunities_found: 0,
            matches_created: 0,
            error_message: "BLOCKED: no parseable solicitation data in HTML",
            started_at: startedAt,
            completed_at: new Date().toISOString(),
          });
          sourceResults.push(`${source.id}: BLOCKED (no parseable data)`);
          continue;
        }
      }

      // Follow pagination to get ALL pages of results
      let totalPages = 1;
      {
        let currentHtml = html;
        let currentUrl = source.url;

        while (true) {
          const paginationUrls = followPagination(currentHtml, currentUrl);
          if (paginationUrls.length === 0) break;

          const urlToFetch = paginationUrls[0];
          if (!urlToFetch || urlToFetch === currentUrl) break;

          totalPages++;
          logger.info(`[sbir-sttr] ${source.name}: Fetching page ${totalPages} (${urlToFetch})...`);

          try {
            const isJsSource = !!JS_SBIR_SOURCES[source.id];
            let pageHtml: string;

            if (isJsSource && true /* Puppeteer always available */) {
              pageHtml = await fetchWithPuppeteer(urlToFetch, 5000);
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
                logger.info(`[sbir-sttr] ${source.name}: Page ${totalPages} returned HTTP ${pageRes.status}, stopping pagination`);
                break;
              }
              pageHtml = await pageRes.text();
            }

            if (pageHtml.length < 200) {
              logger.info(`[sbir-sttr] ${source.name}: Page ${totalPages} too small, stopping pagination`);
              break;
            }

            // Extract solicitation links from this page
            const pageLinkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
            let pageMatch;
            let newLinksCount = 0;
            while ((pageMatch = pageLinkRegex.exec(pageHtml)) !== null) {
              const text = pageMatch[2].replace(/<[^>]+>/g, "").trim();
              if (
                text &&
                text.length > 5 &&
                text.length < 300 &&
                /sbir|sttr|solicit|topic|fund|grant|award|proposal/i.test(text + " " + pageMatch[1])
              ) {
                const href = pageMatch[1].startsWith("http")
                  ? pageMatch[1]
                  : (() => { try { return new URL(pageMatch[1], source.url).toString(); } catch { return pageMatch[1]; } })();
                solLinks.push({ text, href });
                newLinksCount++;
              }
            }

            if (newLinksCount === 0) {
              logger.info(`[sbir-sttr] ${source.name}: Page ${totalPages} has no solicitation links, stopping pagination`);
              break;
            }

            logger.info(`[sbir-sttr] ${source.name}: Page ${totalPages} found ${newLinksCount} solicitation links`);
            currentHtml = pageHtml;
            currentUrl = urlToFetch;
          } catch (pageErr) {
            logger.info(`[sbir-sttr] ${source.name}: Page ${totalPages} error: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
            break;
          }
        }

        if (totalPages > 1) {
          logger.info(`[sbir-sttr] ${source.name}: Fetched ${totalPages} total pages`);
        }
      }

      let sourceOpps = 0;
      for (let i = 0; i < solLinks.length; i++) {
        const link = solLinks[i];
        const noticeId = `${source.id}-link-${i}-${Date.now()}`;
        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: noticeId,
            title: `[${source.name}] ${link.text.substring(0, 200)}`,
            agency: source.name,
            source: "sbir_sttr",
            source_url: link.href,
            description: link.text,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "notice_id" }
        );
        if (!error) {
          sourceOpps++;
          htmlUpserted++;
        }
      }

      htmlFound += sourceOpps;
      logger.info(`[sbir-sttr] ${source.name}: Found ${sourceOpps} items across ${totalPages} pages`);
      sourceResults.push(`${source.id}: ${sourceOpps} items`);
    } catch (srcErr) {
      const msg = srcErr instanceof Error ? srcErr.message : String(srcErr);
      const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
      logger.info(`[sbir-sttr] ${source.name}: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`);
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

  logger.info(`[sbir-sttr] Agency sources: ${sourceResults.join(", ")}`);

  // Log Puppeteer API usage for budget tracking
  await logPuppeteerUsage(supabase);

  return {
    source: "sbir_sttr",
    status: "success",
    opportunities_found: apiFound + htmlFound,
    matches_created: apiUpserted + htmlUpserted,
    error_message: apiFound + htmlFound === 0
      ? `Attempted SBIR API + ${additionalSources.length} agency sources. ${sourceResults.join("; ")}`
      : undefined,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
