/**
 * SBS (Small Business Search) enrichment — ported from
 * workers/jobs/enrich-leads-via-sbs.js.
 *
 * SBS's search.certifications.sba.gov backend is a plain JSON API, not a
 * React SPA under a login. No puppeteer needed — direct fetch + 2.5s
 * pacing, scoped to the batch size the orchestrator hands us.
 */

import { pipelineSupabase } from "./supabase";

const SBS_URL = "https://search.certifications.sba.gov/_api/v2/search";
const DELAY_MS = 2500;
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

export async function enrich(
  opts: { cert: string; batchSize?: number },
): Promise<{ processed: number; enriched: number }> {
  const supabase = pipelineSupabase();
  const limit = opts.batchSize ?? parseInt(process.env.SBS_LIMIT || "50", 10);

  // cert-scoped queue: leads of this primary_cert still missing email
  // after crawl. Matches enrich-leads-via-sbs.js semantics but bounded by
  // `cert` so the orchestrator only enriches its active cert.
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, uei, company, entity_url, crawl_status, email")
    .eq("ingest_tier", "primary")
    .eq("primary_cert", opts.cert)
    .is("email", null)
    .in("crawl_status", ["no_email", "fetch_fail", "robots_disallow", "skip_social_media"])
    .not("uei", "is", null)
    .limit(limit);
  if (error) throw new Error(`supabase read: ${error.message}`);
  if (!leads?.length) return { processed: 0, enriched: 0 };

  let enriched = 0;
  let processed = 0;
  for (const lead of leads) {
    processed += 1;
    try {
      const r = await sbsLookup(lead.uei);
      if (r.ok && r.results.length) {
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
        if (cand && !("reject" in cand)) {
          const tag = qualityTag(cand.score);
          if (tag) {
            update.email = cand.email;
            update.email_quality = tag.quality;
            update.email_source = tag.source;
            enriched += 1;
          }
        }
        if (Object.keys(update).length) {
          const { error: uerr } = await supabase.from("leads").update(update).eq("id", lead.id);
          if (uerr) console.error(`  update ${lead.uei}: ${uerr.message}`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  sbs ${lead.uei} FAIL: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  return { processed, enriched };
}
