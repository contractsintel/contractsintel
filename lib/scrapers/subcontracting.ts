import { logger } from "@/lib/logger";
import type { ScraperResult } from "./index";
import type { SupabaseAdmin } from "./types";

const SUBCONTRACTING_SOURCES = [
  { id: "sba_subnet", name: "SBA SubNet", url: "https://eweb.sba.gov/subnet/" },
  { id: "gsa_subcontracting", name: "GSA Subcontracting Directory", url: "https://www.gsa.gov/small-business/subcontracting-opportunities/subcontracting-directory" },
];

export { SUBCONTRACTING_SOURCES };

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

export async function scrapeSubcontracting(supabase: SupabaseAdmin): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  let totalFound = 0;
  let totalUpserted = 0;
  const sourceResults: string[] = [];

  for (const source of SUBCONTRACTING_SOURCES) {
    try {
      logger.info(`[subcontracting] Fetching ${source.name} (${source.url})...`);

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
        logger.info(`[subcontracting] ${source.name}: HTTP ${res.status} — will still attempt to parse body`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        sourceResults.push(`${source.id}: BLOCKED (non-HTML)`);
        continue;
      }

      const html = await res.text();

      if (html.length < 500 || html.includes("JavaScript is required") || html.includes("enable JavaScript")) {
        const reason = html.length < 500 ? "minimal response" : "requires JavaScript";
        logger.info(`[subcontracting] ${source.name}: ${reason} BLOCKED`);
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

      // Look for subcontracting/procurement related links and tables
      const procLinks = extractLinks(html, source.url).filter(
        (l) =>
          /subcontract|bid|solicit|rfp|rfq|procurement|opportunity|contract|award|small.?business/i.test(l.text) ||
          /subcontract|bid|solicit|rfp|rfq|procurement|opportunity|contract|award/i.test(l.href)
      );
      const tableRows = extractTableRows(html);
      const hasData = procLinks.length >= 1 || tableRows.length >= 3;

      if (!hasData) {
        logger.info(`[subcontracting] ${source.name}: No parseable data BLOCKED`);
        await supabase.from("scraper_runs").insert({
          source: source.id,
          status: "error",
          opportunities_found: 0,
          matches_created: 0,
          error_message: "BLOCKED: no parseable subcontracting data in HTML",
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
        sourceResults.push(`${source.id}: BLOCKED (no parseable data)`);
        continue;
      }

      let sourceOpps = 0;

      for (let i = 0; i < Math.min(procLinks.length, 50); i++) {
        const link = procLinks[i];
        const noticeId = `subcontract-${source.id}-link-${i}-${Date.now()}`;
        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: noticeId,
            title: `[${source.name}] ${link.text.substring(0, 200)}`,
            agency: source.name,
            source: "subcontracting",
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

      for (let i = 0; i < Math.min(tableRows.length, 50); i++) {
        const row = tableRows[i];
        const noticeId = `subcontract-${source.id}-table-${i}-${Date.now()}`;
        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: noticeId,
            title: `[${source.name}] ${row.substring(0, 200)}`,
            agency: source.name,
            source: "subcontracting",
            source_url: source.url,
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
      logger.info(`[subcontracting] ${source.name}: Found ${sourceOpps} items`);
      sourceResults.push(`${source.id}: ${sourceOpps} items`);
    } catch (srcErr) {
      const msg = srcErr instanceof Error ? srcErr.message : String(srcErr);
      const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
      logger.info(`[subcontracting] ${source.name}: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`);
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

  logger.info(`[subcontracting] Results: ${sourceResults.join(", ")}`);

  return {
    source: "subcontracting",
    status: "success",
    opportunities_found: totalFound,
    matches_created: totalUpserted,
    error_message: totalFound === 0
      ? `Attempted ${SUBCONTRACTING_SOURCES.length} subcontracting sources. ${sourceResults.join("; ")}`
      : undefined,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
