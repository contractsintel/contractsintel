let _callCount = 0;

export function getScrapingBeeCallCount(): number {
  return _callCount;
}

export function resetScrapingBeeCallCount(): void {
  _callCount = 0;
}

export async function fetchWithScrapingBee(url: string, waitMs: number = 3000): Promise<string> {
  const key = process.env.SCRAPINGBEE_KEY;
  if (!key) throw new Error("SCRAPINGBEE_KEY not configured");

  const apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${key}&url=${encodeURIComponent(url)}&render_js=true&wait=${waitMs}`;
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`ScrapingBee returned ${res.status}`);
  _callCount++;
  return res.text();
}

export async function logScrapingBeeUsage(supabase: any): Promise<void> {
  if (_callCount === 0) return;
  try {
    await supabase.from("scraper_runs").insert({
      source: "scrapingbee_usage",
      status: "success",
      opportunities_found: 0,
      matches_created: 0,
      error_message: `ScrapingBee API calls this run: ${_callCount}`,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[scrapingbee] Failed to log usage:", err);
  }
}
