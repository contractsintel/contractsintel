import { logger } from "@/lib/logger";
import type { ScraperResult } from "./index";
import type { SupabaseAdmin } from "./types";
import { fetchWithPuppeteer, logPuppeteerUsage } from "./puppeteer";
import {
  parseJaggaer,
  parseCaleProcure,
  parseMyFloridaMarketplace,
  parseTxSmartBuy,
  parsePennsylvania,
  parseWestVirginia,
  parseBidNetDirect,
  parseGenericSPA,
} from "./platform-parsers";

// States whose procurement portals are JS SPAs requiring browser rendering
const JS_STATES = new Set([
  "CA", "FL", "CO", "MD", "MI", "KY", "KS", "MO", "AK",
  "AZ", "NH", "DC", "TN", "AR", "NC", "MT", "SD", "HI",
  "AL", "NJ", "NV", "MA", "OR", "DE", "VI",
]);

// JS SPA URLs that differ from the default portal URL
const JS_STATE_URLS: Record<string, string> = {
  CA: "https://caleprocure.ca.gov/pages/public-search.aspx",
  FL: "https://vendor.myfloridamarketplace.com/search/bids",
  CO: "https://bid.coloradovsb.org/",
  MD: "https://emma.maryland.gov/page.aspx/en/rfp/request_browse_public",
  MI: "https://sigma.michigan.gov/",
  KY: "https://emars.ky.gov/",
  KS: "https://supplier.sok.ks.gov/psc/sokfssprd/SUPPLIER/ERP/h/?tab=SOK_EBID",
  MO: "https://missouribuys.mo.gov/",
  AK: "https://oppm.doa.alaska.gov/",
  AZ: "https://app.az.gov/",
  NH: "https://das.nh.gov/purchasing/bids/",
  DC: "https://contracts.ocp.dc.gov/solicitations/search",
  TN: "https://www.tn.gov/generalservices/procurement.html",
  AR: "https://arbuy.arkansas.gov/bso/view/search/external/advancedSearchBid.xhtml",
  NC: "https://eprocurement.nc.gov/",
  MT: "https://vendorportal.mt.gov/",
  SD: "https://bids.sd.gov/",
  HI: "https://hands.ehawaii.gov/hands/opportunities",
  AL: "https://alabamabuys.gov/page.aspx/en/rfp/request_browse_public",
  NJ: "https://www.njstart.gov/bso/view/search/external/advancedSearchBid.xhtml",
  NV: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml",
  MA: "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml",
  OR: "https://oregonbuys.gov/bso/view/search/external/advancedSearchBid.xhtml",
  DE: "https://mmp.delaware.gov/Bids/",
  VI: "https://gvibuy.buyspeed.com/bso/view/search/external/advancedSearchBid.xhtml",
};

// Platform-specific parsers — used for both JS SPA and non-JS states
const STATE_PARSERS: Record<string, (html: string) => any[]> = {
  // --- TIER 1: Known direct-link patterns ---
  TX: (html) => parseTxSmartBuy(html),
  PA: (html) => parsePennsylvania(html),
  WV: (html) => parseWestVirginia(html),
  ID: (html) => parseBidNetDirect(html),
  // --- Periscope S2G / BidSync states — same platform, same parser ---
  CA: (html) => parseCaleProcure(html),
  FL: (html) => parseMyFloridaMarketplace(html),
  MD: (html) => parseJaggaer(html, "MD", "https://emma.maryland.gov"),
  MI: (html) => parseJaggaer(html, "MI", "https://sigma.michigan.gov"),
  KY: (html) => parseJaggaer(html, "KY", "https://emars.ky.gov"),
  AK: (html) => parseGenericSPA(html, "https://oppm.doa.alaska.gov"),
  CO: (html) => parseJaggaer(html, "CO", "https://bid.coloradovsb.org"),
  AR: (html) => parseJaggaer(html, "AR", "https://arbuy.arkansas.gov"),
  NJ: (html) => parseJaggaer(html, "NJ", "https://www.njstart.gov"),
  NV: (html) => parseJaggaer(html, "NV", "https://nevadaepro.com"),
  MA: (html) => parseJaggaer(html, "MA", "https://www.commbuys.com"),
  OR: (html) => parseJaggaer(html, "OR", "https://oregonbuys.gov"),
  VI: (html) => parseJaggaer(html, "VI", "https://gvibuy.buyspeed.com"),
  SC: (html) => parseGenericSPA(html, "https://scbo.sc.gov"),
  // --- Infor/IonWave states ---
  AL: (html) => parseGenericSPA(html, "https://alabamabuys.gov"),
  AZ: (html) => parseGenericSPA(html, "https://app.az.gov"),
  // --- Other platforms ---
  VA: (html) => parseGenericSPA(html, "https://eva.virginia.gov"),
  GA: (html) => parseGenericSPA(html, "https://ssl.doas.state.ga.us"),
  IA: (html) => parseGenericSPA(html, "https://bidopportunities.iowa.gov"),
  LA: (html) => parseGenericSPA(html, "https://wwwcfprd.doa.louisiana.gov"),
  MS: (html) => parseGenericSPA(html, "https://www.ms.gov"),
  WI: (html) => parseGenericSPA(html, "https://vendornet.wi.gov"),
  WY: (html) => parseGenericSPA(html, "https://ai.wyo.gov"),
  KS: (html) => parseGenericSPA(html, "https://supplier.sok.ks.gov"),
  MO: (html) => parseGenericSPA(html, "https://missouribuys.mo.gov"),
  NH: (html) => parseGenericSPA(html, "https://das.nh.gov"),
  DC: (html) => parseGenericSPA(html, "https://contracts.ocp.dc.gov"),
  TN: (html) => parseGenericSPA(html, "https://www.tn.gov"),
  NC: (html) => parseGenericSPA(html, "https://eprocurement.nc.gov"),
  MT: (html) => parseGenericSPA(html, "https://vendorportal.mt.gov"),
  SD: (html) => parseGenericSPA(html, "https://bids.sd.gov"),
  HI: (html) => parseGenericSPA(html, "https://hands.ehawaii.gov"),
  DE: (html) => parseGenericSPA(html, "https://mmp.delaware.gov"),
  IN: (html) => parseGenericSPA(html, "https://www.in.gov"),
  PR: (html) => parseGenericSPA(html, "https://asg.pr.gov"),
};

const STATE_PORTALS = [
  // --- TIER 1: EASY — verified public access, direct links possible ---
  { state: "TX", name: "Texas", url: "https://www.txsmartbuy.gov/esbd" },
  { state: "PA", name: "Pennsylvania", url: "https://www.emarketplace.state.pa.us/Search.aspx" },
  { state: "WV", name: "West Virginia", url: "https://www.state.wv.us/admin/purchase/Bids/" },
  { state: "ID", name: "Idaho", url: "https://www.bidnetdirect.com/idaho" },
  { state: "IN", name: "Indiana", url: "https://www.in.gov/idoa/procurement/current-business-opportunities/" },
  { state: "PR", name: "Puerto Rico", url: "https://asg.pr.gov/indice" },

  // --- TIER 2: MEDIUM — public access, needs Playwright or AJAX handling ---
  { state: "VA", name: "Virginia", url: "https://eva.virginia.gov/" },
  { state: "OR", name: "Oregon", url: "https://oregonbuys.gov/" },
  { state: "DE", name: "Delaware", url: "https://mmp.delaware.gov/Bids/" },
  { state: "GA", name: "Georgia", url: "https://ssl.doas.state.ga.us/PRSapp/" },
  { state: "IA", name: "Iowa", url: "https://bidopportunities.iowa.gov/" },
  { state: "LA", name: "Louisiana", url: "https://wwwcfprd.doa.louisiana.gov/OSP/LaPAC/PubMain.cfm" },
  { state: "MS", name: "Mississippi", url: "https://www.ms.gov/dfa/contract_bid_search/" },
  { state: "WI", name: "Wisconsin", url: "https://vendornet.wi.gov/" },
  { state: "WY", name: "Wyoming", url: "https://ai.wyo.gov/divisions/general-services/purchasing" },
  { state: "SC", name: "South Carolina", url: "https://scbo.sc.gov/" },

  // --- TIER 3: HARD — captcha, login walls, SPAs ---
  { state: "AL", name: "Alabama", url: "https://alabamabuys.gov/" },
  { state: "AK", name: "Alaska", url: "https://oppm.doa.alaska.gov/" },
  { state: "AZ", name: "Arizona", url: "https://app.az.gov/" },
  { state: "AR", name: "Arkansas", url: "https://arbuy.arkansas.gov/bso/view/search/external/advancedSearchBid.xhtml" },
  { state: "CA", name: "California", url: "https://caleprocure.ca.gov/pages/public-search.aspx" },
  { state: "CO", name: "Colorado", url: "https://bid.coloradovsb.org/" },
  { state: "CT", name: "Connecticut", url: "https://biznet.ct.gov/SCP_Search/" },
  { state: "FL", name: "Florida", url: "https://vendor.myfloridamarketplace.com/" },
  { state: "HI", name: "Hawaii", url: "https://hands.ehawaii.gov/hands/opportunities" },
  { state: "IL", name: "Illinois", url: "https://www.bidbuy.illinois.gov/bso/" },
  { state: "KS", name: "Kansas", url: "https://supplier.sok.ks.gov/" },
  { state: "KY", name: "Kentucky", url: "https://emars.ky.gov/" },
  { state: "ME", name: "Maine", url: "https://www.maine.gov/purchases/" },
  { state: "MD", name: "Maryland", url: "https://emma.maryland.gov/" },
  { state: "MA", name: "Massachusetts", url: "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml" },
  { state: "MI", name: "Michigan", url: "https://sigma.michigan.gov/" },
  { state: "MN", name: "Minnesota", url: "https://mn.gov/admin/osp/" },
  { state: "MO", name: "Missouri", url: "https://missouribuys.mo.gov/" },
  { state: "MT", name: "Montana", url: "https://vendorportal.mt.gov/" },
  { state: "NE", name: "Nebraska", url: "https://das.nebraska.gov/materiel/bidopps.html" },
  { state: "NV", name: "Nevada", url: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml" },
  { state: "NH", name: "New Hampshire", url: "https://das.nh.gov/purchasing/bids/" },
  { state: "NJ", name: "New Jersey", url: "https://www.njstart.gov/" },
  { state: "NM", name: "New Mexico", url: "https://www.generalservices.state.nm.us/" },
  { state: "NY", name: "New York", url: "https://www.nyscr.ny.gov/home/contracts" },
  { state: "NC", name: "North Carolina", url: "https://eprocurement.nc.gov/" },
  { state: "ND", name: "North Dakota", url: "https://www.omb.nd.gov/ndbuys" },
  { state: "OH", name: "Ohio", url: "https://procure.ohio.gov/" },
  { state: "OK", name: "Oklahoma", url: "https://oklahoma.gov/omes/services/purchasing.html" },
  { state: "RI", name: "Rhode Island", url: "https://www.ridop.ri.gov/vendor-resources/all-solicitations" },
  { state: "SD", name: "South Dakota", url: "https://bids.sd.gov/" },
  { state: "TN", name: "Tennessee", url: "https://www.tn.gov/generalservices/procurement.html" },
  { state: "UT", name: "Utah", url: "https://bids.utah.gov/" },
  { state: "VT", name: "Vermont", url: "https://bgs.vermont.gov/purchasing/active-bids" },
  { state: "WA", name: "Washington", url: "https://pr-webs-vendor.des.wa.gov/Home/Opportunities" },
  { state: "DC", name: "District of Columbia", url: "https://contracts.ocp.dc.gov/solicitations/search" },
  { state: "GU", name: "Guam", url: "https://doa.guam.gov/procurement-policy-office/" },
  { state: "VI", name: "US Virgin Islands", url: "https://gvibuy.buyspeed.com/bso/view/search/external/advancedSearchBid.xhtml" },
  { state: "AS", name: "American Samoa", url: "https://www.americansamoa.gov/procurement" },
];

export { STATE_PORTALS };

// All states and territories to attempt scraping
const ALL_STATES = STATE_PORTALS.map((p) => p.state);

/**
 * Extract all next-page URLs from HTML pagination controls.
 * Works with common patterns: "Next" links, page=N params, numbered page links, etc.
 */
function followPagination(html: string, baseUrl: string): string[] {
  const nextUrls: string[] = [];
  const seen = new Set<string>();

  // Pattern 1: <a> tags with "next", "Next", ">", ">>" text or aria-label="next"
  const nextLinkRegex = /<a[^>]+href="([^"]*)"[^>]*>(?:[^<]*(?:next|Next|NEXT|›|&gt;|&raquo;|>>)[^<]*)<\/a>/gi;
  let m;
  while ((m = nextLinkRegex.exec(html)) !== null) {
    const href = m[1];
    if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
      try {
        const full = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
        if (!seen.has(full)) { seen.add(full); nextUrls.push(full); }
      } catch { /* skip invalid URLs */ }
    }
  }

  // Pattern 1b: aria-label="next" or rel="next"
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

  // Pattern 2: Numbered page links (page=2, page=3, p=2, start=20, offset=20, etc.)
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

/**
 * For Puppeteer JS states, extract pagination URLs from rendered HTML.
 * Returns page URLs found in pagination controls (page 2, 3, ... and Next).
 */
function extractPuppeteerPaginationUrls(html: string, baseUrl: string): string[] {
  // Use followPagination as the base, which finds next links and numbered page links
  return followPagination(html, baseUrl);
}

function extractTableRows(html: string): string[] {
  // Extract text content from <tr> elements
  const rows: string[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = trRegex.exec(html)) !== null) {
    // Extract text from <td> elements within each row
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(match[1])) !== null) {
      // Strip HTML tags from cell content
      const text = tdMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text) cells.push(text);
    }
    if (cells.length >= 2) {
      rows.push(cells.join(" | "));
    }
  }
  return rows;
}

function extractLinks(html: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text && text.length > 5 && text.length < 200) {
      links.push({ text, href: match[1] });
    }
  }
  return links;
}

// Extract <tr> rows containing procurement keywords
function extractBidTableRows(html: string): string[] {
  const rows: string[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const kwRegex = /\b(?:bid|solicitation|rfp|rfq|procurement)\b/i;
  let match;
  while ((match = trRegex.exec(html)) !== null) {
    const rowHtml = match[1];
    const rowText = rowHtml.replace(/<[^>]+>/g, " ").trim();
    if (kwRegex.test(rowText) && rowText.length > 10) {
      rows.push(rowText.replace(/\s+/g, " ").substring(0, 300));
    }
  }
  return rows;
}

// Extract <a> tags within <td> elements that link to bid detail pages
function extractTdLinks(html: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let tdMatch;
  while ((tdMatch = tdRegex.exec(html)) !== null) {
    let linkMatch;
    linkRegex.lastIndex = 0;
    while ((linkMatch = linkRegex.exec(tdMatch[1])) !== null) {
      const text = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      const href = linkMatch[1];
      if (text.length > 3 && text.length < 300 && /bid|solicit|rfp|rfq|detail|view|procurement/i.test(href + " " + text)) {
        links.push({ text, href });
      }
    }
  }
  return links;
}

// Extract <div> or <li> elements with class names containing bid-related terms
function extractBidElements(html: string): string[] {
  const items: string[] = [];
  const elRegex = /<(?:div|li)[^>]*class="[^"]*(?:bid|solicitation|listing|result)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li)>/gi;
  let match;
  while ((match = elRegex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, " ").trim().replace(/\s+/g, " ");
    if (text.length > 10 && text.length < 500) {
      items.push(text);
    }
  }
  return items;
}

// Nevada ePro specific parser - extracts bid listings from the advanced search results table
function extractNevadaEproBids(html: string): Array<{ title: string; href: string; refNumber: string }> {
  const bids: Array<{ title: string; href: string; refNumber: string }> = [];
  // Nevada ePro uses a data table with bid references. Look for rows with bid IDs/links.
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const row = trMatch[1];
    // Extract all links from this row
    const rowLinks: Array<{ text: string; href: string }> = [];
    const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let lm;
    while ((lm = linkRegex.exec(row)) !== null) {
      rowLinks.push({ text: lm[2].replace(/<[^>]+>/g, "").trim(), href: lm[1] });
    }
    // Extract all cell text
    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdM;
    while ((tdM = tdRegex.exec(row)) !== null) {
      cells.push(tdM[1].replace(/<[^>]+>/g, "").trim());
    }
    if (cells.length >= 2) {
      // Look for bid reference pattern (e.g., numbers, alphanumeric IDs)
      const refCell = cells.find((c) => /^[A-Z0-9][-A-Z0-9]{2,30}$/i.test(c));
      const titleCell = cells.find((c) => c.length > 15 && c !== refCell) || cells.join(" | ");
      const bidLink = rowLinks.find((l) => l.href.includes("bid") || l.href.includes("solicit") || l.href.includes("view"));
      if (titleCell || bidLink) {
        bids.push({
          title: bidLink?.text || titleCell || cells.join(" | "),
          href: bidLink?.href || "",
          refNumber: refCell || "",
        });
      }
    }
  }
  return bids;
}

export async function scrapeStateLocal(supabase: SupabaseAdmin): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    let totalFound = 0;
    let totalUpserted = 0;
    const stateResults: string[] = [];

    for (const stateCode of ALL_STATES) {
      const portal = STATE_PORTALS.find((p) => p.state === stateCode);
      if (!portal) continue;

      try {
        logger.info(`[state-local] Fetching ${portal.name} (${portal.url})...`);

        // AZ needs full browser headers to avoid 403
        const headers: Record<string, string> = portal.state === "AZ"
          ? {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
            }
          : {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml",
            };

        const res = await fetch(portal.url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });

        if (!res.ok) {
          logger.info(`[state-local] ${portal.name}: HTTP ${res.status} — will still attempt to parse body`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          logger.info(`[state-local] ${portal.name}: Non-HTML response (${contentType}) BLOCKED`);
          stateResults.push(`${portal.state}: BLOCKED (non-HTML response)`);
          continue;
        }

        let html = await res.text();

        // Check for common JS-required indicators
        const directFetchBlocked =
          html.length < 500 ||
          html.includes("JavaScript is required") ||
          html.includes("enable JavaScript");

        // For JS SPA states, try Puppeteer as fallback when direct fetch fails
        if (directFetchBlocked || (JS_STATES.has(portal.state) && html.length < 1000 && !/bid|solicit|rfp|rfq/i.test(html))) {
          if (JS_STATES.has(portal.state) && true /* Puppeteer always available */) {
            const sbUrl = JS_STATE_URLS[portal.state] || portal.url;
            logger.info(`[state-local] ${portal.name}: Direct fetch insufficient, trying Puppeteer for ${sbUrl}...`);
            try {
              html = await fetchWithPuppeteer(sbUrl, 5000);
              logger.info(`[state-local] ${portal.name}: Puppeteer returned ${html.length} bytes`);
            } catch (sbErr) {
              const sbMsg = sbErr instanceof Error ? sbErr.message : String(sbErr);
              logger.info(`[state-local] ${portal.name}: Puppeteer failed: ${sbMsg}`);
              stateResults.push(`${portal.state}: BLOCKED (Puppeteer fallback failed)`);
              continue;
            }
          } else if (directFetchBlocked) {
            logger.info(`[state-local] ${portal.name}: Requires JavaScript BLOCKED`);
            stateResults.push(`${portal.state}: BLOCKED (requires JavaScript)`);
            continue;
          }
        }

        // Collect all HTML pages (page 1 + pagination)
        const allHtmlPages: string[] = [html];

        // Follow pagination for non-JS states (free, direct fetch)
        if (!JS_STATES.has(portal.state)) {
          let currentHtml = html;
          let currentUrl = portal.url;
          let pageNum = 1;

          while (true) {
            const paginationUrls = followPagination(currentHtml, currentUrl);
            if (paginationUrls.length === 0) break;

            // For simplicity, just take the first pagination URL we find
            const urlToFetch = paginationUrls[0];
            if (!urlToFetch) break;

            // Avoid re-fetching the same page
            if (urlToFetch === currentUrl) break;

            pageNum++;
            logger.info(`[state-local] ${portal.name}: Fetching page ${pageNum} (${urlToFetch})...`);

            try {
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
                logger.info(`[state-local] ${portal.name}: Page ${pageNum} returned HTTP ${pageRes.status}, stopping pagination`);
                break;
              }

              const pageHtml = await pageRes.text();
              if (pageHtml.length < 200) {
                logger.info(`[state-local] ${portal.name}: Page ${pageNum} too small (${pageHtml.length} bytes), stopping pagination`);
                break;
              }

              // Check if this page has any new content (avoid infinite loops on duplicate pages)
              const newRows = extractTableRows(pageHtml);
              const newLinks = extractLinks(pageHtml).filter(
                (l) => /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.text) || /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.href)
              );

              if (newRows.length === 0 && newLinks.length === 0) {
                logger.info(`[state-local] ${portal.name}: Page ${pageNum} has no bid data, stopping pagination`);
                break;
              }

              logger.info(`[state-local] ${portal.name}: Page ${pageNum} has ${newRows.length} rows, ${newLinks.length} bid links`);
              allHtmlPages.push(pageHtml);
              currentHtml = pageHtml;
              currentUrl = urlToFetch;
            } catch (pageErr) {
              logger.info(`[state-local] ${portal.name}: Page ${pageNum} fetch error: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
              break;
            }
          }

          if (allHtmlPages.length > 1) {
            logger.info(`[state-local] ${portal.name}: Fetched ${allHtmlPages.length} total pages via free pagination`);
          }
        }

        // For JS states using Puppeteer, only follow pagination if page 1 had results (budget-conscious)
        if (JS_STATES.has(portal.state) && true /* Puppeteer always available */) {
          const page1Parser = STATE_PARSERS[portal.state];
          const page1Results = page1Parser ? page1Parser(html) : [];
          const page1BidLinks = extractLinks(html).filter(
            (l) => /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.text) || /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.href)
          );

          if (page1Results.length > 0 || page1BidLinks.length > 0) {
            const paginationUrls = extractPuppeteerPaginationUrls(html, JS_STATE_URLS[portal.state] || portal.url);
            if (paginationUrls.length > 0) {
              logger.info(`[state-local] ${portal.name}: Found ${paginationUrls.length} pagination URLs via Puppeteer, following...`);

              for (let pi = 0; pi < paginationUrls.length; pi++) {
                const pageUrl = paginationUrls[pi];
                const pageNum = pi + 2;
                logger.info(`[state-local] ${portal.name}: Puppeteer fetching page ${pageNum} (${pageUrl})...`);

                try {
                  const pageHtml = await fetchWithPuppeteer(pageUrl, 5000);
                  if (pageHtml.length < 200) {
                    logger.info(`[state-local] ${portal.name}: Puppeteer page ${pageNum} too small, stopping`);
                    break;
                  }
                  logger.info(`[state-local] ${portal.name}: Puppeteer page ${pageNum} returned ${pageHtml.length} bytes`);
                  allHtmlPages.push(pageHtml);

                  // Check for further pagination from this page
                  const morePaginationUrls = extractPuppeteerPaginationUrls(pageHtml, pageUrl);
                  for (const moreUrl of morePaginationUrls) {
                    if (!paginationUrls.includes(moreUrl)) {
                      paginationUrls.push(moreUrl);
                    }
                  }
                } catch (sbPageErr) {
                  logger.info(`[state-local] ${portal.name}: Puppeteer page ${pageNum} failed: ${sbPageErr instanceof Error ? sbPageErr.message : String(sbPageErr)}`);
                  break;
                }
              }
            }
          }
        }

        // Combine results from all pages
        // Use platform-specific parser if available for this state
        const platformParser = STATE_PARSERS[portal.state];
        const platformResults: Array<{title: string; url: string; agency?: string; deadline?: string; solicitation_number?: string}> = [];
        const tableRows: string[] = [];
        const bidLinks: Array<{ text: string; href: string }> = [];
        const bidTableRows: string[] = [];
        const tdLinks: Array<{ text: string; href: string }> = [];
        const bidElements: string[] = [];

        for (const pageHtml of allHtmlPages) {
          if (platformParser) {
            const parsed = platformParser(pageHtml);
            platformResults.push(...parsed);
          }

          tableRows.push(...extractTableRows(pageHtml));
          bidLinks.push(
            ...extractLinks(pageHtml).filter(
              (l) =>
                /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.text) ||
                /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.href)
            )
          );
          bidTableRows.push(...extractBidTableRows(pageHtml));
          tdLinks.push(...extractTdLinks(pageHtml));
          bidElements.push(...extractBidElements(pageHtml));
        }

        if (platformResults.length > 0) {
          logger.info(`[state-local] ${portal.name}: Platform parser found ${platformResults.length} results across ${allHtmlPages.length} pages`);
        }

        // FIX 4: Nevada ePro specific parsing (across all pages)
        const nevadaBids: Array<{ title: string; href: string; refNumber: string }> = [];
        if (portal.state === "NV") {
          for (const pageHtml of allHtmlPages) {
            nevadaBids.push(...extractNevadaEproBids(pageHtml));
          }
          logger.info(`[state-local] Nevada ePro: extracted ${nevadaBids.length} bid refs from ${allHtmlPages.length} pages`);
        }

        const hasPlatformResults = platformResults.length >= 1;
        const hasTableData = tableRows.length >= 3;
        const hasBidLinks = bidLinks.length >= 1;
        const hasBidTableRows = bidTableRows.length >= 1;
        const hasTdLinks = tdLinks.length >= 1;
        const hasBidElements = bidElements.length >= 1;
        const hasNevadaBids = nevadaBids.length >= 1;

        if (!hasPlatformResults && !hasTableData && !hasBidLinks && !hasBidTableRows && !hasTdLinks && !hasBidElements && !hasNevadaBids) {
          logger.info(`[state-local] ${portal.name}: No parseable bid data found BLOCKED`);
          stateResults.push(`${portal.state}: BLOCKED (no parseable bid data in HTML)`);
          continue;
        }

        // Extract opportunities from all sources
        let stateOpps = 0;

        // Helper: check if a URL is a real direct link (not the portal homepage)
        const isDirectLink = (url: string): boolean => {
          if (!url || !url.startsWith("http")) return false;
          // Reject URLs that are just the portal base URL (homepage = dead end)
          const portalBase = portal.url.replace(/\/+$/, "");
          const candidateBase = url.replace(/\/+$/, "");
          if (candidateBase === portalBase) return false;
          // Reject very short URLs that are likely just domain homepages
          try {
            const parsed = new URL(url);
            if (parsed.pathname === "/" || parsed.pathname === "") return false;
          } catch { return false; }
          return true;
        };

        // Helper: try to resolve a href into a full direct URL
        const resolveUrl = (href: string): string | null => {
          if (!href) return null;
          const full = href.startsWith("http") ? href : (() => {
            try { return new URL(href, portal.url).toString(); } catch { return null; }
          })();
          if (!full) return null;
          return isDirectLink(full) ? full : null;
        };

        // Upsert helper: only stores opportunities with verified direct links
        const upsertOpp = async (opts: {
          noticeId: string;
          title: string;
          agency?: string;
          solNumber?: string;
          deadline?: string;
          sourceUrl: string;
          description: string;
        }) => {
          const { error } = await supabase.from("opportunities").upsert(
            {
              notice_id: opts.noticeId,
              title: `[${portal.state}] ${opts.title.substring(0, 200)}`,
              agency: opts.agency || `${portal.name} State Procurement`,
              solicitation_number: opts.solNumber || undefined,
              response_deadline: opts.deadline || undefined,
              source: `state_${portal.state.toLowerCase()}`,
              source_url: opts.sourceUrl,
              description: opts.description,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "notice_id" }
          );
          if (!error) { stateOpps++; totalUpserted++; }
        };

        // Platform-specific parsed results (these already have URLs from parsed <a> tags)
        if (hasPlatformResults) {
          for (let i = 0; i < platformResults.length; i++) {
            const item = platformResults[i];
            const directUrl = resolveUrl(item.url);
            if (!directUrl) continue; // SKIP: no direct link = don't store dead-end
            const noticeId = `state-${portal.state}-platform-${i}-${Date.now()}`;
            await upsertOpp({
              noticeId,
              title: item.title,
              agency: item.agency,
              solNumber: item.solicitation_number,
              deadline: item.deadline,
              sourceUrl: directUrl,
              description: item.title,
            });
          }
        }

        // Nevada ePro specific bids
        if (hasNevadaBids) {
          for (let i = 0; i < nevadaBids.length; i++) {
            const bid = nevadaBids[i];
            const fullUrl = bid.href
              ? (bid.href.startsWith("http") ? bid.href : `https://nevadaepro.com${bid.href}`)
              : null;
            if (!fullUrl || !isDirectLink(fullUrl)) continue; // SKIP: no direct link
            const noticeId = `state-NV-epro-${bid.refNumber || i}-${Date.now()}`;
            await upsertOpp({
              noticeId,
              title: bid.title,
              agency: "Nevada State Procurement",
              solNumber: bid.refNumber,
              sourceUrl: fullUrl,
              description: bid.title,
            });
          }
        }

        // Bid links extracted from <a> tags — these have real hrefs
        if (hasBidLinks) {
          for (let i = 0; i < bidLinks.length; i++) {
            const link = bidLinks[i];
            const directUrl = resolveUrl(link.href);
            if (!directUrl) continue; // SKIP: no direct link
            const noticeId = `state-${portal.state}-link-${i}-${Date.now()}`;
            await upsertOpp({
              noticeId,
              title: link.text,
              sourceUrl: directUrl,
              description: link.text,
            });
          }
        }

        // Links inside <td> elements pointing to bid detail pages
        if (hasTdLinks) {
          for (let i = 0; i < tdLinks.length; i++) {
            const link = tdLinks[i];
            const directUrl = resolveUrl(link.href);
            if (!directUrl) continue; // SKIP: no direct link
            const noticeId = `state-${portal.state}-tdlink-${i}-${Date.now()}`;
            await upsertOpp({
              noticeId,
              title: link.text,
              sourceUrl: directUrl,
              description: link.text,
            });
          }
        }

        // REMOVED: table rows, bid table rows, and bid elements that stored portal.url
        // These created dead-end links. Only store opportunities with verified direct URLs.
        if (hasTableData && stateOpps === 0) {
          logger.info(`[state-local] ${portal.name}: Had ${tableRows.length} table rows but no direct links — skipping to avoid dead-end URLs`);
        }
        if (hasBidElements && stateOpps === 0) {
          logger.info(`[state-local] ${portal.name}: Had ${bidElements.length} bid elements but no direct links — skipping`);
        }

        totalFound += stateOpps;
        logger.info(`[state-local] ${portal.name}: Found ${stateOpps} items across ${allHtmlPages.length} pages (${tableRows.length} table rows, ${bidLinks.length} bid links, ${bidTableRows.length} kw rows, ${tdLinks.length} td links, ${bidElements.length} bid elements${nevadaBids.length ? `, ${nevadaBids.length} NV ePro bids` : ""})`);
        stateResults.push(`${portal.state}: ${stateOpps} items found`);
      } catch (stateErr) {
        const msg = stateErr instanceof Error ? stateErr.message : String(stateErr);
        const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
        logger.info(`[state-local] ${portal.name}: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`);
        stateResults.push(`${portal.state}: BLOCKED (${isTimeout ? "timeout" : msg.substring(0, 50)})`);
      }
    }

    logger.info(`[state-local] Results: ${stateResults.join(", ")}`);

    // Log Puppeteer API usage for budget tracking
    await logPuppeteerUsage(supabase);

    return {
      source: "state_local",
      status: "success",
      opportunities_found: totalFound,
      matches_created: totalUpserted,
      error_message: totalFound === 0
        ? `Attempted ${ALL_STATES.length} priority states. ${stateResults.join("; ")}`
        : undefined,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      source: "state_local",
      status: "error",
      opportunities_found: 0,
      matches_created: 0,
      error_message: err instanceof Error ? err.message : String(err),
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }
}
