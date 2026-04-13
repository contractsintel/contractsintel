// Puppeteer rendering server on Railway
// Server: https://puppeteer-production-f147.up.railway.app

const PUPPETEER_URL = process.env.PUPPETEER_SERVER_URL ?? "";
const PUPPETEER_TOKEN = process.env.PUPPETEER_AUTH_TOKEN ?? "";

let _callCount = 0;

export async function fetchWithPuppeteer(url: string, waitMs: number = 5000): Promise<string> {
  const apiUrl = `${PUPPETEER_URL}/render?url=${encodeURIComponent(url)}&wait=${waitMs}`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${PUPPETEER_TOKEN}` },
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    throw new Error(`Puppeteer server returned ${res.status} for ${url}`);
  }

  const data = await res.json();
  if (!data.success || !data.html) {
    throw new Error(`Puppeteer render failed for ${url}: ${data.error || "no HTML returned"}`);
  }

  _callCount++;
  return data.html;
}

export async function logPuppeteerUsage(supabase: any) {
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
