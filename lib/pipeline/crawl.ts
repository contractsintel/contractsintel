/**
 * Website-crawl worker — ported from workers/jobs/crawl-lead-websites.js.
 *
 * Input:  leads with primary_cert=<cert>, email IS NULL, entity_url set,
 *         crawl_attempted_at IS NULL, ingest_tier='primary'.
 *
 * Per lead: normalize URL → robots check → fetch homepage + /contact + /about
 * + /team → regex-scan bodies → filter to apex-matched domain → score locals
 * → persist highest-scoring email. Fires node:https directly (same as the
 * original worker — no puppeteer needed for static HTML scrapes).
 */

import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { pipelineSupabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const PER_DOMAIN_DELAY = 1000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 500_000;
const USER_AGENT = "ContractsIntelBot/1.0 (+https://contractsintel.com/bot)";
const STORAGE_BUCKET = "crawl-cache";
const PATHS_TO_TRY = ["", "/contact", "/contact-us", "/about", "/team"];

const SOCIAL_MEDIA_DOMAINS = new Set([
  "facebook.com", "m.facebook.com", "fb.me",
  "linkedin.com",
  "twitter.com", "x.com", "t.co",
  "instagram.com",
  "linktr.ee",
  "about.me", "bio.link", "beacons.ai", "carrd.co", "hoo.be", "tap.bio",
  "youtube.com", "youtu.be",
  "tiktok.com",
  "google.com", "goo.gl", "g.co", "sites.google.com",
  "wixsite.com", "squarespace-cdn.com",
]);

const GENERIC_PREFIXES = new Set([
  "info", "contact", "contacts", "sales", "admin", "hello", "office", "general",
  "inquiries", "inquiry", "support", "accounting", "billing", "team", "hr", "careers",
]);
const BOT_PREFIXES = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster",
  "bounce", "bounces", "root", "daemon", "abuse", "webmaster", "hostmaster",
]);
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "aol.com", "outlook.com", "icloud.com",
  "live.com", "msn.com", "me.com", "mac.com", "comcast.net", "proton.me", "protonmail.com",
  "tutanota.com", "tutanota.de", "gmx.com", "gmx.de", "yandex.com", "mail.com",
]);

function scoreLocal(local: string): number {
  const l = local.toLowerCase();
  if (BOT_PREFIXES.has(l)) return 0;
  if (/^[a-z]+\.[a-z]+[0-9]*$/.test(l)) return 3;
  if (/^[a-z]+_[a-z]+[0-9]*$/.test(l)) return 3;
  if (/^[a-z][a-z]+$/.test(l) && l.length >= 5 && l.length <= 20 && !GENERIC_PREFIXES.has(l)) return 3;
  if (GENERIC_PREFIXES.has(l)) return 1;
  if (/^[a-z]{2,4}$/.test(l)) return 2;
  if (/^[a-z]+[0-9]*$/.test(l) && l.length <= 15) return 2;
  return 0;
}

function qualityTag(score: number): string | null {
  if (score >= 2) return "website_crawl_named";
  if (score === 1) return "website_crawl_generic";
  return null;
}

function normalizeURL(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (!/^https?:\/\//.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    u.hash = "";
    if (u.hostname.startsWith("www.")) u.hostname = u.hostname.slice(4);
    return u;
  } catch {
    return null;
  }
}

function apexDomain(hostname: string | null | undefined): string | null {
  if (!hostname) return null;
  const parts = hostname.split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}

type FetchResult = { ok: boolean; status: number; body: string; finalURL: URL };

function fetchURL(urlObj: URL): Promise<FetchResult> {
  return new Promise((resolve) => {
    const lib = urlObj.protocol === "http:" ? http : https;
    const req = lib.request(
      urlObj,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.5",
        },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          try {
            const next = new URL(res.headers.location, urlObj);
            res.resume();
            return resolve(fetchURL(next));
          } catch {
            res.resume();
            return resolve({ ok: false, status, body: "", finalURL: urlObj });
          }
        }
        if (status >= 400) {
          res.resume();
          return resolve({ ok: false, status, body: "", finalURL: urlObj });
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          bytes += c.length;
          if (bytes > MAX_BYTES) {
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        res.on("end", () =>
          resolve({
            ok: true,
            status,
            body: Buffer.concat(chunks).toString("utf-8"),
            finalURL: urlObj,
          }),
        );
        res.on("error", () => resolve({ ok: false, status: 0, body: "", finalURL: urlObj }));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: "", finalURL: urlObj });
    });
    req.on("error", () => resolve({ ok: false, status: 0, body: "", finalURL: urlObj }));
    req.end();
  });
}

async function checkRobots(baseURL: URL): Promise<{ allowed: boolean }> {
  try {
    const u = new URL("/robots.txt", baseURL);
    const r = await fetchURL(u);
    if (!r.ok || !r.body) return { allowed: true };
    const text = r.body.toLowerCase();
    const blocks = text.split(/user-agent:/).slice(1);
    for (const b of blocks) {
      const head = b.split("\n")[0].trim();
      if (head === "*" || head.includes("contractsintelbot")) {
        if (/^\s*disallow:\s*\/\s*$/m.test(b)) return { allowed: false };
      }
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

const EMAIL_RE = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,24})/g;

type Candidate = { email: string; score: number; page: string };

function extractEmails(body: string, pageURL: URL, apex: string): Candidate[] {
  if (!body) return [];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const txt = body.replace(/\s+/g, " ");
  let m: RegExpExecArray | null;
  while ((m = EMAIL_RE.exec(txt)) !== null) {
    const local = m[1].toLowerCase();
    const domain = m[2].toLowerCase();
    const email = `${local}@${domain}`;
    if (seen.has(email)) continue;
    seen.add(email);
    if (FREEMAIL_DOMAINS.has(domain)) continue;
    if (local.length > 40) continue;
    if (apexDomain(domain) !== apex) continue;
    const score = scoreLocal(local);
    if (score === 0) continue;
    out.push({ email, score, page: pageURL.pathname });
  }
  return out;
}

function pickBest(candidates: Candidate[]): Candidate | null {
  if (!candidates.length) return null;
  const rank = (c: Candidate): number => {
    const path = c.page || "/";
    const bonus = /contact|team/.test(path) ? 1 : 0;
    return c.score * 10 + bonus;
  };
  candidates.sort((a, b) => rank(b) - rank(a));
  return candidates[0];
}

const domainLastFetch = new Map<string, number>();
async function waitForDomain(host: string): Promise<void> {
  const last = domainLastFetch.get(host) || 0;
  const wait = PER_DOMAIN_DELAY - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  domainLastFetch.set(host, Date.now());
}

type LeadRow = { id: string; uei: string; entity_url: string | null; company: string | null; primary_cert: string };

async function crawlOne(
  supabase: SupabaseClient,
  lead: LeadRow,
): Promise<{ status: string; winner?: Candidate; qualityTag?: string | null; apex?: string; pagesTried?: any[]; candidateCount?: number; lead: LeadRow }> {
  const baseURL = normalizeURL(lead.entity_url);
  if (!baseURL) return { status: "skip_no_url", lead };
  const apex = apexDomain(baseURL.hostname);
  if (!apex) return { status: "skip_no_url", lead };

  const h = baseURL.hostname.toLowerCase();
  if (
    SOCIAL_MEDIA_DOMAINS.has(h) ||
    /\.wixsite\.com$/.test(h) ||
    /\.squarespace\.com$/.test(h)
  ) {
    return { status: "skip_social_media", lead, apex };
  }

  const robots = await checkRobots(baseURL);
  if (!robots.allowed) return { status: "robots_disallow", lead, apex };

  const candidates: Candidate[] = [];
  const pagesTried: any[] = [];
  let anyOK = false;
  let cachedHTML = "";

  for (const p of PATHS_TO_TRY) {
    let u: URL;
    try {
      u = new URL(p || "/", baseURL);
    } catch {
      continue;
    }
    await waitForDomain(baseURL.hostname);
    const r = await fetchURL(u);
    pagesTried.push({ path: u.pathname, status: r.status, ok: r.ok });
    if (r.ok && r.body) {
      anyOK = true;
      cachedHTML += `\n<!-- ==== ${u.toString()} ==== -->\n` + r.body;
      const emails = extractEmails(r.body, u, apex);
      candidates.push(...emails);
    }
  }

  if (!anyOK) return { status: "fetch_fail", lead, apex, pagesTried };

  const winner = pickBest(candidates);

  try {
    const key = `${lead.uei}/${crypto.createHash("sha1").update(baseURL.hostname).digest("hex").slice(0, 12)}.html`;
    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(key, Buffer.from(cachedHTML, "utf-8"), { contentType: "text/html", upsert: true })
      .catch(async () => {
        await supabase.storage.createBucket(STORAGE_BUCKET, { public: false }).catch(() => {});
      });
  } catch {}

  if (!winner) return { status: "no_email", lead, apex, pagesTried, candidateCount: candidates.length };
  return { status: "ok", lead, apex, pagesTried, winner, qualityTag: qualityTag(winner.score) };
}

async function persistResult(
  supabase: SupabaseClient,
  result: Awaited<ReturnType<typeof crawlOne>>,
): Promise<void> {
  const { lead, status, winner, qualityTag: qt, pagesTried = [], apex, candidateCount } = result;
  const update: Record<string, unknown> = {
    crawl_attempted_at: new Date().toISOString(),
    crawl_status: status,
    crawl_details: {
      pages_tried: pagesTried,
      apex,
      candidate_count: candidateCount,
      winning_url: winner ? winner.page : null,
      winning_score: winner ? winner.score : null,
    },
  };
  if (status === "ok" && winner) {
    update.email = winner.email;
    update.email_quality = winner.score >= 2 ? "named" : "generic";
    update.email_source = qt;
  }
  const { error } = await supabase.from("leads").update(update).eq("id", lead.id);
  if (error) console.error(`  update lead ${lead.id}: ${error.message}`);
}

export async function crawl(
  opts: { cert: string; batchSize?: number },
): Promise<{ processed: number; found: number }> {
  const supabase = pipelineSupabase();
  const limit = opts.batchSize ?? parseInt(process.env.CRAWL_LIMIT || "50", 10);

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, uei, entity_url, company, primary_cert")
    .eq("primary_cert", opts.cert)
    .is("email", null)
    .is("crawl_attempted_at", null)
    .eq("ingest_tier", "primary")
    .not("entity_url", "is", null)
    .limit(limit);
  if (error) throw new Error(`supabase read: ${error.message}`);
  if (!leads?.length) return { processed: 0, found: 0 };

  let processed = 0;
  let found = 0;
  // Serial, not pooled — keeps us well inside the 300s Vercel ceiling and
  // avoids the original's 25-way domain concurrency (most leads per tick are
  // a different apex anyway). Reduces memory for cold-starts.
  for (const lead of leads as LeadRow[]) {
    try {
      const r = await crawlOne(supabase, lead);
      await persistResult(supabase, r);
      processed += 1;
      if (r.status === "ok") found += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  crawl ${lead.id} FAIL: ${msg}`);
    }
  }
  return { processed, found };
}
