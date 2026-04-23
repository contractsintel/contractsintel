/**
 * SBS (Small Business Search) enrichment — ported from
 * workers/jobs/enrich-leads-via-sbs.js.
 *
 * SBS's search.certifications.sba.gov backend is a plain JSON API, not a
 * React SPA under a login. No puppeteer needed — direct fetch + 2.5s
 * pacing, scoped to the batch size the orchestrator hands us.
 */

import { pipelineSupabase } from "./supabase";
import type { DrainResult, StageCursor } from "./types";

const SBS_URL = "https://search.certifications.sba.gov/_api/v2/search";
const DELAY_MS = 2500;
const CIRCUIT_BREAK_429S = 3; // R5: halt on 3 consecutive 429s
const USER_AGENT = "ContractsIntelBot/1.0 (+https://contractsintel.com/bot)";

const GENERIC_PREFIXES = new Set([
  "info", "contact", "contacts", "sales", "admin", "hello", "office", "general",
  "inquiries", "inquiry", "support", "accounting", "billing", "team", "hr", "careers",
]);
const BOT_PREFIXES = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster",
  "bounce", "bounces", "root", "daemon", "abuse", "webmaster", "hostmaster",
]);
const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "aol.com", "outlook.com", "icloud.com",
  "live.com", "msn.com", "me.com", "mac.com", "comcast.net", "proton.me", "protonmail.com",
  "tutanota.com", "gmx.com", "yandex.com", "mail.com",
]);

function scoreLocal(local: string): number {
  const l = String(local || "").toLowerCase();
  if (!l) return 0;
  if (BOT_PREFIXES.has(l)) return 0;
  if (/^[a-z]+\.[a-z]+[0-9]*$/.test(l)) return 3;
  if (/^[a-z]+_[a-z]+[0-9]*$/.test(l)) return 3;
  if (/^[a-z][a-z]+$/.test(l) && l.length >= 5 && l.length <= 20 && !GENERIC_PREFIXES.has(l)) return 3;
  if (GENERIC_PREFIXES.has(l)) return 1;
  if (/^[a-z]{2,4}$/.test(l)) return 2;
  if (/^[a-z]+[0-9]*$/.test(l) && l.length <= 15) return 2;
  return 0;
}

function qualityTag(score: number): { source: string; quality: "named" | "generic" } | null {
  if (score >= 2) return { source: "dsbs_scrape", quality: "named" };
  if (score === 1) return { source: "dsbs_scrape", quality: "generic" };
  return null;
}

function buildBody(searchTerm: string): Record<string, unknown> {
  return {
    searchProfiles: { searchTerm },
    location: { states: [], zipCodes: [], counties: [], districts: [], msas: [] },
    sbaCertifications: { activeCerts: [], isPreviousCert: false, operatorType: "Or" },
    naics: { codes: [], isPrimary: false, operatorType: "Or" },
    selfCertifications: { certifications: [], operatorType: "Or" },
    keywords: { list: [], operatorType: "Or" },
    lastUpdated: { date: { label: "Anytime", value: "anytime" } },
    samStatus: { isActiveSAM: false },
    qualityAssuranceStandards: { qas: [] },
    bondingLevels: { constructionIndividual: "", constructionAggregate: "", serviceIndividual: "", serviceAggregate: "" },
    businessSize: { relationOperator: "at-least", numberOfEmployees: "" },
    annualRevenue: { relationOperator: "at-least", annualGrossRevenue: "" },
    entityDetailId: "",
  };
}

async function sbsLookup(uei: string): Promise<{ ok: boolean; status: number; results: any[] }> {
  const res = await fetch(SBS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://search.certifications.sba.gov",
      Referer: "https://search.certifications.sba.gov/",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(buildBody(uei)),
  });
  if (!res.ok) return { status: res.status, ok: false, results: [] };
  const j = await res.json();
  return { status: res.status, ok: true, results: j.results || [] };
}

function titleCase(s: string): string {
  return String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function splitName(contactPerson: string | null | undefined): { first: string | null; last: string | null } {
  if (!contactPerson) return { first: null, last: null };
  const parts = String(contactPerson).trim().split(/\s+/);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: titleCase(parts[0]), last: null };
  return { first: titleCase(parts[0]), last: titleCase(parts[parts.length - 1]) };
}

type EmailCandidate = { email: string; score: number; domain: string } | { reject: "freemail" | "bot_or_random"; email: string } | null;

function extractEmailCandidate(hit: any): EmailCandidate {
  const raw = (hit.email || "").trim().toLowerCase();
  if (!raw || !raw.includes("@")) return null;
  const [local, domain] = raw.split("@");
  if (!local || !domain) return null;
  if (FREEMAIL.has(domain)) return { reject: "freemail", email: raw };
  const score = scoreLocal(local);
  if (score === 0) return { reject: "bot_or_random", email: raw };
  return { email: raw, score, domain };
}

/**
 * Drain chunk size (per tick). Env-tunable per §12 A1. Default 500 leads
 * per tick, 5-way concurrency → ~250s wall-clock at 2500ms/call per
 * worker. Stays under 300s Vercel ceiling.
 */
function enrichChunkSize(): number {
  return parseInt(process.env.PIPELINE_DRAIN_ENRICH_CHUNK || "500", 10);
}

function enrichConcurrency(): number {
  return parseInt(process.env.PIPELINE_DRAIN_ENRICH_CONCURRENCY || "5", 10);
}

type EnrichCursor = { last_lead_id?: number };

function readCursor(c: StageCursor): EnrichCursor {
  if (!c || typeof c !== "object") return {};
  const last = (c as EnrichCursor).last_lead_id;
  return typeof last === "number" ? { last_lead_id: last } : {};
}

/**
 * Process one lead against SBS. Returns {ok, enriched, rateLimited}.
 * rateLimited surfaces 429s so the caller's circuit breaker can halt.
 */
async function processLead(
  supabase: ReturnType<typeof pipelineSupabase>,
  lead: { id: number; uei: string; entity_url: string | null },
): Promise<{ ok: boolean; enriched: boolean; rateLimited: boolean }> {
  try {
    const r = await sbsLookup(lead.uei);
    if (r.status === 429) return { ok: false, enriched: false, rateLimited: true };
    if (!r.ok || !r.results.length) return { ok: true, enriched: false, rateLimited: false };
    const hit = r.results[0];
    const cand = extractEmailCandidate(hit);
    const update: Record<string, unknown> = {};
    if (hit.phone) update.phone = hit.phone;
    if (hit.contact_person) {
      const { first, last } = splitName(hit.contact_person);
      update.first_name = first;
      update.last_name = last;
    }
    if (hit.website && !lead.entity_url) update.entity_url = hit.website;
    let enriched = false;
    if (cand && !("reject" in cand)) {
      const tag = qualityTag(cand.score);
      if (tag) {
        update.email = cand.email;
        update.email_quality = tag.quality;
        update.email_source = tag.source;
        enriched = true;
      }
    }
    if (Object.keys(update).length) {
      const { error: uerr } = await supabase.from("leads").update(update).eq("id", lead.id);
      if (uerr) console.error(`  update ${lead.uei}: ${uerr.message}`);
    }
    return { ok: true, enriched, rateLimited: false };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  sbs ${lead.uei} FAIL: ${msg}`);
    return { ok: false, enriched: false, rateLimited: false };
  }
}

export async function enrich(
  opts: { cert: string; cursor?: StageCursor },
): Promise<DrainResult> {
  const supabase = pipelineSupabase();
  const chunk = enrichChunkSize();
  const concurrency = Math.max(1, enrichConcurrency());
  const cursor = readCursor(opts.cursor ?? null);

  // cert-scoped queue: leads of this primary_cert still missing email
  // after crawl. Paginated by id > cursor.last_lead_id so drains
  // monotonically across ticks.
  let q = supabase
    .from("leads")
    .select("id, uei, company, entity_url, crawl_status, email")
    .eq("ingest_tier", "primary")
    .eq("primary_cert", opts.cert)
    .is("email", null)
    .in("crawl_status", ["no_email", "fetch_fail", "robots_disallow", "skip_social_media"])
    .not("uei", "is", null)
    .order("id", { ascending: true })
    .limit(chunk);
  if (cursor.last_lead_id != null) q = q.gt("id", cursor.last_lead_id);
  const { data: leads, error } = await q;
  if (error) throw new Error(`supabase read: ${error.message}`);
  if (!leads?.length) {
    return { done: true, inserted: 0, reason: "nothing_to_enrich" };
  }

  const rows = leads as unknown as { id: number; uei: string; entity_url: string | null }[];

  // Concurrency pool + R5 circuit breaker on CIRCUIT_BREAK_429S consecutive 429s.
  // Each worker processes from a shared queue with per-worker DELAY_MS between
  // its own calls, preserving politeness at effective rate ~concurrency/DELAY_MS
  // req/s against SBS (5/2.5s = 2 req/s default).
  let enriched = 0;
  let processed = 0;
  let maxId = cursor.last_lead_id ?? 0;
  let consecutive429 = 0;
  let circuitBroken = false;
  let idx = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (circuitBroken) return;
      const myIdx = idx++;
      if (myIdx >= rows.length) return;
      const lead = rows[myIdx];
      const r = await processLead(supabase, lead);
      processed += 1;
      if (lead.id > maxId) maxId = lead.id;
      if (r.rateLimited) {
        consecutive429 += 1;
        if (consecutive429 >= CIRCUIT_BREAK_429S) {
          console.warn(`  [enrich] circuit break: ${consecutive429} consecutive 429s`);
          circuitBroken = true;
          return;
        }
      } else {
        consecutive429 = 0;
      }
      if (r.enriched) enriched += 1;
      await new Promise((r2) => setTimeout(r2, DELAY_MS));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Done criterion: drained if we processed fewer than chunk OR returned
  // fewer than chunk from the DB. Circuit-broken means done=false so we
  // retry next tick from the cursor position (not all rows processed).
  if (circuitBroken) {
    return {
      done: false,
      next_cursor: { last_lead_id: maxId },
      inserted: enriched,
      requests: processed,
      reason: "sbs_rate_limited",
    };
  }
  const drained = rows.length < chunk;
  return {
    done: drained,
    next_cursor: drained ? null : { last_lead_id: maxId },
    inserted: enriched,
    requests: processed,
  };
}
