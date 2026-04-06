const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN || "ci-puppeteer-2026";

let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });
  }
  return browser;
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Render a page with JavaScript
app.get("/render", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = req.query.url;
  const wait = parseInt(req.query.wait) || 5000;

  if (!url) {
    return res.status(400).json({ error: "url parameter required" });
  }

  let page = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for dynamic content to render
    await new Promise((r) => setTimeout(r, wait));

    const html = await page.content();

    res.json({
      success: true,
      url,
      html,
      length: html.length,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      url,
      error: err.message,
    });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// Batch render multiple URLs
app.post("/render-batch", express.json(), async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { urls, wait = 5000 } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "urls array required" });
  }

  const results = [];
  for (const url of urls.slice(0, 20)) {
    let page = null;
    try {
      const b = await getBrowser();
      page = await b.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      );
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((r) => setTimeout(r, wait));
      const html = await page.content();
      results.push({ url, success: true, html, length: html.length });
    } catch (err) {
      results.push({ url, success: false, error: err.message });
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  res.json({ results, count: results.length });
});

app.listen(PORT, () => {
  console.log(`Puppeteer server running on port ${PORT}`);
});
