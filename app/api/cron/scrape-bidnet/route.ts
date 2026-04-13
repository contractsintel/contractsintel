import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const BIDNET_URL = "https://www.bidnetdirect.com/search?status=open&keywords=";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const res = await fetch(BIDNET_URL, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return NextResponse.json({ error: `BidNet ${res.status}` }, { status: 502 });

    const html = await res.text();
    let saved = 0;

    // Parse bid listing cards/rows from BidNet HTML
    // BidNet uses structured listing elements with bid details
    const listings: Array<{ title: string; href: string; state: string; agency: string; deadline: string | null }> = [];

    // Pattern 1: Extract from listing/result card elements
    const cardRegex = /<(?:div|article|li|tr)[^>]*class="[^"]*(?:listing|result|bid-item|search-result)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|li|tr)>/gi;
    let cardMatch;
    while ((cardMatch = cardRegex.exec(html)) !== null) {
      const card = cardMatch[1];
      const linkMatch = card.match(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      const stateMatch = card.match(/(?:state|location|jurisdiction)[^<]*?(?:<[^>]*>)*\s*([A-Z]{2})\b/i)
        || card.match(/\b([A-Z]{2})\s*(?:,|\s*-)\s*(?:State|County|City)/i)
        || card.match(/\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)\b/i);
      const agencyMatch = card.match(/(?:agency|organization|buyer)[^<]*?(?:<[^>]*>)*\s*([^<]{3,80})/i);
      const dateMatch = card.match(/(?:due|deadline|close|end)[^<]*?(?:<[^>]*>)*\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
        || card.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);

      if (linkMatch) {
        listings.push({
          title: linkMatch[2].replace(/<[^>]+>/g, "").trim(),
          href: linkMatch[1],
          state: stateMatch ? stateMatch[1].trim() : "Unknown",
          agency: agencyMatch ? agencyMatch[1].replace(/<[^>]+>/g, "").trim() : "BidNet",
          deadline: dateMatch ? dateMatch[1] : null,
        });
      }
    }

    // Pattern 2: Extract from table rows with bid data
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(html)) !== null) {
      const row = trMatch[1];
      if (!/bid|solicit|rfp|rfq|procurement/i.test(row)) continue;
      const linkMatch = row.match(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const text = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      if (text.length < 5) continue;
      // Avoid duplicates already captured by card pattern
      if (listings.some((l) => l.href === linkMatch[1])) continue;

      const stateMatch = row.match(/\b([A-Z]{2})\b/);
      const dateMatch = row.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      listings.push({
        title: text,
        href: linkMatch[1],
        state: stateMatch ? stateMatch[1] : "Unknown",
        agency: "BidNet",
        deadline: dateMatch ? dateMatch[1] : null,
      });
    }

    // Pattern 3: Extract any anchor tags linking to bid detail pages
    const bidLinkRegex = /<a[^>]+href="(\/(?:bids?|solicitations?|opportunities?)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let bidLinkMatch;
    while ((bidLinkMatch = bidLinkRegex.exec(html)) !== null) {
      const href = bidLinkMatch[1];
      if (listings.some((l) => l.href === href)) continue;
      const text = bidLinkMatch[2].replace(/<[^>]+>/g, "").trim();
      if (text.length < 5) continue;
      listings.push({
        title: text,
        href,
        state: "Unknown",
        agency: "BidNet",
        deadline: null,
      });
    }

    for (const listing of listings.slice(0, 200)) {
      const fullUrl = listing.href.startsWith("http")
        ? listing.href
        : `https://www.bidnetdirect.com${listing.href}`;

      const noticeId = `bidnet-${listing.href.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 100)}`;

      const { error } = await supabase.from("opportunities").upsert({
        notice_id: noticeId,
        title: `[${listing.state}] ${listing.title.substring(0, 200)}`,
        agency: listing.agency,
        source: "bidnet",
        source_url: fullUrl,
        response_deadline: listing.deadline ?? null,
      }, { onConflict: "notice_id" });
      if (!error) saved++;
    }

    return NextResponse.json({ success: true, source: "bidnet", fetched: listings.length, saved });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
