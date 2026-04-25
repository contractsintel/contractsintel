/**
 * DSBS / SBS direct-API scraper helpers.
 *
 * Shared by the daily delta cron (/api/cron/dsbs-delta) and the weekly full
 * sweep cron (/api/cron/dsbs-weekly-sweep). The one-shot CLI version lives
 * at puppeteer-server/scripts/dsbs-full-universe.js — this module is a
 * TypeScript port of its data-shape and mapping logic, factored so the cron
 * routes can call into it without spawning a Node subprocess.
 *
 * The endpoint (POST https://search.certifications.sba.gov/_api/v2/search)
 * is a same-origin public JSON API, no auth, no pagination — one POST per
 * cert returns the entire universe matching that filter. See
 * docs/architecture/dsbs-scraper-plan.md §2 for discovery notes.
 */

export type DsbsCertName = "8a" | "HUBZone" | "WOSB" | "EDWOSB" | "SDVOSB";

export type DsbsCertCode = {
  value: string;
  label: string;
  slug: "8a" | "hubzone" | "wosb" | "edwosb" | "sdvosb";
};

// Cert codes recovered from the SPA bundle and verified live 2026-04-24.
// SDVOSB="9,10" — the codes are service-disabled by definition; VOSB is "7,8".
export const CERT_CODES: Record<DsbsCertName, DsbsCertCode> = {
  "8a": { value: "1,4", label: "8(a) or 8(a) Joint Venture", slug: "8a" },
  HUBZone: { value: "3", label: "HUBZone", slug: "hubzone" },
  WOSB: {
    value: "5",
    label: "Women-Owned Small Business (WOSB)",
    slug: "wosb",
  },
  EDWOSB: {
    value: "6",
    label: "Economically-Disadvantaged Women-Owned Small Business (EDWOSB)",
    slug: "edwosb",
  },
  SDVOSB: {
    value: "9,10",
    label: "Service-Disabled Veteran-Owned Small Business (SDVOSB)",
    slug: "sdvosb",
  },
};

// Map the boolean flags every API row carries → our internal cert slug.
const CERT_FLAG_TO_NAME: Record<string, string> = {
  active_hz_boolean: "hubzone",
  active_8a_boolean: "8a",
  active_8a_jv_boolean: "8a",
  active_wosb_boolean: "wosb",
  active_edwosb_boolean: "edwosb",
  active_sdvosb_boolean: "sdvosb",
  active_sdvosb_jv_boolean: "sdvosb",
  // VOSB tracked for completeness; not one of our 5 routing targets.
  active_vosb_boolean: "vosb",
  active_vosb_jv_boolean: "vosb",
};

// Product-locked routing priority, 2026-04-24.
export const CERT_PRIORITY: ReadonlyArray<string> = [
  "hubzone",
  "sdvosb",
  "8a",
  "wosb",
  "edwosb",
];

const API_URL = "https://search.certifications.sba.gov/_api/v2/search";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Raw row shape from the SBS API. Only fields we read are typed; the API
// returns more.
export type DsbsApiRow = {
  uei?: string | null;
  cage_code?: string | null;
  email?: string | null;
  contact_person?: string | null;
  legal_business_name?: string | null;
  dba_name?: string | null;
  phone?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  county?: string | null;
  website?: string | null;
  additional_website?: string | null;
  naics_primary?: string | null;
  naics_all_codes?: string[] | null;
  keywords?: string[] | null;
  capabilities_narrative?: string | null;
  year_established?: string | number | null;
  annual_revenue?: string | null;
  business_size?: string | null;
  // Boolean cert flags — `[k: string]: any` would loosen the type too much,
  // so we keep an index signature scoped to the flag columns.
  [k: `active_${string}_boolean`]: boolean | undefined;
};

export type DsbsLead = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: null;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  uei: string | null;
  cage_code: string | null;
  entity_url: string | null;
  cert_types: string[];
  primary_cert: string | null;
  naics_codes: string[];
  source: "dsbs";
  source_url: string | null;
  dedup_key: string;
  capabilities_narrative: string | null;
  naics_primary: string | null;
  year_established: number | null;
  keywords: string[];
  county: string | null;
  annual_revenue: string | null;
  business_size: string | null;
  enriched_at: string;
};

function buildBody(certCode: DsbsCertCode) {
  return {
    searchProfiles: { searchTerm: "" },
    location: {
      states: [],
      zipCodes: [],
      counties: [],
      districts: [],
      msas: [],
    },
    sbaCertifications: {
      activeCerts: [{ label: certCode.label, value: certCode.value }],
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

export async function fetchCertUniverse(
  certName: DsbsCertName,
): Promise<{ results: DsbsApiRow[]; filter: string | null; ms: number }> {
  const code = CERT_CODES[certName];
  if (!code) throw new Error(`unknown cert: ${certName}`);
  const t0 = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://search.certifications.sba.gov",
      Referer: "https://search.certifications.sba.gov/advanced?page=0",
      "User-Agent": UA,
    },
    body: JSON.stringify(buildBody(code)),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `_api/v2/search HTTP ${res.status} (${certName}): ${body.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as { results?: DsbsApiRow[]; meili_filter?: string };
  return {
    results: json.results ?? [],
    filter: json.meili_filter ?? null,
    ms,
  };
}

// ---- sanitization helpers (mirror dsbs-full-universe.js) -----------------

export function cleanEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let e = String(raw).toLowerCase().trim();
  e = e.replace(/^[\s?;,<>"']+/, "").replace(/[\s?;,<>"']+$/, "");
  return e || null;
}

function splitName(full: string | null | undefined): {
  first_name: string | null;
  last_name: string | null;
} {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

// Postgres text columns reject NUL bytes. DSBS narrative/keyword fields
// occasionally contain them.
function scrubStr<T>(s: T): T {
  if (s === null || s === undefined) return s;
  if (typeof s !== "string") return s;
  return s.replace(/\u0000/g, "") as unknown as T;
}
function scrubArr<T>(a: T[] | null | undefined): T[] {
  if (!Array.isArray(a)) return [];
  return a.map((x) => (typeof x === "string" ? scrubStr(x) : x)) as T[];
}

function cleanCounty(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^Geocoding service error/i.test(s)) return null;
  return s;
}

function yearToInt(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1700 || n > 2100) return null;
  return n;
}

export function deriveCerts(row: DsbsApiRow): Set<string> {
  const set = new Set<string>();
  for (const [fl, name] of Object.entries(CERT_FLAG_TO_NAME)) {
    if ((row as Record<string, unknown>)[fl]) set.add(name);
  }
  return set;
}

export function primaryCert(certSet: Set<string>): string | null {
  for (const c of CERT_PRIORITY) if (certSet.has(c)) return c;
  return null;
}

export function keyFor(row: DsbsApiRow): string | null {
  const uei = (row.uei ?? "").trim();
  const email = (row.email ?? "").trim().toLowerCase();
  const k = uei || email;
  return k ? k.toLowerCase() : null;
}

/** Map a merged record (one row + union cert set) to a `leads` upsert payload. */
export function recordToLead(
  row: DsbsApiRow,
  certSet: Set<string>,
  nowIso: string = new Date().toISOString(),
): DsbsLead | null {
  const email = cleanEmail(row.email);
  const uei = row.uei ?? null;
  if (!uei && !email) return null;

  const { first_name, last_name } = splitName(scrubStr(row.contact_person ?? null));
  const certs = Array.from(certSet);
  const pc = primaryCert(certSet);
  const dedup_key = (uei || (email as string)).toLowerCase();

  const naicsAll = Array.isArray(row.naics_all_codes) ? row.naics_all_codes : [];
  const naicsPrimary =
    row.naics_primary || (naicsAll.length ? naicsAll[0] : null);
  const naicsCodes = naicsAll.length
    ? naicsAll
    : naicsPrimary
    ? [naicsPrimary]
    : [];

  return {
    email,
    first_name: scrubStr(first_name),
    last_name: scrubStr(last_name),
    title: null,
    phone: scrubStr(row.phone) || null,
    company: scrubStr(row.legal_business_name || row.dba_name) || null,
    address:
      scrubStr([row.address_1, row.address_2].filter(Boolean).join(" ")) ||
      null,
    city: scrubStr(row.city) || null,
    state: scrubStr(row.state) || null,
    zip: scrubStr(row.zipcode) || null,
    uei,
    cage_code: scrubStr(row.cage_code) || null,
    entity_url: scrubStr(row.website || row.additional_website) || null,
    cert_types: certs,
    primary_cert: pc,
    naics_codes: scrubArr(naicsCodes),
    source: "dsbs",
    source_url: uei
      ? `https://dsbs.sba.gov/search/dsp_profile.cfm?SAM_UEI=${uei}`
      : null,
    dedup_key,
    capabilities_narrative: scrubStr(row.capabilities_narrative) || null,
    naics_primary: scrubStr(naicsPrimary) || null,
    year_established: yearToInt(row.year_established),
    keywords: scrubArr(Array.isArray(row.keywords) ? row.keywords : []),
    county: scrubStr(cleanCounty(row.county)),
    annual_revenue: scrubStr(row.annual_revenue) || null,
    business_size: scrubStr(row.business_size) || null,
    enriched_at: nowIso,
  };
}

/**
 * Sweep a list of certs, dedup by UEI/email across sweeps, and return the
 * mapped lead rows plus per-cert telemetry.
 *
 * `pauseMs` is courtesy delay between cert API calls (the endpoint is fine
 * with no pause; 2.5s matches the CLI script).
 */
export async function sweepCerts(
  certs: DsbsCertName[],
  opts: { pauseMs?: number } = {},
): Promise<{
  leads: DsbsLead[];
  perCert: Array<{
    cert: DsbsCertName;
    slug: string;
    rows_fetched: number;
    with_email: number;
    new_unique_firms: number;
    merged_into_existing: number;
    api_ms: number;
    started_at: string;
    completed_at: string;
  }>;
  totalFetched: number;
}> {
  const pauseMs = opts.pauseMs ?? 2_500;
  const seen = new Map<
    string,
    { row: DsbsApiRow; certSet: Set<string> }
  >();
  const perCert: Array<{
    cert: DsbsCertName;
    slug: string;
    rows_fetched: number;
    with_email: number;
    new_unique_firms: number;
    merged_into_existing: number;
    api_ms: number;
    started_at: string;
    completed_at: string;
  }> = [];
  let totalFetched = 0;

  for (let i = 0; i < certs.length; i++) {
    const certName = certs[i];
    const startedAt = new Date().toISOString();
    const { results, ms } = await fetchCertUniverse(certName);

    let newKeys = 0;
    let dupMerges = 0;
    let withEmail = 0;
    for (const r of results) {
      if (r.email) withEmail++;
      const key = keyFor(r);
      if (!key) continue;
      const certs = deriveCerts(r);
      const existing = seen.get(key);
      if (existing) {
        certs.forEach((c) => existing.certSet.add(c));
        dupMerges++;
      } else {
        seen.set(key, { row: r, certSet: certs });
        newKeys++;
      }
    }

    perCert.push({
      cert: certName,
      slug: CERT_CODES[certName].slug,
      rows_fetched: results.length,
      with_email: withEmail,
      new_unique_firms: newKeys,
      merged_into_existing: dupMerges,
      api_ms: ms,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });
    totalFetched += results.length;

    if (i < certs.length - 1 && pauseMs > 0) {
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  }

  const nowIso = new Date().toISOString();
  const leads: DsbsLead[] = [];
  seen.forEach((rec) => {
    const lead = recordToLead(rec.row, rec.certSet, nowIso);
    if (lead) leads.push(lead);
  });
  return { leads, perCert, totalFetched };
}

/**
 * Field-level diff for delta-detection. Returns the set of changed fields
 * between an existing leads row and the freshly mapped DSBS row. Only
 * compares fields the DSBS scraper owns — leaves NeverBounce-managed
 * verification fields, instantly_*, and any user-edited fields untouched.
 *
 * Returns null when nothing changed (caller can skip the update).
 */
export const TRACKED_FIELDS = [
  "email",
  "first_name",
  "last_name",
  "phone",
  "company",
  "address",
  "city",
  "state",
  "zip",
  "cage_code",
  "entity_url",
  "cert_types",
  "primary_cert",
  "naics_codes",
  "source_url",
  "capabilities_narrative",
  "naics_primary",
  "year_established",
  "keywords",
  "county",
  "annual_revenue",
  "business_size",
] as const satisfies ReadonlyArray<keyof DsbsLead>;

export type TrackedField = (typeof TRACKED_FIELDS)[number];

function arrEq(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  if (a.length !== b.length) return false;
  // Order-insensitive for cert_types / naics_codes / keywords.
  const sa = [...a].map(String).sort();
  const sb = [...b].map(String).sort();
  return sa.every((v, i) => v === sb[i]);
}

export function diffLead(
  existing: Record<string, unknown>,
  fresh: DsbsLead,
): TrackedField[] | null {
  const changed: TrackedField[] = [];
  for (const f of TRACKED_FIELDS) {
    const a = existing[f];
    const b = (fresh as Record<string, unknown>)[f];
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!arrEq(a, b)) changed.push(f);
    } else if ((a ?? null) !== (b ?? null)) {
      changed.push(f);
    }
  }
  return changed.length ? changed : null;
}
