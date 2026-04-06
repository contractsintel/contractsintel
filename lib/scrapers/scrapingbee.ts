// Puppeteer rendering server (replaces ScrapingBee)
// Server runs on Railway at puppeteer-production-f147.up.railway.app

const PUPPETEER_URL = process.env.PUPPETEER_SERVER_URL || "https://puppeteer-production-f147.up.railway.app";
const PUPPETEER_TOKEN = process.env.PUPPETEER_AUTH_TOKEN || "ci-puppeteer-2026";

let _callCount = 0;

export async function fetchWithScrapingBee(url: string, waitMs: number = 5000): Promise<string> {
  // Try our own Puppeteer server first
  try {
    const apiUrl = `${PUPPETEER_URL}/render?url=${encodeURIComponent(url)}&wait=${waitMs}`;
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${PUPPETEER_TOKEN}` },
      signal: AbortSignal.timeout(60000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.html) {
        _callCount++;
        return data.html;
      }
    }
  } catch (err) {
    console.log(`[puppeteer] Own server failed for ${url}: ${err}`);
  }

  // Fallback to ScrapingBee if our server is down
  const sbKey = process.env.SCRAPINGBEE_KEY;
  if (sbKey) {
    const sbUrl = `https://app.scrapingbee.com/api/v1/?api_key=${sbKey}&url=${encodeURIComponent(url)}&render_js=true&wait=${waitMs}`;
    const res = await fetch(sbUrl, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`ScrapingBee returned ${res.status}`);
    _callCount++;
    return res.text();
  }

  throw new Error("No rendering service available (Puppeteer server down, no ScrapingBee key)");
}

export async function logScrapingBeeUsage(supabase: any) {
  if (_callCount > 0) {
    await supabase.from("scraper_runs").insert({
      source: "puppeteer_usage",
      status: "success",
      opportunities_found: _callCount,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
    _callCount = 0;
  }
}
