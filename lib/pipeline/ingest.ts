/**
 * SAM.gov Entity Management API → leads table.
 *
 * Ported from workers/jobs/ingest-sam-entities.js. Pure async function:
 *   ingest({ cert, mode })
 *     mode='backfill'  → Extract API (start + poll + parse + upsert)
 *     mode='delta'     → paginated /entities with lastUpdateDate
 *
 * Single-cert only (the orchestrator iterates certs itself). Returns a
 * summary the orchestrator inspects to decide stage advancement.
 *
 * Vercel note: the route has maxDuration=300s. A fresh HUBZone/8a Extract
 * normally returns inside ~30-60s; larger pools (sdvosb/wosb) can exceed
 * the window. If poll timeout is hit inside a tick we throw — the
 * orchestrator downgrades to last_error and next tick retries from
 * scratch (same behavior as the original Railway worker).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import zlib from "node:zlib";
import { pipelineSupabase } from "./supabase";
import type { DrainResult, PipelineMode, StageCursor } from "./types";

// ---- configuration -------------------------------------------------------
const SAM_BASE = "https://api.sam.gov/entity-information/v4/entities";
const SAM_DOWNLOAD = "https://api.sam.gov/entity-information/v4/download-entities";

type CertFilter = { cert: string; param: string; code: string };
const CERT_FILTERS: CertFilter[] = [
  { cert: "8a", param: "sbaBusinessTypeCode", code: "A6" },
  { cert: "hubzone", param: "sbaBusinessTypeCode", code: "XX" },
  { cert: "sdvosb", param: "businessTypeCode", code: "QF" },
  { cert: "wosb", param: "businessTypeCode", code: "8W" },
];
const CERT_PRIORITY = ["8a", "edwosb", "sdvosb", "hubzone", "wosb"];

// Top-20 small-biz set-aside NAICS (2026-04-18 run). See original worker.
const PRIMARY_NAICS = new Set([
  "236220", "238220", "336413", "561730", "561720", "332510", "339991", "237310",
  "334419", "336611", "332911", "115310", "332722", "237990", "333613", "335314",
  "336390", "541330", "238210", "335999",
]);

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "aol.com", "outlook.com",
  "icloud.com", "live.com", "msn.com", "me.com", "mac.com", "comcast.net",
]);
const GENERIC_PREFIXES = new Set([
  "info", "contracts", "admin", "support", "sales", "contact", "office",
  "accounting", "billing", "hello", "team", "general", "inquiries",
]);

// Pagination / pacing
const PAGE_SIZE = 10;
const DELTA_MAX_PAGES = 50;
const PAGINATED_INTERVAL_MS = 90_000;
const DELTA_LOOKBACK_DAYS = 2;

// Extract polling — reduced ceilings vs original to fit inside the Vercel
// 300s route budget. If the extract isn't ready within ~4 min we throw and
// let the next tick restart the extract.
const EXTRACT_POLL_INTERVAL_MS = 20_000;
const EXTRACT_POLL_MAX_MS = 60_000;
const EXTRACT_POLL_TIMEOUT_MS = 240_000;

const UPSERT_BATCH = 200;
const STORAGE_BUCKET = "backfills";

// ---- helpers -------------------------------------------------------------
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function tsStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

type EmailQuality = { keep: boolean; quality: "personal" | "generic" | "named" | "unknown" | null };

function classifyEmail(email: string | null | undefined): EmailQuality {
  if (!email) return { keep: false, quality: null };
  const e = email.toLowerCase().trim();
  const [local, domain] = e.split("@");
  if (!local || !domain) return { keep: false, quality: null };
  if (PERSONAL_DOMAINS.has(domain)) return { keep: false, quality: "personal" };
  if (GENERIC_PREFIXES.has(local)) return { keep: true, quality: "generic" };
  if (/^[a-z]+[._-][a-z]+[0-9]*$/.test(local)) return { keep: true, quality: "named" };
  if (/^[a-z]+[0-9]*$/.test(local)) return { keep: true, quality: "unknown" };
  return { keep: true, quality: "unknown" };
}

function pickPrimaryCert(certSet: Set<string>): string | null {
  for (const c of CERT_PRIORITY) if (certSet.has(c)) return c;
  return certSet.values().next().value || null;
}

function computeIngestTier(naicsCodes: string[]): "primary" | "secondary" {
  if (!Array.isArray(naicsCodes) || !naicsCodes.length) return "secondary";
  for (const n of naicsCodes) {
    if (PRIMARY_NAICS.has(String(n))) return "primary";
  }
  return "secondary";
}

function deriveCerts(entity: any): Set<string> {
  const set = new Set<string>();
  const bizTypes = entity.coreData?.businessTypes || {};
  const sbaCodes = (
    bizTypes.sbaBusinessTypeList ||
    entity.assertions?.sbaBusinessTypeList ||
    entity.sbaBusinessTypeList || []
  )
    .map((x: any) => x.sbaBusinessTypeCode || x.code || x)
    .filter(Boolean);
  const bCodes = (
    bizTypes.businessTypeList ||
    entity.assertions?.businessTypeList ||
    entity.businessTypeList || []
  )
    .map((x: any) => x.businessTypeCode || x.code || x)
    .filter(Boolean);

  if (sbaCodes.includes("A6")) set.add("8a");
  if (sbaCodes.includes("XX")) set.add("hubzone");
  if (bCodes.includes("QF")) set.add("sdvosb");
  if (bCodes.includes("8W")) set.add("wosb");

  const rcJson = JSON.stringify(entity.repsAndCerts || {}).toLowerCase();
  if (set.has("wosb") && rcJson.includes("edwosb")) {
    set.add("edwosb");
    set.delete("wosb");
  }
  return set;
}

function pickPOC(entity: any): any {
  const poc = entity.pointsOfContact || {};
  const ordered = [
    poc.governmentBusinessPOC,
    poc.governmentBusinessAlternatePOC,
    poc.electronicBusinessPOC,
    poc.electronicBusinessAlternatePOC,
    poc.pastPerformancePOC,
    poc.pastPerformanceAlternatePOC,
  ].filter(Boolean);
  const mp = poc.mandatoryPOCs || entity.mandatoryPOCs || [];
  const op = poc.optionalPOCs || entity.optionalPOCs || [];
  const all = [...ordered, ...mp, ...op];
  return (
    all.find((p: any) => /GOV/i.test(p.contactType || p.type || "")) ||
    all.find((p: any) => /ELECTRONIC/i.test(p.contactType || p.type || "")) ||
    all[0] ||
    null
  );
}

function toLeadRow(entity: any): Record<string, unknown> | null {
  const reg = entity.entityRegistration || {};
  const core = entity.coreData || {};
  const addr = core.physicalAddress || {};
  const uei = reg.ueiSAM || entity.ueiSAM;
  if (!uei) return null;

  const poc = pickPOC(entity);
  const email = (poc?.email || "").toLowerCase().trim();
  const q = classifyEmail(email);
  if (!q.keep) return null;

  const certSet = deriveCerts(entity);
  const naicsList = entity.assertions?.goodsAndServices?.naicsList || core.naicsList || [];
  const naics_codes: string[] = naicsList.map((n: any) => n.naicsCode || n).filter(Boolean);

  return {
    email,
    ingest_tier: computeIngestTier(naics_codes),
    first_name: poc?.firstName || null,
    last_name: poc?.lastName || null,
    title: poc?.title || null,
    phone: poc?.usPhone || poc?.phone || null,
    company: reg.legalBusinessName || core.dbaName || null,
    address: [addr.addressLine1, addr.addressLine2].filter(Boolean).join(" ") || null,
    city: addr.city || null,
    state: addr.stateOrProvinceCode || addr.state || null,
    zip: addr.zipCode || addr.zip || null,
    uei,
    cage_code: reg.cageCode || null,
    entity_url: core.entityInformation?.entityURL || core.entityURL || null,
    naics_codes,
    cert_types: Array.from(certSet),
    primary_cert: pickPrimaryCert(certSet),
    registration_status: reg.registrationStatus || null,
    registration_expiration_date: reg.registrationExpirationDate || null,
    email_quality: q.quality,
    source: "sam_entity",
    dedup_key: `sam_${uei}`,
    synced_to_instantly_at: null,
    instantly_campaign_id: null,
    instantly_lead_id: null,
    raw_json: entity,
    fetched_at: new Date().toISOString(),
  };
}

// ---- fetch helpers -------------------------------------------------------
function baseEntityParams(apiKey: string, certFilter: CertFilter): string[] {
  return [
    `api_key=${apiKey}`,
    `samRegistered=Yes`,
    `registrationStatus=A`,
    `purposeOfRegistrationCode=Z2`,
    `${certFilter.param}=${encodeURIComponent(certFilter.code)}`,
    `includeSections=entityRegistration,coreData,assertions,repsAndCerts,pointsOfContact`,
  ];
}

// ---- Extract (backfill) --------------------------------------------------
async function startExtract(apiKey: string, certFilter: CertFilter): Promise<string> {
  const url = `${SAM_BASE}?${baseEntityParams(apiKey, certFilter).join("&")}&format=json`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok && res.status !== 200 && res.status !== 202) {
    throw new Error(`extract start ${res.status}: ${text.slice(0, 300)}`);
  }
  let token: string | null = null;
  const tokenMatch = text.match(/token=([A-Za-z0-9_-]+)/);
  if (tokenMatch) token = tokenMatch[1];
  if (!token) {
    try {
      const j = JSON.parse(text);
      token = j.token || j.requestToken || j.fileToken ||
        (j.fileDownloadUrl && (j.fileDownloadUrl.match(/token=([^&\s]+)/) || [])[1]);
    } catch {}
  }
  if (!token) {
    throw new Error(`extract start: no token found in response: ${text.slice(0, 300)}`);
  }
  return token;
}

async function pollExtract(
  apiKey: string,
  token: string,
  cert: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const startTs = Date.now();
  let nextPoll = EXTRACT_POLL_INTERVAL_MS;
  while (Date.now() - startTs < EXTRACT_POLL_TIMEOUT_MS) {
    await sleep(nextPoll);
    const url = `${SAM_DOWNLOAD}?api_key=${apiKey}&token=${token}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [extract:${cert}] network error, retrying: ${msg}`);
      nextPoll = Math.min(nextPoll * 2, EXTRACT_POLL_MAX_MS);
      continue;
    }
    if (res.status === 200) {
      const buf = Buffer.from(await res.arrayBuffer());
      const ctype = res.headers.get("content-type") || "";
      return { buffer: buf, contentType: ctype };
    }
    if (res.status === 400) {
      const body = await res.text();
      if (/not generated yet|processing in progress|try again later/i.test(body)) {
        nextPoll = Math.min(Math.round(nextPoll * 1.5), EXTRACT_POLL_MAX_MS);
        continue;
      }
      throw new Error(`extract poll ${res.status}: ${body.slice(0, 300)}`);
    }
    const body = await res.text();
    throw new Error(`extract poll ${res.status}: ${body.slice(0, 300)}`);
  }
  throw new Error(`extract poll TIMEOUT after ${EXTRACT_POLL_TIMEOUT_MS / 1000}s for cert=${cert}`);
}

function parseExtractFile(buffer: Buffer, contentType: string): any[] {
  const ctype = (contentType || "").toLowerCase();
  const magicZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const magicGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;
  let jsonText: string;
  if (magicGzip || /gzip/.test(ctype)) {
    jsonText = zlib.gunzipSync(buffer).toString("utf-8");
  } else if (magicZip || /zip/.test(ctype)) {
    throw new Error("zip file format returned — unzip support not yet added");
  } else {
    jsonText = buffer.toString("utf-8");
  }
  const j = JSON.parse(jsonText);
  const entities = j.entityData || j.entities || (Array.isArray(j) ? j : null);
  if (!entities) {
    throw new Error(`parsed JSON has no entityData/entities array; keys=${Object.keys(j).slice(0, 10)}`);
  }
  return entities;
}

async function persistRawFile(
  supabase: SupabaseClient,
  cert: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const magicGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;
  const ext = magicGzip || /gzip/.test((contentType || "").toLowerCase()) ? "json.gz" : "json";
  const filename = `sam-entity-extract-${cert}-${tsStamp()}.${ext}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filename, buffer, {
    contentType: ext === "json.gz" ? "application/gzip" : "application/json",
    upsert: false,
  });
  if (error) {
    await supabase.storage.createBucket(STORAGE_BUCKET, { public: false }).catch(() => {});
    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, buffer, {
        contentType: ext === "json.gz" ? "application/gzip" : "application/json",
        upsert: false,
      })
      .catch(() => {});
  }
}

async function upsertRows(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<{ inserted: number; errors: number }> {
  if (!rows.length) return { inserted: 0, errors: 0 };
  let inserted = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { data, error } = await supabase
      .from("leads")
      .upsert(batch, { onConflict: "dedup_key", ignoreDuplicates: false })
      .select("id");
    if (error) {
      console.error(`  upsert error: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += data?.length || 0;
    }
  }
  return { inserted, errors };
}

// ---- Paginated (delta) ---------------------------------------------------
async function fetchPage(
  apiKey: string,
  certFilter: CertFilter,
  page: number,
  lastUpdateFrom: string | null,
): Promise<{ entities: any[] }> {
  const parts = baseEntityParams(apiKey, certFilter);
  parts.push(`page=${page}`, `size=${PAGE_SIZE}`);
  if (lastUpdateFrom) parts.push(`lastUpdateDate=${lastUpdateFrom}`);
  const url = `${SAM_BASE}?${parts.join("&")}`;
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok) throw new Error(`SAM ${res.status} page=${page}: ${body.slice(0, 200)}`);
  const json = JSON.parse(body);
  return { entities: json.entityData || json.entities || [] };
}

// ---- public API ----------------------------------------------------------
/**
 * PR 1a: signature updated to accept `cursor` and return `DrainResult`.
 *
 * Behavior is unchanged from the previous single-pass implementation — every
 * invocation completes the full ingest (delta paginates through its own loop
 * inline; backfill waits for the Extract file). Therefore every return path
 * reports `done: true, next_cursor: null`. PR 1b replaces the inline loops
 * with bounded per-tick work + a real cursor so the orchestrator can drain
 * across many ticks.
 *
 * `weekly_sweep` is accepted as an alias for backfill in PR 1a (no
 * distinction until PR 1b routes it).
 */
export async function ingest(
  opts: { cert: string; mode: PipelineMode; cursor?: StageCursor },
): Promise<DrainResult> {
  const { cert, mode } = opts;
  // cursor is intentionally ignored in PR 1a; wired for orchestrator parity only.
  void opts.cursor;

  const filter = CERT_FILTERS.find((c) => c.cert === cert);
  if (!filter) {
    return {
      done: true,
      next_cursor: null,
      requests: 0,
      inserted: 0,
      skipped: true,
      reason: `no filter for cert=${cert}`,
    };
  }
  const apiKey = process.env.SAM_API_KEY_INGEST || process.env.SAM_API_KEY;
  if (!apiKey) throw new Error("SAM_API_KEY_INGEST or SAM_API_KEY required");

  const supabase = pipelineSupabase();

  if (mode === "delta") {
    const since = new Date(Date.now() - DELTA_LOOKBACK_DAYS * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const lastUpdateFrom = `${pad(since.getMonth() + 1)}/${pad(since.getDate())}/${since.getFullYear()}`;
    console.log(`  [delta:${cert}] since ${lastUpdateFrom}`);

    const rows: Record<string, unknown>[] = [];
    let requests = 0;
    for (let page = 0; page < DELTA_MAX_PAGES; page++) {
      const { entities } = await fetchPage(apiKey, filter, page, lastUpdateFrom);
      requests += 1;
      if (!entities.length) break;
      for (const e of entities) {
        const row = toLeadRow(e);
        if (row) rows.push(row);
      }
      if (entities.length < PAGE_SIZE) break;
      // Cap pacing so we never blow the 300s route budget during delta.
      // Delta runs are typically <5 pages for HUBZone daily.
      await sleep(Math.min(PAGINATED_INTERVAL_MS, 20_000));
    }
    const { inserted } = await upsertRows(supabase, rows);
    return { done: true, next_cursor: null, requests, inserted };
  }

  // backfill (also weekly_sweep in PR 1a — same code path until PR 1b)
  let requests = 0;
  const token = await startExtract(apiKey, filter);
  requests += 1;
  const { buffer, contentType } = await pollExtract(apiKey, token, cert);
  requests += 1;
  await persistRawFile(supabase, cert, buffer, contentType);
  const entities = parseExtractFile(buffer, contentType);
  const rows: Record<string, unknown>[] = [];
  for (const e of entities) {
    const row = toLeadRow(e);
    if (row) rows.push(row);
  }
  const { inserted } = await upsertRows(supabase, rows);
  return { done: true, next_cursor: null, requests, inserted };
}
