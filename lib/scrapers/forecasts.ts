import type { ScraperResult } from "./index";

const FORECAST_SOURCES = [
  { id: "fpds", name: "FPDS Reports", url: "https://www.fpds.gov/" },
  { id: "govtribe", name: "GovTribe (public data)", url: "https://govtribe.com/" },
  { id: "fsrs", name: "FSRS (Subaward Reporting)", url: "https://www.fsrs.gov/" },
  { id: "sam_forecasts", name: "SAM.gov Procurement Forecasts", url: "https://sam.gov/search?index=fpf" },
];

export { FORECAST_SOURCES };

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

export async function scrapeForecasts(supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  let totalFound = 0;
  let totalUpserted = 0;
  const sourceResults: string[] = [];

  for (const source of FORECAST_SOURCES) {
    try {
      console.log(`[forecasts] Fetching ${source.name} (${source.url})...`);

      const res = await fetch(source.url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ContractsIntel/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });

      if (!res.ok) {
        console.log(`[forecasts] ${source.name}: HTTP ${res.status} BLOCKED`);
        await supabase.from("scraper_runs").insert({
          source: source.id,
          status: "error",
          opportunities_found: 0,
          matches_created: 0,
          error_message: `BLOCKED: HTTP ${res.status}`,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
        sourceResults.push(`${source.id}: BLOCKED (HTTP ${res.status})`);
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        sourceResults.push(`${source.id}: BLOCKED (non-HTML)`);
        continue;
      }

      const html = await res.text();

      if (html.length < 500 || html.includes("JavaScript is required") || html.includes("enable JavaScript")) {
        const reason = html.length < 500 ? "minimal response" : "requires JavaScript";
        console.log(`[forecasts] ${source.name}: ${reason} BLOCKED`);
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

      // Look for procurement/forecast related links and tables
      const procLinks = extractLinks(html, source.url).filter(
        (l) =>
          /forecast|contract|award|solicit|bid|rfp|rfq|procurement|opportunity|subaward/i.test(l.text) ||
          /forecast|contract|award|solicit|bid|rfp|rfq|procurement|opportunity|subaward/i.test(l.href)
      );
      const tableRows = extractTableRows(html);
      const hasData = procLinks.length >= 1 || tableRows.length >= 3;

      if (!hasData) {
        console.log(`[forecasts] ${source.name}: No parseable forecast data BLOCKED`);
        await supabase.from("scraper_runs").insert({
          source: source.id,
          status: "error",
          opportunities_found: 0,
          matches_created: 0,
          error_message: "BLOCKED: no parseable forecast data in HTML",
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
        sourceResults.push(`${source.id}: BLOCKED (no parseable data)`);
        continue;
      }

      let sourceOpps = 0;

      for (let i = 0; i < Math.min(procLinks.length, 50); i++) {
        const link = procLinks[i];
        const noticeId = `forecast-${source.id}-link-${i}-${Date.now()}`;
        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: noticeId,
            title: `[${source.name}] ${link.text.substring(0, 200)}`,
            agency: source.name,
            source: "forecasts",
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
        const noticeId = `forecast-${source.id}-table-${i}-${Date.now()}`;
        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: noticeId,
            title: `[${source.name}] ${row.substring(0, 200)}`,
            agency: source.name,
            source: "forecasts",
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
      console.log(`[forecasts] ${source.name}: Found ${sourceOpps} items`);
      sourceResults.push(`${source.id}: ${sourceOpps} items`);
    } catch (srcErr) {
      const msg = srcErr instanceof Error ? srcErr.message : String(srcErr);
      const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
      console.log(`[forecasts] ${source.name}: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`);
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

  // FPDS Atom Feed scraping
  try {
    console.log(`[forecasts] Fetching FPDS Atom feed...`);

    const fpdsUrl = "https://www.fpds.gov/ezsearch/LATEST?s=FPDS&indexName=awardfull&q=&start=0&length=100";
    const fpdsRes = await fetch(fpdsUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ContractsIntel/1.0)",
        Accept: "application/atom+xml,application/xml,text/xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (fpdsRes.ok) {
      const xml = await fpdsRes.text();

      // Parse Atom <entry> elements
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
      let entryMatch;
      let fpdsFound = 0;

      while ((entryMatch = entryRegex.exec(xml)) !== null) {
        const entry = entryMatch[1];

        const getTag = (tag: string): string | null => {
          const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
          const m = re.exec(entry);
          return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : null;
        };

        const getLinkHref = (): string | null => {
          const linkRe = /<link[^>]+href="([^"]*)"[^>]*\/?>/i;
          const m = linkRe.exec(entry);
          return m ? m[1] : null;
        };

        const title = getTag("title") || "FPDS Contract Award";
        const link = getLinkHref() || "https://www.fpds.gov";
        const summary = getTag("summary") || getTag("content") || "";
        const published = getTag("published") || getTag("updated") || null;

        // Try to extract agency from the content/summary
        const agencyMatch = /(?:agency|department)\s*[:=]\s*([^<\n;]+)/i.exec(summary);
        const agency = agencyMatch ? agencyMatch[1].trim() : "Federal Agency (FPDS)";

        // Try to extract dollar value
        const valueMatch = /\$[\d,]+(?:\.\d{2})?/i.exec(summary);
        const rawValue = valueMatch ? parseFloat(valueMatch[0].replace(/[$,]/g, "")) : null;

        const noticeId = `fpds-feed-${Buffer.from(title + link).toString("base64").substring(0, 40)}`;

        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: noticeId,
            title: `[FPDS] ${title.substring(0, 200)}`,
            agency,
            source: "fpds_feed",
            source_url: link,
            description: summary.substring(0, 10000) || title,
            value_estimate: rawValue,
            posted_date: published,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "notice_id" }
        );

        if (!error) {
          fpdsFound++;
          totalUpserted++;
        }
      }

      totalFound += fpdsFound;
      console.log(`[forecasts] FPDS Atom feed: Found ${fpdsFound} entries`);
      sourceResults.push(`fpds_feed: ${fpdsFound} items`);
    } else {
      console.log(`[forecasts] FPDS Atom feed: HTTP ${fpdsRes.status}`);
      sourceResults.push(`fpds_feed: BLOCKED (HTTP ${fpdsRes.status})`);
    }
  } catch (fpdsErr) {
    const msg = fpdsErr instanceof Error ? fpdsErr.message : String(fpdsErr);
    const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
    console.log(`[forecasts] FPDS Atom feed: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`);
    sourceResults.push(`fpds_feed: BLOCKED (${isTimeout ? "timeout" : msg.substring(0, 50)})`);
  }

  console.log(`[forecasts] Results: ${sourceResults.join(", ")}`);

  return {
    source: "forecasts",
    status: "success",
    opportunities_found: totalFound,
    matches_created: totalUpserted,
    error_message: totalFound === 0
      ? `Attempted ${FORECAST_SOURCES.length + 1} forecast sources (incl. FPDS feed). ${sourceResults.join("; ")}`
      : undefined,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
