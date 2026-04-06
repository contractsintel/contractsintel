import type { ScraperResult } from "./index";

const STATE_PORTALS = [
  { state: "AL", name: "Alabama", url: "https://purchasing.alabama.gov/" },
  { state: "AK", name: "Alaska", url: "https://iris-vss.state.ak.us/webapp/PRDVSS1X1/AltSelfService" },
  { state: "AZ", name: "Arizona", url: "https://spo.az.gov/" },
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
  { state: "NV", name: "Nevada", url: "https://nevadaepro.com/" },
  { state: "NH", name: "New Hampshire", url: "https://apps.das.nh.gov/bidscontracts/" },
  { state: "NJ", name: "New Jersey", url: "https://www.njstart.gov/" },
  { state: "NM", name: "New Mexico", url: "https://www.generalservices.state.nm.us/" },
  { state: "NY", name: "New York", url: "https://ogs.ny.gov/procurement" },
  { state: "NC", name: "North Carolina", url: "https://www.ips.state.nc.us/" },
  { state: "ND", name: "North Dakota", url: "https://www.nd.gov/omb/agency/procurement/" },
  { state: "OH", name: "Ohio", url: "https://procure.ohio.gov/" },
  { state: "OK", name: "Oklahoma", url: "https://oklahoma.gov/omes/services/purchasing.html" },
  { state: "OR", name: "Oregon", url: "https://orpin.oregon.gov/" },
  { state: "PA", name: "Pennsylvania", url: "https://www.emarketplace.state.pa.us/" },
  { state: "RI", name: "Rhode Island", url: "https://www.ridop.ri.gov/" },
  { state: "SC", name: "South Carolina", url: "https://procurement.sc.gov/" },
  { state: "SD", name: "South Dakota", url: "https://bop.sd.gov/" },
  { state: "TN", name: "Tennessee", url: "https://tn.gov/generalservices/procurement.html" },
  { state: "TX", name: "Texas", url: "https://www.txsmartbuy.com/" },
  { state: "UT", name: "Utah", url: "https://purchasing.utah.gov/" },
  { state: "VT", name: "Vermont", url: "https://bgs.vermont.gov/purchasing-contracting" },
  { state: "VA", name: "Virginia", url: "https://eva.virginia.gov/" },
  { state: "WA", name: "Washington", url: "https://fortress.wa.gov/ga/webs/" },
  { state: "WV", name: "West Virginia", url: "https://state.wv.gov/admin/purchase/" },
  { state: "WI", name: "Wisconsin", url: "https://vendornet.wi.gov/" },
  { state: "WY", name: "Wyoming", url: "https://sites.google.com/wyo.gov/procurement/" },
  { state: "DC", name: "District of Columbia", url: "https://ocp.dc.gov/" },
  { state: "PR", name: "Puerto Rico", url: "https://www.asg.pr.gov/" },
  { state: "GU", name: "Guam", url: "https://www.guamopa.com/" },
  { state: "VI", name: "US Virgin Islands", url: "https://dpp.vi.gov/" },
  { state: "AS", name: "American Samoa", url: "https://www.americansamoa.gov/procurement" },
];

export { STATE_PORTALS };

// Top 10 most accessible states to attempt scraping
const PRIORITY_STATES = ["CA", "TX", "NY", "FL", "VA", "OH", "IL", "PA", "GA", "NC"];

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

export async function scrapeStateLocal(supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    let totalFound = 0;
    let totalUpserted = 0;
    const stateResults: string[] = [];

    for (const stateCode of PRIORITY_STATES) {
      const portal = STATE_PORTALS.find((p) => p.state === stateCode);
      if (!portal) continue;

      try {
        console.log(`[state-local] Fetching ${portal.name} (${portal.url})...`);

        const res = await fetch(portal.url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; ContractsIntel/1.0)",
            Accept: "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });

        if (!res.ok) {
          console.log(`[state-local] ${portal.name}: HTTP ${res.status} BLOCKED`);
          stateResults.push(`${portal.state}: BLOCKED (HTTP ${res.status})`);
          continue;
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          console.log(`[state-local] ${portal.name}: Non-HTML response (${contentType}) BLOCKED`);
          stateResults.push(`${portal.state}: BLOCKED (non-HTML response)`);
          continue;
        }

        const html = await res.text();

        // Check for common JS-required indicators
        if (html.length < 500 || html.includes("JavaScript is required") || html.includes("enable JavaScript")) {
          console.log(`[state-local] ${portal.name}: Requires JavaScript BLOCKED`);
          stateResults.push(`${portal.state}: BLOCKED (requires JavaScript)`);
          continue;
        }

        // Try to find table rows with bid data
        const tableRows = extractTableRows(html);
        const bidLinks = extractLinks(html).filter(
          (l) =>
            /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.text) ||
            /bid|rfp|rfq|solicit|procurement|contract|itb|ifb/i.test(l.href)
        );

        const hasTableData = tableRows.length >= 3;
        const hasBidLinks = bidLinks.length >= 1;

        if (!hasTableData && !hasBidLinks) {
          console.log(`[state-local] ${portal.name}: No parseable bid data found BLOCKED`);
          stateResults.push(`${portal.state}: BLOCKED (no parseable bid data in HTML)`);
          continue;
        }

        // Extract opportunities from table rows or bid links
        let stateOpps = 0;

        if (hasTableData) {
          // Use table rows as opportunities
          for (let i = 0; i < Math.min(tableRows.length, 50); i++) {
            const row = tableRows[i];
            const noticeId = `state-${portal.state}-table-${i}-${Date.now()}`;
            const { error } = await supabase.from("opportunities").upsert(
              {
                notice_id: noticeId,
                title: `[${portal.state}] ${row.substring(0, 200)}`,
                agency: `${portal.name} State Procurement`,
                source: "state_local",
                source_url: portal.url,
                description: row,
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
          for (let i = 0; i < Math.min(bidLinks.length, 50); i++) {
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
                source: "state_local",
                source_url: fullUrl,
                description: link.text,
              },
              { onConflict: "notice_id" }
            );
            if (!error) {
              stateOpps++;
              totalUpserted++;
            }
          }
        }

        totalFound += stateOpps;
        console.log(`[state-local] ${portal.name}: Found ${stateOpps} items (${tableRows.length} table rows, ${bidLinks.length} bid links)`);
        stateResults.push(`${portal.state}: ${stateOpps} items found`);
      } catch (stateErr) {
        const msg = stateErr instanceof Error ? stateErr.message : String(stateErr);
        const isTimeout = msg.includes("abort") || msg.includes("timeout") || msg.includes("TimeoutError");
        console.log(`[state-local] ${portal.name}: ${isTimeout ? "TIMEOUT" : "ERROR"} - ${msg}`);
        stateResults.push(`${portal.state}: BLOCKED (${isTimeout ? "timeout" : msg.substring(0, 50)})`);
      }
    }

    console.log(`[state-local] Results: ${stateResults.join(", ")}`);

    return {
      source: "state_local",
      status: "success",
      opportunities_found: totalFound,
      matches_created: totalUpserted,
      error_message: totalFound === 0
        ? `Attempted ${PRIORITY_STATES.length} priority states. ${stateResults.join("; ")}`
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
