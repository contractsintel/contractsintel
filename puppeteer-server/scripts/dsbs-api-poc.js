#!/usr/bin/env node
/**
 * DSBS / SBS direct-API proof-of-concept.
 *
 * Supersedes dsbs-poc.js (Patchright-based, kept only for reference).
 *
 * Key discovery on 2026-04-24
 * ---------------------------
 * https://search.certifications.sba.gov/ ships a same-origin public JSON API
 * at POST /_api/v2/search. Passing `sbaCertifications.activeCerts` with the
 * internal cert codes returns the COMPLETE set of matching firms in ONE
 * response — no pagination, no auth, no WAF issues. Each row includes email,
 * UEI, CAGE, contact_person, address, phone, website, capabilities_narrative,
 * naics_primary, naics_all_codes[], and a full set of `active_*_boolean`
 * cert flags so we can derive cert_types[] in a single pass.
 *
 * Cert codes (recovered from the SPA bundle)
 * ------------------------------------------
 *   "1,4" — 8(a) or 8(a) Joint Venture
 *   "3"   — HUBZone
 *   "5"   — Women-Owned Small Business (WOSB)
 *   "6"   — Economically-Disadvantaged WOSB (EDWOSB)
 *   "9,10" — Veteran-Owned Small Business (VOSB)  [we don't target VOSB; SDVOSB is a self_* flag]
 *
 * What this POC does
 * ------------------
 * 1. POSTs a single HUBZone-filtered search against /_api/v2/search.
 * 2. Maps the first 100 results to the `leads` table schema.
 * 3. --dry-run (default): prints a quality breakdown and first-3 mapped rows.
 * 4. --write: upserts the 100 rows into `leads` with source='dsbs_poc'
 *    (NOT 'dsbs') so they are trivially filterable / deletable relative to
 *    whatever the production scraper eventually writes.
 *
 * Usage
 * -----
 *   node scripts/dsbs-api-poc.js                 # dry-run, 100 HUBZone rows
 *   node scripts/dsbs-api-poc.js --write         # upsert to leads (dsbs_poc)
 *   node scripts/dsbs-api-poc.js --limit=500     # bigger sample
 *   node scripts/dsbs-api-poc.js --cert=HUBZone|8a|WOSB|EDWOSB
 *
 * Env (only for --write)
 * ----------------------
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

"use strict";

const ARGS = process.argv.slice(2);
const flag = (n) => ARGS.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const optVal = (n, d) => {
  const m = ARGS.find((a) => a.startsWith(`--${n}=`));
  return m ? m.split("=")[1] : d;
};

const DRY_RUN = !flag("write");
const LIMIT = parseInt(optVal("limit", "100"), 10);
const CERT = optVal("cert", "HUBZone");

const API_URL = "https://search.certifications.sba.gov/_api/v2/search";

const CERT_CODES = {
  HUBZone: { value: "3", label: "HUBZone" },
  "8a": { value: "1,4", label: "8(a) or 8(a) Joint Venture" },
  WOSB: { value: "5", label: "Women-Owned Small Business (WOSB)" },
  EDWOSB: {
    value: "6",
    label: "Economically-Disadvantaged Women-Owned Small Business (EDWOSB)",
  },
};

const CERT_FLAG_TO_NAME = {
  active_hz_boolean: "hubzone",
  active_8a_boolean: "8a",
  active_8a_jv_boolean: "8a",
  active_wosb_boolean: "wosb",
  active_edwosb_boolean: "edwosb",
  active_sdvosb_boolean: "sdvosb",
  active_sdvosb_jv_boolean: "sdvosb",
  active_vosb_boolean: "vosb",
  active_vosb_jv_boolean: "vosb",
};

// Priority order, per product direction 2026-04-24:
// HUBZone > SDVOSB > 8a > WOSB > EDWOSB.
const CERT_PRIORITY = ["hubzone", "sdvosb", "8a", "wosb", "edwosb"];

function buildBody(certCode) {
  return {
    searchProfiles: { searchTerm: "" },
    location: { states: [], zipCodes: [], counties: [], districts: [], msas: [] },
    sbaCertifications: {
      activeCerts: [certCode], // { label, value }
      isPreviousCert: false,
      operatorType: "Or",
    },
    naics: { codes: [], isPrimary: false, operatorType: "Or" },
    selfCertifications: { certifications: [], operatorType: "Or" },
    keywords: { list: [], operatorType: "Or" },
    lastUpdated: { date: { label: "Anytime", value: "anytime" } },
    samStatus: { isActiveSAM: false },
    qualityAssuranceStandards: { qas: [] },
    bondingLevels: {
      constructionIndividual: "",
      constructionAggregate: "",
      serviceIndividual: "",
      serviceAggregate: "",
    },
    businessSize: { relationOperator: "at-least", numberOfEmployees: "" },
    annualRevenue: { relationOperator: "at-least", annualGrossRevenue: "" },
    entityDetailId: "",
  };
}

async function fetchCertUniverse(certName) {
  const code = CERT_CODES[certName];
  if (!code) throw new Error(`unknown cert: ${certName}`);
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://search.certifications.sba.gov",
      Referer: "https://search.certifications.sba.gov/advanced?page=0",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(buildBody(code)),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`_api/v2/search HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return { results: json.results || [], filter: json.meili_filter || null };
}

function splitName(full) {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function deriveCerts(row) {
  const set = new Set();
  for (const [flag, name] of Object.entries(CERT_FLAG_TO_NAME)) {
    if (row[flag]) set.add(name);
  }
  return [...set];
}

function primaryCert(certs) {
  for (const c of CERT_PRIORITY) if (certs.includes(c)) return c;
  return certs[0] || null;
}

function rowToLead(row) {
  const email = (row.email || "").toLowerCase().trim();
  const uei = row.uei || null;
  if (!uei && !email) return null;

  const certs = deriveCerts(row);
  const { first_name, last_name } = splitName(row.contact_person);
  const dedup_key = (uei || email).toLowerCase();

  return {
    email: email || null,
    first_name,
    last_name,
    title: null,
    phone: row.phone || null,
    company: row.legal_business_name || row.dba_name || null,
    address: [row.address_1, row.address_2].filter(Boolean).join(" ") || null,
    city: row.city || null,
    state: row.state || null,
    zip: row.zipcode || null,
    uei,
    cage_code: row.cage_code || null,
    entity_url: row.website || row.additional_website || null,
    cert_types: certs,
    primary_cert: primaryCert(certs),
    naics_codes: row.naics_all_codes || (row.naics_primary ? [row.naics_primary] : []),
    source: "dsbs_poc",
    source_url: `https://dsbs.sba.gov/search/dsp_profile.cfm?SAM_UEI=${uei}`,
    dedup_key,
  };
}

async function writeBatch(rows) {
  if (DRY_RUN) {
    console.log(`[dry-run] would upsert ${rows.length} rows to leads (source='dsbs_poc')`);
    return { inserted: 0, skipped: rows.length };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required for --write");
  }
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("leads")
    .upsert(rows, { onConflict: "dedup_key", ignoreDuplicates: false })
    .select("id");
  if (error) {
    console.error(`[upsert] error: ${error.message}`);
    return { inserted: 0, skipped: rows.length };
  }
  return { inserted: data?.length || 0, skipped: 0 };
}

async function main() {
  console.log(`[dsbs-api-poc] mode=${DRY_RUN ? "dry-run" : "WRITE"} cert=${CERT} limit=${LIMIT}`);
  const t0 = Date.now();
  const { results, filter } = await fetchCertUniverse(CERT);
  const apiMs = Date.now() - t0;
  console.log(`[api] HTTP 200 in ${apiMs}ms — ${results.length} total rows (filter: ${filter})`);

  const slice = results.slice(0, LIMIT);
  const leads = slice.map(rowToLead).filter(Boolean);

  const withEmail = leads.filter((l) => l.email).length;
  const multiCert = leads.filter((l) => (l.cert_types || []).length > 1).length;

  console.log(`\n=== POC sample (${leads.length} of ${results.length}) ===`);
  console.log(`  with email:   ${withEmail} (${((100 * withEmail) / leads.length).toFixed(1)}%)`);
  console.log(`  multi-cert:   ${multiCert} (${((100 * multiCert) / leads.length).toFixed(1)}%)`);

  const preview = leads.slice(0, 3).map((l) => ({
    company: l.company,
    contact: [l.first_name, l.last_name].filter(Boolean).join(" "),
    email: l.email,
    city_state: [l.city, l.state].filter(Boolean).join(", "),
    cert_types: l.cert_types,
    primary_cert: l.primary_cert,
    uei: l.uei,
  }));
  console.log("\nfirst 3 mapped rows:");
  console.log(JSON.stringify(preview, null, 2));

  const { inserted, skipped } = await writeBatch(leads);
  console.log(`\nwrite: inserted=${inserted} skipped=${skipped}`);
  console.log(`mode was: ${DRY_RUN ? "dry-run (no DB writes)" : "WRITE"}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
