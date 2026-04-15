import { logger } from "@/lib/logger";
import type { ScraperResult } from "./index";
import type { SupabaseAdmin } from "./types";

const BASE_URL = "https://www.bidnetdirect.com";

// BidNet Direct state URL slugs → state codes
const BIDNET_STATES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new-hampshire": "NH",
  "new-jersey": "NJ",
  "new-mexico": "NM",
  "new-york": "NY",
  "north-carolina": "NC",
  "north-dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode-island": "RI",
  "south-carolina": "SC",
  "south-dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west-virginia": "WV",
  wisconsin: "WI",
  // MITN covers Michigan — map it to MI
  mitn: "MI",
};

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Max pages to scrape per state (25 bids/page typical, 10 pages = ~250 bids)
const MAX_PAGES_PER_STATE = 10;

interface BidListing {
  title: string;
  href: string;
  closingDate?: string;
  publishedDate?: string;
  agency?: string;
  description?: string;
}

function parseBidListings(html: string): BidListing[] {
  const bids: BidListing[] = [];
  const seen = new Set<string>();

  // Pattern 1: Links to solicitation abstract pages
  // URL pattern: /public/supplier/solicitations/statewide/{ID}/abstract?purchasingGroupId={PGID}&origin=1
  const linkRegex =
    /<a[^>]+href="([^"]*\/solicitations\/[^"]*\/abstract[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    if (title.length > 3 && !seen.has(href)) {
      seen.add(href);
      bids.push({ title, href });
    }
  }

  // Pattern 2: State-specific bid pages
  // URL pattern: /{state}/solicitations/open-bids/{title-slug}/{ID}?purchasingGroupId={PGID}&origin=1
  const stateLinksRegex =
    /<a[^>]+href="(\/[a-z-]+\/solicitations\/open-bids\/[^"]+\?purchasingGroupId=[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = stateLinksRegex.exec(html)) !== null) {
    const href = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    if (title.length > 3 && !seen.has(href)) {
      seen.add(href);
      bids.push({ title, href });
    }
  }

  // Pattern 3: Any remaining solicitation links with purchasingGroupId
  const pgIdLinksRegex =
    /<a[^>]+href="([^"]*purchasingGroupId=[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = pgIdLinksRegex.exec(html)) !== null) {
    const href = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    // Skip navigation links (open-bids, closed-bids tabs) and short titles
    if (title.length > 5 && !seen.has(href) && !href.includes("selectedContent=")) {
      seen.add(href);
      bids.push({ title, href });
    }
  }

  // Try to associate closing dates with bids by scanning table rows
  // (BidNet typically shows: Title | Published | Closing per row)
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const row = trMatch[1];
    // Find the link in this row
    const rowLinkMatch =
      /<a[^>]+href="([^"]*\/solicitations\/[^"]*\/abstract[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(
        row,
      );
    if (!rowLinkMatch) continue;

    const rowHref = rowLinkMatch[1];
    const bid = bids.find((b) => b.href === rowHref);
    if (!bid) continue;

    // Extract dates from this row
    const rowDates: string[] = [];
    const rowDateRegex = /(\d{2}\/\d{2}\/\d{4})/g;
    let rdMatch;
    while ((rdMatch = rowDateRegex.exec(row)) !== null) {
      rowDates.push(rdMatch[1]);
    }
    if (rowDates.length >= 2) {
      bid.publishedDate = rowDates[0];
      bid.closingDate = rowDates[1];
    } else if (rowDates.length === 1) {
      bid.closingDate = rowDates[0];
    }

    // Extract agency text from cells
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(row)) !== null) {
      const text = tdMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text) cells.push(text);
    }
    // Agency is typically in a cell that's not the title or date
    for (const cell of cells) {
      if (
        cell.length > 3 &&
        cell !== bid.title &&
        !/^\d{2}\/\d{2}\/\d{4}/.test(cell) &&
        !/page|sort|filter/i.test(cell)
      ) {
        bid.agency = cell;
        break;
      }
    }
  }

  return bids;
}

function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  // Convert MM/DD/YYYY to ISO
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return undefined;
}

async function scrapeStateBidNet(
  supabase: SupabaseAdmin,
  slug: string,
  stateCode: string,
): Promise<number> {
  let totalUpserted = 0;

  for (let page = 1; page <= MAX_PAGES_PER_STATE; page++) {
    const pageUrl =
      page === 1
        ? `${BASE_URL}/${slug}`
        : `${BASE_URL}/${slug}/solicitations/open-bids/page${page}`;

    try {
      const res = await fetch(pageUrl, {
        method: "GET",
        headers: HEADERS,
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });

      if (!res.ok) {
        if (page === 1) {
          logger.info(
            `[bidnet] ${stateCode}: HTTP ${res.status} on page 1, skipping`,
          );
        }
        break;
      }

      const html = await res.text();
      const bids = parseBidListings(html);

      if (bids.length === 0) {
        if (page === 1) {
          logger.info(`[bidnet] ${stateCode}: No bids found on page 1`);
        }
        break;
      }

      for (const bid of bids) {
        const fullUrl = bid.href.startsWith("http")
          ? bid.href
          : `${BASE_URL}${bid.href}`;

        const noticeId = `bidnet-${stateCode}-${bid.href.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 80)}`;

        const deadline = parseDate(bid.closingDate ?? "");
        const posted = parseDate(bid.publishedDate ?? "");

        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: noticeId,
            title: `[${stateCode}] ${bid.title.substring(0, 200)}`,
            agency: bid.agency || `${stateCode} State/Local Agency`,
            source: `state_${stateCode.toLowerCase()}`,
            source_url: fullUrl,
            description: bid.title,
            response_deadline: deadline || undefined,
            posted_date: posted || undefined,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "notice_id" },
        );

        if (!error) totalUpserted++;
      }

      logger.info(
        `[bidnet] ${stateCode}: Page ${page} → ${bids.length} bids (${totalUpserted} total upserted)`,
      );

      // If this page had fewer bids than expected, we're likely at the end
      if (bids.length < 10) break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("abort") || msg.includes("timeout");
      logger.info(
        `[bidnet] ${stateCode}: Page ${page} ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`,
      );
      break;
    }
  }

  return totalUpserted;
}

export async function scrapeBidNetDirect(
  supabase: SupabaseAdmin,
): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    let totalUpserted = 0;
    const stateResults: string[] = [];

    for (const [slug, stateCode] of Object.entries(BIDNET_STATES)) {
      const count = await scrapeStateBidNet(supabase, slug, stateCode);
      totalUpserted += count;
      stateResults.push(`${stateCode}: ${count}`);

      // Small delay between states to be respectful
      await new Promise((r) => setTimeout(r, 500));
    }

    logger.info(
      `[bidnet] Complete: ${totalUpserted} total across ${Object.keys(BIDNET_STATES).length} states`,
    );
    logger.info(`[bidnet] Per-state: ${stateResults.join(", ")}`);

    return {
      source: "bidnet_direct",
      status: "success",
      opportunities_found: totalUpserted,
      matches_created: totalUpserted,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      source: "bidnet_direct",
      status: "error",
      opportunities_found: 0,
      matches_created: 0,
      error_message: err instanceof Error ? err.message : String(err),
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }
}
