/**
 * Pure data layer for the ops digest. Each section helper is independently
 * testable; fetchDigestData() composes them.
 *
 * See docs/architecture/pr4-digest-email-plan.md §5.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { rollup } from "@/lib/health/runner";
import type {
  HealthCheck,
  HealthCheckName,
  HealthStatus,
} from "@/lib/health/types";
import { nbCredits } from "@/lib/pipeline/verify-submit";
import { renderSparkline } from "./sparkline";
import type {
  CertProgress,
  CriticalAlert,
  CriticalItems,
  DigestData,
  HealthCheckRow,
  HealthHeader,
  ResourceItem,
  ScrapingRow,
  ScrapingSummary,
  SparklineRow,
  RollupStatus,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const ALL_CHECK_NAMES: readonly HealthCheckName[] = [
  "cron_coverage",
  "p_route_timeouts",
  "sam_sbs_failures",
  "supabase_health",
  "unacked_cron_alerts",
  "neverbounce_credits",
  "pipeline_stalls",
];

export interface FetchOpts {
  now?: Date;
  certs?: readonly string[];
}

const DEFAULT_CERTS = ["8a", "wosb", "edwosb", "hubzone", "sdvosb", "vosb"] as const;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function ymdUtc(d: Date): string {
  return startOfUtcDay(d).toISOString().slice(0, 10);
}

/* ---------- §1 Health header ---------- */

export async function fetchHealthHeader(
  supabase: SupabaseClient,
  now: Date,
): Promise<HealthHeader> {
  const startToday = startOfUtcDay(now);
  const startYesterday = new Date(startToday.getTime() - DAY_MS);

  const today = await supabase
    .from("health_checks")
    .select("run_id, check_name, status, metric, threshold, details, created_at")
    .gte("created_at", startToday.toISOString())
    .order("created_at", { ascending: false });

  let rows = today.data ?? [];
  let stale = false;
  if (!rows.length) {
    const fallback = await supabase
      .from("health_checks")
      .select("run_id, check_name, status, metric, threshold, details, created_at")
      .gte("created_at", startYesterday.toISOString())
      .lt("created_at", startToday.toISOString())
      .order("created_at", { ascending: false });
    rows = fallback.data ?? [];
    stale = true;
  }

  if (!rows.length) {
    return {
      rollup: "stale",
      runId: null,
      date: ymdUtc(now),
      greenCount: 0,
      totalCount: ALL_CHECK_NAMES.length,
      stale: true,
      checks: [],
    };
  }

  // Pick latest run_id and filter to it.
  const latestRunId: string = rows[0].run_id;
  const latest = rows.filter((r) => r.run_id === latestRunId);

  const checks: HealthCheckRow[] = latest.map((r) => ({
    name: r.check_name as HealthCheckName,
    status: r.status as HealthStatus,
    metric: r.metric ?? null,
    threshold: r.threshold ?? null,
    details: r.details ?? null,
    created_at: r.created_at,
  }));

  // Build a synthetic HealthCheck array so rollup() honors criticalOnError.
  // We don't have per-check criticalOnError flags here; use a conservative
  // approximation: supabase_health and cron_coverage are critical (matches
  // PR 3 plan). Anything else falls back to default.
  const criticalNames = new Set<HealthCheckName>([
    "supabase_health",
    "cron_coverage",
  ]);
  const synthetic: HealthCheck[] = checks.map((c) => ({
    name: c.name,
    criticalOnError: criticalNames.has(c.name),
    run: async () => ({
      name: c.name,
      status: c.status,
      durationMs: 0,
    }),
  }));
  const overallRollup = rollup(
    checks.map((c) => ({
      name: c.name,
      status: c.status,
      durationMs: 0,
    })),
    synthetic,
  );

  const rollupOut: RollupStatus = stale ? "stale" : overallRollup;

  return {
    rollup: rollupOut,
    runId: latestRunId,
    date: ymdUtc(now),
    greenCount: checks.filter((c) => c.status === "green").length,
    totalCount: checks.length || ALL_CHECK_NAMES.length,
    stale,
    checks,
  };
}

/* ---------- §2 Critical items ---------- */

const CRITICAL_ALERT_CAP = 20;

export async function fetchCriticalItems(
  supabase: SupabaseClient,
  now: Date,
  healthChecks: readonly HealthCheckRow[],
): Promise<CriticalItems> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const res = await supabase
    .from("cron_alerts")
    .select("id, severity, source, message, created_at, run_id")
    .in("severity", ["error", "critical"])
    .is("acked_at", null)
    .gte("created_at", sevenDaysAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  const all = (res.data ?? []) as CriticalAlert[];
  const capped = all.length > CRITICAL_ALERT_CAP;
  const alerts = all.slice(0, CRITICAL_ALERT_CAP);
  const reds = healthChecks.filter(
    (c) => c.status === "red" || c.status === "error",
  );
  return { alerts, reds, capped };
}

/* ---------- §3 Scraping summary ---------- */

export async function fetchScrapingSummary(
  supabase: SupabaseClient,
  now: Date,
): Promise<ScrapingSummary> {
  const startToday = startOfUtcDay(now);
  const startYesterday = new Date(startToday.getTime() - DAY_MS);
  const res = await supabase
    .from("scraper_runs")
    .select("source, status, opportunities_found, matches_created, started_at")
    .gte("started_at", startYesterday.toISOString())
    .lt("started_at", startToday.toISOString());

  const data = res.data ?? [];
  const bySource = new Map<string, ScrapingRow>();
  for (const r of data) {
    const src = (r.source as string) || "unknown";
    let row = bySource.get(src);
    if (!row) {
      row = { source: src, runs: 0, ok: 0, fail: 0, opps: 0, matches: 0 };
      bySource.set(src, row);
    }
    row.runs += 1;
    const ok = r.status === "success" || r.status === "ok";
    if (ok) row.ok += 1;
    else row.fail += 1;
    row.opps += Number(r.opportunities_found ?? 0);
    row.matches += Number(r.matches_created ?? 0);
  }

  const rows = Array.from(bySource.values()).sort(
    (a, b) => b.fail - a.fail || b.runs - a.runs,
  );
  const totals = rows.reduce(
    (acc, r) => {
      acc.totalRuns += r.runs;
      acc.totalOk += r.ok;
      acc.totalFail += r.fail;
      acc.totalOpps += r.opps;
      acc.totalMatches += r.matches;
      return acc;
    },
    { totalRuns: 0, totalOk: 0, totalFail: 0, totalOpps: 0, totalMatches: 0 },
  );

  return { rows, ...totals };
}

/* ---------- §4 Cert pipeline progress ---------- */

export async function fetchCertProgress(
  supabase: SupabaseClient,
  now: Date,
  certs: readonly string[] = DEFAULT_CERTS,
): Promise<CertProgress[]> {
  const startToday = startOfUtcDay(now);
  const startYesterday = new Date(startToday.getTime() - DAY_MS);

  const stateRes = await supabase
    .from("cert_queue_state")
    .select("cert, stage, stage_started_at, last_tick_at, mode, rows_this_stage, last_error");
  const stateRows = stateRes.data ?? [];

  const out: CertProgress[] = [];
  for (const cert of certs) {
    const st = stateRows.find((r) => r.cert === cert);
    const verifiedRes = await supabase
      .from("leads")
      .select("primary_cert", { count: "exact", head: true })
      .eq("primary_cert", cert)
      .eq("email_verification_status", "valid")
      .gte("updated_at", startYesterday.toISOString())
      .lt("updated_at", startToday.toISOString());
    const cumulativeRes = await supabase
      .from("leads")
      .select("primary_cert", { count: "exact", head: true })
      .eq("primary_cert", cert)
      .eq("email_verification_status", "valid");
    const universeRes = await supabase
      .from("leads")
      .select("primary_cert", { count: "exact", head: true })
      .eq("primary_cert", cert);

    out.push({
      cert,
      stage: st?.stage ?? null,
      stageStartedAt: st?.stage_started_at ?? null,
      lastTickAt: st?.last_tick_at ?? null,
      mode: st?.mode ?? null,
      rowsThisStage: st?.rows_this_stage ?? null,
      lastError: st?.last_error ?? null,
      verifiedYesterday: verifiedRes.count ?? 0,
      cumulative: cumulativeRes.count ?? 0,
      universe: universeRes.count ?? 0,
    });
  }
  return out;
}

/* ---------- §5 Resources ---------- */

export async function fetchResources(
  supabase: SupabaseClient,
): Promise<ResourceItem[]> {
  const items: ResourceItem[] = [];

  // NeverBounce credits
  let nb: number | null = null;
  try {
    nb = await nbCredits();
  } catch {
    nb = null;
  }
  items.push({
    label: "NeverBounce credits",
    value: nb === null ? "(unavailable)" : nb.toLocaleString(),
    status: nb === null ? "unknown" : nb < 5000 ? "yellow" : "green",
  });

  // Latest supabase_health
  const sb = await supabase
    .from("health_checks")
    .select("status, metric, created_at, details")
    .eq("check_name", "supabase_health")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sb.data) {
    items.push({
      label: "Supabase round-trip",
      value: sb.data.metric != null ? `${sb.data.metric}ms` : "(unknown)",
      status: (sb.data.status as HealthStatus) ?? "unknown",
    });
  } else {
    items.push({ label: "Supabase round-trip", value: "(unavailable)", status: "unknown" });
  }

  // Latest sam_sbs_failures
  const sam = await supabase
    .from("health_checks")
    .select("status, metric, details, created_at")
    .eq("check_name", "sam_sbs_failures")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sam.data) {
    items.push({
      label: "SAM/DSBS failure rate",
      value:
        sam.data.metric != null
          ? `${(Number(sam.data.metric) * 100).toFixed(1)}%`
          : "(unknown)",
      status: (sam.data.status as HealthStatus) ?? "unknown",
    });
  } else {
    items.push({ label: "SAM/DSBS failure rate", value: "(unavailable)", status: "unknown" });
  }

  return items;
}

/* ---------- §6 Sparklines ---------- */

export async function fetchSparklines(
  supabase: SupabaseClient,
  now: Date,
): Promise<SparklineRow[]> {
  const sevenDaysAgo = new Date(
    startOfUtcDay(now).getTime() - 6 * DAY_MS,
  );
  const res = await supabase
    .from("health_checks")
    .select("check_name, status, created_at")
    .gte("created_at", sevenDaysAgo.toISOString())
    .order("created_at", { ascending: true });

  const rows = (res.data ?? []) as { check_name: string; status: HealthStatus; created_at: string }[];
  const map = renderSparkline(rows, 7, now);
  return ALL_CHECK_NAMES.map((name) => ({
    name,
    chars: map.get(name) ?? "       ",
  }));
}

/* ---------- §7 Links ---------- */

function buildLinks(): DigestData["links"] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const refMatch = supabaseUrl.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  const ref = refMatch ? refMatch[1] : "";
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://contractsintel.com";

  let healthchecks: string | null = null;
  const ping = process.env.HEALTHCHECKS_PING_URL;
  if (ping) {
    const m = ping.match(/^(https?:\/\/[^/]+)/);
    healthchecks = m ? `${m[1]}/projects` : ping;
  }

  return {
    vercel: "https://vercel.com/contractsintel/contractsintel",
    supabase: ref
      ? `https://supabase.com/dashboard/project/${ref}`
      : "https://supabase.com/dashboard",
    instantly: "https://app.instantly.ai/app/campaigns",
    audit: `${siteUrl}/api/audit`,
    healthchecks,
  };
}

/* ---------- Composer ---------- */

export async function fetchDigestData(
  supabase: SupabaseClient,
  runId: string,
  opts: FetchOpts = {},
): Promise<DigestData> {
  const now = opts.now ?? new Date();
  const errors: { section: string; error: string }[] = [];

  const safe = async <T>(section: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ section, error: msg });
      return fallback;
    }
  };

  const health = await safe<HealthHeader>(
    "health",
    () => fetchHealthHeader(supabase, now),
    {
      rollup: "stale",
      runId: null,
      date: ymdUtc(now),
      greenCount: 0,
      totalCount: ALL_CHECK_NAMES.length,
      stale: true,
      checks: [],
    },
  );

  const critical = await safe<CriticalItems>(
    "critical",
    () => fetchCriticalItems(supabase, now, health.checks),
    { alerts: [], reds: [], capped: false },
  );

  const scraping = await safe<ScrapingSummary>(
    "scraping",
    () => fetchScrapingSummary(supabase, now),
    { rows: [], totalRuns: 0, totalOk: 0, totalFail: 0, totalOpps: 0, totalMatches: 0 },
  );

  const certs = await safe<CertProgress[]>(
    "certs",
    () => fetchCertProgress(supabase, now, opts.certs),
    [],
  );

  const resources = await safe<ResourceItem[]>(
    "resources",
    () => fetchResources(supabase),
    [],
  );

  const sparklines = await safe<SparklineRow[]>(
    "sparklines",
    () => fetchSparklines(supabase, now),
    [],
  );

  return {
    runId,
    generatedAt: now.toISOString(),
    dateUtc: ymdUtc(now),
    health,
    critical,
    scraping,
    certs,
    resources,
    sparklines,
    links: buildLinks(),
    errors,
  };
}
