// Each parser takes rendered HTML and returns an array of {title, url, agency?, deadline?, solicitation_number?}

export function parseJaggaer(html: string, state: string, baseUrl: string): Array<{title: string; url: string; agency?: string; deadline?: string; solicitation_number?: string}> {
  // Jaggaer/BuySpeed platforms (MD, MI, KY, AK, CO)
  // Look for: <table> with bid data, <tr> rows with solicitation info
  // Common patterns: class="evenRow"/"oddRow", data-bid-id, td with links to bid details
  // Also look for: div.searchResultRow, span.bidTitle, a[href*="bidDetail"]
  const results: Array<{title: string; url: string; agency?: string; deadline?: string; solicitation_number?: string}> = [];

  // Pattern 1: Table rows with alternating classes
  const rowRegex = /<tr[^>]*(?:evenRow|oddRow|data-row|result)[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const row = match[1];
    const titleMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (titleMatch) {
      const href = titleMatch[1].startsWith("http") ? titleMatch[1] : `${baseUrl}${titleMatch[1]}`;
      const title = titleMatch[2].replace(/<[^>]+>/g, "").trim();
      if (title.length > 5) results.push({ title, url: href });
    }
  }

  // Pattern 2: Search result divs
  const divRegex = /<div[^>]*(?:search-result|bid-item|solicitation)[^>]*>([\s\S]*?)<\/div>/gi;
  while ((match = divRegex.exec(html)) !== null) {
    const div = match[1];
    const linkMatch = div.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (linkMatch) {
      const href = linkMatch[1].startsWith("http") ? linkMatch[1] : `${baseUrl}${linkMatch[1]}`;
      const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      if (title.length > 5 && !results.some(r => r.title === title)) results.push({ title, url: href });
    }
  }

  // Pattern 3: Any link containing "bid", "solicitation", "rfp" in href or text
  const linkRegex = /<a[^>]*href="([^"]*(?:bid|solicit|rfp|rfq|procurement|opportunity)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].startsWith("http") ? match[1] : `${baseUrl}${match[1]}`;
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    if (title.length > 5 && !results.some(r => r.url === href)) results.push({ title, url: href });
  }

  return results;
}

export function parseCaleProcure(html: string): Array<{title: string; url: string; agency?: string}> {
  // California CaleProcure
  const results: Array<{title: string; url: string; agency?: string; deadline?: string; solicitation_number?: string}> = [];
  // Look for event/bid listings - CaleProcure uses ASP.NET GridView or similar
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const row = match[1];
    // Look for links to event details
    const linkMatch = row.match(/<a[^>]*href="([^"]*(?:event|bid|solicitation)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (linkMatch) {
      const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      if (title.length > 5) results.push({ title, url: `https://caleprocure.ca.gov${linkMatch[1]}` });
    }
    // Also grab any td content that looks like a bid title
    const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (tds.length >= 3 && tds[0]) {
      const text = tds[0].replace(/<[^>]+>/g, "").trim();
      if (text.length > 10 && /[A-Z]/.test(text)) {
        const existingLink = row.match(/<a[^>]*href="([^"]*)"/) ;
        if (existingLink && !results.some(r => r.title === text)) {
          results.push({ title: text, url: `https://caleprocure.ca.gov${existingLink[1]}` });
        }
      }
    }
  }
  return results;
}

export function parseMyFloridaMarketplace(html: string): Array<{title: string; url: string}> {
  const results: Array<{title: string; url: string; agency?: string; deadline?: string; solicitation_number?: string}> = [];
  // Florida uses a search results table
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    const href = match[1];
    if (title.length > 10 && (href.includes("bid") || href.includes("solicitation") || href.includes("opportunity") || href.includes("search"))) {
      const url = href.startsWith("http") ? href : `https://vendor.myfloridamarketplace.com${href}`;
      if (!results.some(r => r.title === title)) results.push({ title, url });
    }
  }
  return results;
}

export function parseTxSmartBuy(html: string): Array<{title: string; url: string; solicitation_number?: string}> {
  const results: Array<{title: string; url: string; agency?: string; deadline?: string; solicitation_number?: string}> = [];
  // Texas ESBD renders solicitations with direct links at /esbd/{SOLICITATION-ID}
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const row = match[1];
    const linkMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (linkMatch) {
      const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      if (title.length > 5) {
        let url = linkMatch[1];
        // Ensure we have the correct direct-link base URL
        if (!url.startsWith("http")) {
          url = `https://www.txsmartbuy.gov${url.startsWith("/") ? "" : "/"}${url}`;
        }
        // Extract solicitation number from /esbd/{ID} pattern
        const solMatch = url.match(/\/esbd\/([^/?#]+)/);
        results.push({ title, url, solicitation_number: solMatch?.[1] });
      }
    }
  }
  // Also look for direct /esbd/ links anywhere in the page
  const esbdRegex = /<a[^>]*href="(\/esbd\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = esbdRegex.exec(html)) !== null) {
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    const url = `https://www.txsmartbuy.gov${match[1]}`;
    const solMatch = match[1].match(/\/esbd\/([^/?#]+)/);
    if (title.length > 5 && !results.some(r => r.url === url)) {
      results.push({ title, url, solicitation_number: solMatch?.[1] });
    }
  }
  return results;
}

export function parsePennsylvania(html: string): Array<{title: string; url: string; solicitation_number?: string}> {
  // Pennsylvania eMarketplace — clean ?SID={numeric_id} pattern
  const results: Array<{title: string; url: string; solicitation_number?: string}> = [];
  // Look for links to Solicitations.aspx?SID=
  const sidRegex = /<a[^>]*href="([^"]*Solicitations\.aspx\?SID=([0-9]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = sidRegex.exec(html)) !== null) {
    const sid = match[2];
    const title = match[3].replace(/<[^>]+>/g, "").trim();
    const url = `https://www.emarketplace.state.pa.us/Solicitations.aspx?SID=${sid}`;
    if (title.length > 3 && !results.some(r => r.url === url)) {
      results.push({ title, url, solicitation_number: sid });
    }
  }
  // Also scan table rows for solicitation numbers with links
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  while ((match = rowRegex.exec(html)) !== null) {
    const row = match[1];
    const linkInRow = row.match(/href="[^"]*SID=([0-9]+)/i);
    if (linkInRow) {
      const sid = linkInRow[1];
      const tds = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(td => td.replace(/<[^>]+>/g, "").trim());
      const title = tds.find(t => t.length > 10) || tds.join(" | ");
      const url = `https://www.emarketplace.state.pa.us/Solicitations.aspx?SID=${sid}`;
      if (title && !results.some(r => r.url === url)) {
        results.push({ title, url, solicitation_number: sid });
      }
    }
  }
  return results;
}

export function parseWestVirginia(html: string): Array<{title: string; url: string}> {
  // West Virginia — static HTML pages at /Bids/FY{YEAR}/BO{YYYYMMDD}.html
  const results: Array<{title: string; url: string}> = [];
  const linkRegex = /<a[^>]*href="([^"]*(?:FY\d{4}|BO\d{8})[^"]*\.html?)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    const url = href.startsWith("http") ? href : `https://www.state.wv.us/admin/purchase/Bids/${href.replace(/^\.?\/?/, "")}`;
    if (title.length > 3 && !results.some(r => r.url === url)) {
      results.push({ title, url });
    }
  }
  return results;
}

export function parseBidNetDirect(html: string): Array<{title: string; url: string; solicitation_number?: string}> {
  // BidNet Direct — used by Idaho, Denver, Maricopa County, etc.
  // URL pattern: /public/supplier/solicitations/statewide/{ID}/abstract
  const results: Array<{title: string; url: string; solicitation_number?: string}> = [];
  const linkRegex = /<a[^>]*href="([^"]*(?:solicitations|solicitation)[^"]*\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const id = match[2];
    const title = match[3].replace(/<[^>]+>/g, "").trim();
    const url = href.startsWith("http") ? href : `https://www.bidnetdirect.com${href}`;
    if (title.length > 3 && !results.some(r => r.url === url)) {
      results.push({ title, url, solicitation_number: id });
    }
  }
  return results;
}

export function parseGenericSPA(html: string, baseUrl: string): Array<{title: string; url: string}> {
  // Generic fallback for any SPA - looks for ALL links and table rows with procurement keywords
  const results: Array<{title: string; url: string; agency?: string; deadline?: string; solicitation_number?: string}> = [];
  const keywords = /bid|solicitation|rfp|rfq|procurement|opportunity|contract|tender/i;

  // All links
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    const href = match[1];
    if (title.length > 10 && (keywords.test(title) || keywords.test(href))) {
      const url = href.startsWith("http") ? href : `${baseUrl}${href}`;
      if (!results.some(r => r.title === title)) results.push({ title, url });
    }
  }

  // Table rows containing keywords
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  while ((match = rowRegex.exec(html)) !== null) {
    const row = match[1];
    if (keywords.test(row)) {
      const tds = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(td => td.replace(/<[^>]+>/g, "").trim()).filter(t => t.length > 5);
      const linkInRow = row.match(/<a[^>]*href="([^"]*)"/);
      if (tds.length > 0 && linkInRow) {
        const title = tds[0];
        const url = linkInRow[1].startsWith("http") ? linkInRow[1] : `${baseUrl}${linkInRow[1]}`;
        if (!results.some(r => r.title === title)) results.push({ title, url });
      }
    }
  }

  return results;
}
