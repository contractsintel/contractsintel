import type { ScraperResult } from "./index";
import { fetchWithPuppeteer, logPuppeteerUsage } from "./puppeteer";
import {
  parseJaggaer,
  parseCaleProcure,
  parseMyFloridaMarketplace,
  parseTxSmartBuy,
  parseGenericSPA,
} from "./platform-parsers";

// States whose procurement portals are JS SPAs requiring browser rendering
const JS_STATES = new Set([
  "CA", "TX", "FL", "CO", "MD", "MI", "KY", "KS", "MO", "AK",
  "AZ", "NH", "DC", "TN", "AR", "NC", "LA", "MT", "PR", "SD", "WV", "HI",
]);

// JS SPA URLs that differ from the default portal URL
const JS_STATE_URLS: Record<string, string> = {
  CA: "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx",
  TX: "https://www.txsmartbuy.com/sp",
  FL: "https://vendor.myfloridamarketplace.com/search/bids",
  CO: "https://bids.coloradovssc.com/",
  MD: "https://emaryland.buyspeed.com/bso/view/search/external/advancedSearchBid.xhtml",
  MI: "https://sigma.michigan.gov/webapp/PRDVSS2X1/AltSelfService",
  KY: "https://emars.ky.gov/online/vss/AltSelfService",
  KS: "https://supplier.sok.ks.gov/psc/sokfssprd/SUPPLIER/ERP/h/?tab=SOK_EBID",
  MO: "https://www.moolb.mo.gov/MOSCEnterprise/solicitationSearch.html",
  AK: "https://iris-vss.state.ak.us/webapp/PRDVSS1X1/AltSelfService",
  AZ: "https://spo.az.gov/contracts-and-solicitations",
  NH: "https://apps.das.nh.gov/bidscontracts/",
  DC: "https://ocp.dc.gov/page/solicitations",
  TN: "https://tn.gov/generalservices/procurement/central-procurement-office--cpo-/solicitations.html",
  AR: "https://www.arkansas.gov/dfa/procurement/",
  NC: "https://www.ips.state.nc.us/",
  LA: "https://wwwprd.doa.louisiana.gov/osp/lapac/pubmain.asp",
  MT: "https://svc.mt.gov/gsd/OneStop/",
  PR: "https://www.asg.pr.gov/",
  SD: "https://bop.sd.gov/",
  WV: "https://state.wv.gov/admin/purchase/",
  HI: "https://hands.hawaii.gov/",
};

// Platform-specific parsers for JS SPA states
const STATE_PARSERS: Record<string, (html: string) => any[]> = {
  CA: (html) => parseCaleProcure(html),
  TX: (html) => parseTxSmartBuy(html),
  FL: (html) => parseMyFloridaMarketplace(html),
  MD: (html) => parseJaggaer(html, "MD", "https://emaryland.buyspeed.com"),
  MI: (html) => parseJaggaer(html, "MI", "https://sigma.michigan.gov"),
  KY: (html) => parseJaggaer(html, "KY", "https://emars.ky.gov"),
  AK: (html) => parseJaggaer(html, "AK", "https://iris-vss.state.ak.us"),
  CO: (html) => parseJaggaer(html, "CO", "https://bids.coloradovssc.com"),
  KS: (html) => parseGenericSPA(html, "https://supplier.sok.ks.gov"),
  MO: (html) => parseGenericSPA(html, "https://www.moolb.mo.gov"),
  AZ: (html) => parseGenericSPA(html, "https://spo.az.gov"),
  NH: (html) => parseGenericSPA(html, "https://apps.das.nh.gov"),
  DC: (html) => parseGenericSPA(html, "https://ocp.dc.gov"),
  TN: (html) => parseGenericSPA(html, "https://tn.gov"),
  AR: (html) => parseGenericSPA(html, "https://www.arkansas.gov"),
  NC: (html) => parseGenericSPA(html, "https://www.ips.state.nc.us"),
  LA: (html) => parseGenericSPA(html, "https://wwwprd.doa.louisiana.gov"),
  MT: (html) => parseGenericSPA(html, "https://svc.mt.gov"),
  PR: (html) => parseGenericSPA(html, "https://www.asg.pr.gov"),
  SD: (html) => parseGenericSPA(html, "https://bop.sd.gov"),
  WV: (html) => parseGenericSPA(html, "https://state.wv.gov"),
  HI: (html) => parseGenericSPA(html, "https://hands.hawaii.gov"),
};

const STATE_PORTALS = [
  { state: "AL", name: "Alabama", url: "https://purchasing.alabama.gov/" },
  { state: "AK", name: "Alaska", url: "https://iris-vss.state.ak.us/webapp/PRDVSS1X1/AltSelfService" },
  { state: "AZ", name: "Arizona", url: "https://spo.az.gov/contracts-and-solicitations" },
  { state: "AR", name: "Arkansas", url: "https://www.arkansas.gov/dfa/procurement/" },
  { state: "CA", name: "California", url: "https://caleprocure.ca.gov/" },
  { state: "CO", name: "Colorado", url: "https://bids.coloradovssc.com/" },
  { state: "CT", name: "Connecticut", url: "https://portal.ct.gov/DAS/Procurement/" },
  { state: "DE", name: "Delaware", url: "https://contracts.delaware.gov/" },
  { state: "FL", name: "Florida", url: "https://vendor.myfloridamarketplace.com/" },
  { state: "GA", name: "Georgia", url: "https://ssl.doas.state.ga.us/gpr/" },
  { state: "HI", name: "Hawaii", url: "https://hands.hawaii.gov/" },
  { state: "ID", name: "Idaho", url: "https://purchasing.idaho.gov/" },
  { state: "IL", name: "Illinois", url: "https://www.bidbuy.illinois.gov/" },
  { state: "IN", name: "Indiana", url: "https://www.in.gov/idoa/procurement/" },
  { state: "IA", name: "Iowa", url: "https://bidopportunities.iowa.gov/" },
  { state: "KS", name: "Kansas", url: "https://supplier.sok.ks.gov/" },
  { state: "KY", name: "Kentucky", url: "https://emars.ky.gov/" },
  { state: "LA", name: "Louisiana", url: "https://wwwprd.doa.louisiana.gov/osp/lapac/pubmain.asp" },
  { state: "ME", name: "Maine", url: "https://www.maine.gov/purchases/" },
  { state: "MD", name: "Maryland", url: "https://emaryland.buyspeed.com/" },
  { state: "MA", name: "Massachusetts", url: "https://www.commbuys.com/" },
  { state: "MI", name: "Michigan", url: "https://sigma.michigan.gov/" },
  { state: "MN", name: "Minnesota", url: "https://mn.gov/admin/osp/" },
  { state: "MS", name: "Mississippi", url: "https://www.ms.gov/dfa/contract_bid_search/" },
  { state: "MO", name: "Missouri", url: "https://www.moolb.mo.gov/" },
  { state: "MT", name: "Montana", url: "https://svc.mt.gov/gsd/OneStop/" },
  { state: "NE", name: "Nebraska", url: "https://das.nebraska.gov/materiel/purchasing.html" },
  { state: "NV", name: "Nevada", url: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml" },
  { state: "NH", name: "New Hampshire", url: "https://apps.das.nh.gov/bidscontracts/" },
  { state: "NJ", name: "New Jersey", url: "https://www.njstart.gov/" },
  { state: "NM", name: "New Mexico", url: "https://www.generalservices.state.nm.us/" },
  { state: "NY", name: "New York", url: "https://ogs.ny.gov/procurement" },
  { state: "NC", name: "North Carolina", url: "https://www.ips.state.nc.us/" },
  { state: "ND", name: "North Dakota", url: "https://www.nd.gov/omb/agency/procurement/" },
  { state: "OH", name: "Ohio", url: "https://procure.ohio.gov/" },
  { state: "OK", name: "Oklahoma", url: "https://oklahoma.gov/omes/services/purchasing.html" },
  { state: "OR", name: "Oregon", url: "https://orpin.oregon.gov/open.dll/welcome" },
  { state: "PA", name: "Pennsylvania", url: "https://www.emarketplace.state.pa.us/" },
  { state: "RI", name: "Rhode Island", url: "https://www.ridop.ri.gov/" },
  { state: "SC", name: "South Carolina", url: "https://procurement.sc.gov/" },
  { state: "SD", name: "South Dakota", url: "https://bop.sd.gov/" },
  { state: "TN", name: "Tennessee", url: "https://tn.gov/generalservices/procurement/central-procurement-office--cpo-/solicitations.html" },
  { state: "TX", name: "Texas", url: "https://www.txsmartbuy.com/" },
  { state: "UT", name: "Utah", url: "https://purchasing.utah.gov/" },
  { state: "VT", name: "Vermont", url: "https://bgs.vermont.gov/purchasing-contracting" },
  { state: "VA", name: "Virginia", url: "https://eva.virginia.gov/" },
  { state: "WA", name: "Washington", url: "https://fortress.wa.gov/ga/webs/" },
  { state: "WV", name: "West Virginia", url: "https://state.wv.gov/admin/purchase/" },
  { state: "WI", name: "Wisconsin", url: "https://vendornet.wi.gov/" },
  { state: "WY", name: "Wyoming", url: "https://sites.google.com/wyo.gov/procurement/" },
  { state: "DC", name: "District of Columbia", url: "https://ocp.dc.gov/page/solicitations" },
  { state: "PR", name: "Puerto Rico", url: "https://www.asg.pr.gov/" },
  { state: "GU", name: "Guam", url: "https://www.guamopa.com/" },
  { state: "VI", name: "US Virgin Islands", url: "https://dpp.vi.gov/" },
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

export async function scrapeStateLocal(supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    let totalFound = 0;
    let totalUpserted = 0;
    const stateResults: string[] = [];

    for (const stateCode of ALL_STATES) {
      const portal = STATE_PORTALS.find((p) => p.state === stateCode);
      if (!portal) continue;

      try {
        console.log(`[state-local] Fetching ${portal.name} (${portal.url})...`);

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
          console.log(`[state-local] ${portal.name}: HTTP ${res.status} — will still attempt to parse body`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          console.log(`[state-local] ${portal.name}: Non-HTML response (${contentType}) BLOCKED`);
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
            console.log(`[state-local] ${portal.name}: Direct fetch insufficient, trying Puppeteer for ${sbUrl}...`);
            try {
              html = await fetchWithPuppeteer(sbUrl, 5000);
              console.log(`[state-local] ${portal.name}: Puppeteer returned ${html.length} bytes`);
            } catch (sbErr) {
              const sbMsg = sbErr instanceof Error ? sbErr.message : String(sbErr);
              console.log(`[state-local] ${portal.name}: Puppeteer failed: ${sbMsg}`);
              stateResults.push(`${portal.state}: BLOCKED (Puppeteer fallback failed)`);
              continue;
            }
          } else if (directFetchBlocked) {
            console.log(`[state-local] ${portal.name}: Requires JavaScript BLOCKED`);
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
            console.log(`[state-local] ${portal.name}: Fetching page ${pageNum} (${urlToFetch})...`);

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
                console.log(`[state-local] ${portal.name}: Page ${pageNum} returned HTTP ${pageRes.status}, stopping pagination`);
                break;
              }

              const pageHtml = await pageRes.text();
              if (pageHtml.length < 200) {
                console.log(`[state-local] ${portal.name}: Page ${pageNum} too small (${pageHtml.length} bytes), stopping pagination`);
                break;
              }

              // Check if this page has any new content (avoid infinite loops on duplicate pages)
              const newRows = extractTableRows(pageHtml);
              const newLinks = extractLinks(pageHtml).filter(
                (l) => /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.text) || /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.href)
              );

              if (newRows.length === 0 && newLinks.length === 0) {
                console.log(`[state-local] ${portal.name}: Page ${pageNum} has no bid data, stopping pagination`);
                break;
              }

              console.log(`[state-local] ${portal.name}: Page ${pageNum} has ${newRows.length} rows, ${newLinks.length} bid links`);
              allHtmlPages.push(pageHtml);
              currentHtml = pageHtml;
              currentUrl = urlToFetch;
            } catch (pageErr) {
              console.log(`[state-local] ${portal.name}: Page ${pageNum} fetch error: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
              break;
            }
          }

          if (allHtmlPages.length > 1) {
            console.log(`[state-local] ${portal.name}: Fetched ${allHtmlPages.length} total pages via free pagination`);
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
              console.log(`[state-local] ${portal.name}: Found ${paginationUrls.length} pagination URLs via Puppeteer, following...`);

              for (let pi = 0; pi < paginationUrls.length; pi++) {
                const pageUrl = paginationUrls[pi];
                const pageNum = pi + 2;
                console.log(`[state-local] ${portal.name}: Puppeteer fetching page ${pageNum} (${pageUrl})...`);

                try {
                  const pageHtml = await fetchWithPuppeteer(pageUrl, 5000);
                  if (pageHtml.length < 200) {
                    console.log(`[state-local] ${portal.name}: Puppeteer page ${pageNum} too small, stopping`);
                    break;
                  }
                  console.log(`[state-local] ${portal.name}: Puppeteer page ${pageNum} returned ${pageHtml.length} bytes`);
                  allHtmlPages.push(pageHtml);

                  // Check for further pagination from this page
                  const morePaginationUrls = extractPuppeteerPaginationUrls(pageHtml, pageUrl);
                  for (const moreUrl of morePaginationUrls) {
                    if (!paginationUrls.includes(moreUrl)) {
                      paginationUrls.push(moreUrl);
                    }
                  }
                } catch (sbPageErr) {
                  console.log(`[state-local] ${portal.name}: Puppeteer page ${pageNum} failed: ${sbPageErr instanceof Error ? sbPageErr.message : String(sbPageErr)}`);
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
          console.log(`[state-local] ${portal.name}: Platform parser found ${platformResults.length} results across ${allHtmlPages.length} pages`);
        }

        // FIX 4: Nevada ePro specific parsing (across all pages)
        const nevadaBids: Array<{ title: string; href: string; refNumber: string }> = [];
        if (portal.state === "NV") {
          for (const pageHtml of allHtmlPages) {
            nevadaBids.push(...extractNevadaEproBids(pageHtml));
          }
          console.log(`[state-local] Nevada ePro: extracted ${nevadaBids.length} bid refs from ${allHtmlPages.length} pages`);
        }

        const hasPlatformResults = platformResults.length >= 1;
        const hasTableData = tableRows.length >= 3;
        const hasBidLinks = bidLinks.length >= 1;
        const hasBidTableRows = bidTableRows.length >= 1;
        const hasTdLinks = tdLinks.length >= 1;
        const hasBidElements = bidElements.length >= 1;
        const hasNevadaBids = nevadaBids.length >= 1;

        if (!hasPlatformResults && !hasTableData && !hasBidLinks && !hasBidTableRows && !hasTdLinks && !hasBidElements && !hasNevadaBids) {
          console.log(`[state-local] ${portal.name}: No parseable bid data found BLOCKED`);
          stateResults.push(`${portal.state}: BLOCKED (no parseable bid data in HTML)`);
          continue;
        }

        // Extract opportunities from all sources
        let stateOpps = 0;

        // Platform-specific parsed results
        if (hasPlatformResults) {
          for (let i = 0; i < platformResults.length; i++) {
            const item = platformResults[i];
            const noticeId = `state-${portal.state}-platform-${i}-${Date.now()}`;
            const { error } = await supabase.from("opportunities").upsert(
              {
                notice_id: noticeId,
                title: `[${portal.state}] ${item.title.substring(0, 200)}`,
                agency: item.agency || `${portal.name} State Procurement`,
                solicitation_number: item.solicitation_number || undefined,
                response_deadline: item.deadline || undefined,
                source: `state_${portal.state.toLowerCase()}`,
                source_url: item.url,
                description: item.title,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "notice_id" }
            );
            if (!error) { stateOpps++; totalUpserted++; }
          }
        }

        // Nevada ePro specific bids
        if (hasNevadaBids) {
          for (let i = 0; i < nevadaBids.length; i++) {
            const bid = nevadaBids[i];
            const noticeId = `state-NV-epro-${bid.refNumber || i}-${Date.now()}`;
            const fullUrl = bid.href
              ? (bid.href.startsWith("http") ? bid.href : `https://nevadaepro.com${bid.href}`)
              : portal.url;
            const { error } = await supabase.from("opportunities").upsert(
              {
                notice_id: noticeId,
                title: `[NV] ${bid.title.substring(0, 200)}`,
                agency: "Nevada State Procurement",
                solicitation_number: bid.refNumber || undefined,
                source: `state_${portal.state.toLowerCase()}`,
                source_url: fullUrl,
                description: bid.title,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "notice_id" }
            );
            if (!error) { stateOpps++; totalUpserted++; }
          }
        }

        if (hasTableData) {
          // Use table rows as opportunities
          for (let i = 0; i < tableRows.length; i++) {
            const row = tableRows[i];
            const noticeId = `state-${portal.state}-table-${i}-${Date.now()}`;
            const { error } = await supabase.from("opportunities").upsert(
              {
                notice_id: noticeId,
                title: `[${portal.state}] ${row.substring(0, 200)}`,
                agency: `${portal.name} State Procurement`,
                source: `state_${portal.state.toLowerCase()}`,
                source_url: portal.url,
                description: row,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "notice_id" }
            );
            if (!error) {
              stateOpps++;
              totalUpserted++;
            }
          }
        }

        if (hasBidLinks) {
          for (let i = 0; i < bidLinks.length; i++) {
            const link = bidLinks[i];
            const noticeId = `state-${portal.state}-link-${i}-${Date.now()}`;
            const fullUrl = link.href.startsWith("http")
              ? link.href
              : new URL(link.href, portal.url).toString();

            const { error } = await supabase.from("opportunities").upsert(
              {
                notice_id: noticeId,
                title: `[${portal.state}] ${link.text.substring(0, 200)}`,
                agency: `${portal.name} State Procurement`,
                source: `state_${portal.state.toLowerCase()}`,
                source_url: fullUrl,
                description: link.text,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "notice_id" }
            );
            if (!error) {
              stateOpps++;
              totalUpserted++;
            }
          }
        }

        // FIX 5: Broader parsing - keyword-matching table rows
        if (hasBidTableRows) {
          for (let i = 0; i < bidTableRows.length; i++) {
            const row = bidTableRows[i];
            const noticeId = `state-${portal.state}-bidrow-${i}-${Date.now()}`;
            const { error } = await supabase.from("opportunities").upsert(
              {
                notice_id: noticeId,
                title: `[${portal.state}] ${row.substring(0, 200)}`,
                agency: `${portal.name} State Procurement`,
                source: `state_${portal.state.toLowerCase()}`,
                source_url: portal.url,
                description: row,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "notice_id" }
            );
            if (!error) { stateOpps++; totalUpserted++; }
          }
        }

        // FIX 5: Links inside <td> elements pointing to bid detail pages
        if (hasTdLinks) {
          for (let i = 0; i < tdLinks.length; i++) {
            const link = tdLinks[i];
            const noticeId = `state-${portal.state}-tdlink-${i}-${Date.now()}`;
            const fullUrl = link.href.startsWith("http")
              ? link.href
              : new URL(link.href, portal.url).toString();
            const { error } = await supabase.from("opportunities").upsert(
              {
                notice_id: noticeId,
                title: `[${portal.state}] ${link.text.substring(0, 200)}`,
                agency: `${portal.name} State Procurement`,
                source: `state_${portal.state.toLowerCase()}`,
                source_url: fullUrl,
                description: link.text,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "notice_id" }
            );
            if (!error) { stateOpps++; totalUpserted++; }
          }
        }

        // FIX 5: Div/li elements with bid-related class names
        if (hasBidElements) {
          for (let i = 0; i < bidElements.length; i++) {
            const elem = bidElements[i];
            const noticeId = `state-${portal.state}-bidel-${i}-${Date.now()}`;
            const { error } = await supabase.from("opportunities").upsert(
              {
                notice_id: noticeId,
                title: `[${portal.state}] ${elem.substring(0, 200)}`,
                agency: `${portal.name} State Procurement`,
                source: `state_${portal.state.toLowerCase()}`,
                source_url: portal.url,
                description: elem,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "notice_id" }
            );
            if (!error) { stateOpps++; totalUpserted++; }
          }
        }

        totalFound += stateOpps;
        console.log(`[state-local] ${portal.name}: Found ${stateOpps} items across ${allHtmlPages.length} pages (${tableRows.length} table rows, ${bidLinks.length} bid links, ${bidTableRows.length} kw rows, ${tdLinks.length} td links, ${bidElements.length} bid elements${nevadaBids.length ? `, ${nevadaBids.length} NV ePro bids` : ""})`);
        stateResults.push(`${portal.state}: ${stateOpps} items found`);
      } catch (stateErr) {
        const msg = stateErr instanceof Error ? stateErr.message : String(stateErr);
        const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
        console.log(`[state-local] ${portal.name}: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`);
        stateResults.push(`${portal.state}: BLOCKED (${isTimeout ? "timeout" : msg.substring(0, 50)})`);
      }
    }

    console.log(`[state-local] Results: ${stateResults.join(", ")}`);

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
