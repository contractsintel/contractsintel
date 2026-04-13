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

export function parseTxSmartBuy(html: string): Array<{title: string; url: string}> {
  const results: Array<{title: string; url: string; agency?: string; deadline?: string; solicitation_number?: string}> = [];
  // Texas TxSmartBuy SPA renders a table of solicitations
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const row = match[1];
    const linkMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (linkMatch) {
      const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      if (title.length > 5) {
        const url = linkMatch[1].startsWith("http") ? linkMatch[1] : `https://www.txsmartbuy.com${linkMatch[1]}`;
        results.push({ title, url });
      }
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
