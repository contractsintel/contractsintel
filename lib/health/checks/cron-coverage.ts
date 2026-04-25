/**
 * cron_coverage check — verify every cron in vercel.json that writes
 * audit evidence has at least one row in its evidence table within the
 * per-cron lookback window. See plan §5 E8.
 *
 * Tuned 2026-04-26 (PR fix/health-check-tuning):
 *   The original implementation queried `scraper_runs` for every cron in
 *   vercel.json. In practice most non-scraper crons (send-digests,
 *   compliance-alerts, owner-report, nurture-emails, etc.) and most
 *   paginated scraper routes (scrape-grants-pN, scrape-usa-pN) DO NOT
 *   write to scraper_runs — they write to `opportunities`, send email,
 *   or land in other audit tables. As a result every dry-fire flagged
 *   ~45/48 crons "missing" → red. False positive.
 *
 *   The fix: an explicit allowlist mapping each cron path to either
 *   (a) the evidence table + source/discriminator value to look for, or
 *   (b) `null`, meaning this cron is intentionally NOT part of the
 *   coverage check. Crons in the (b) bucket are reported as `skipped`
 *   in the details payload so the allowlist is auditable.
 *
 * Lookback windows:
 *   default:  HEALTH_CRON_LOOKBACK_HOURS (48h)
 *   weekly:   8d
 *   monthly:  35d
 *   per-cron `lookbackHours` override always wins.
 */

import vercelJson from "@/vercel.json";
import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
} from "../types";

interface CronEntry {
  path: string;
  schedule: string;
}

interface EvidenceConfig {
  /** Evidence table to query. */
  table: string;
  /**
   * Column on the evidence table to filter by, e.g. `source` on
   * `scraper_runs`. If omitted, we just count rows in the time window.
   */
  sourceColumn?: string;
  /**
   * One or more values that count as evidence for this cron. A cron is
   * considered "fired" if ANY of these values has a row in the window.
   * (Some crons fan out to multiple sources — e.g. scrape-federal runs
   * the sam_gov, usaspending, grants_gov, and federal_civilian
   * scrapers under one Vercel job.)
   */
  sourceValues?: string[];
  /** Timestamp column to compare against the lookback window. */
  timestampColumn?: string;
  /** Per-cron lookback override, in hours. */
  lookbackHours?: number;
}

/**
 * Allowlist mapping. `null` means the cron is intentionally skipped
 * (no audit table or out-of-scope for this check).
 *
 * Source values were verified against prod scraper_runs on 2026-04-26
 * via the Supabase Management API and against each cron route's
 * implementation. Aggregate scraper crons (scrape-federal, scrape-states,
 * etc.) call runScrapersByCategory which writes one scraper_runs row per
 * scraper, so we list every source that category produces.
 */
const CRON_EVIDENCE: Record<string, EvidenceConfig | null> = {
  // ── Scraper crons that write to scraper_runs ──────────────────────
  // scrape-federal → category "federal" → 4 scrapers
  "/api/cron/scrape-federal": {
    table: "scraper_runs",
    sourceColumn: "source",
    sourceValues: ["sam_gov", "usaspending", "grants_gov", "federal_civilian"],
    timestampColumn: "started_at",
  },
  "/api/cron/scrape-military": {
    table: "scraper_runs",
    sourceColumn: "source",
    sourceValues: ["military_defense"],
    timestampColumn: "started_at",
  },
  "/api/cron/scrape-states": {
    table: "scraper_runs",
    sourceColumn: "source",
    sourceValues: ["bidnet_direct", "state_local"],
    timestampColumn: "started_at",
  },
  "/api/cron/scrape-sbir": {
    table: "scraper_runs",
    sourceColumn: "source",
    sourceValues: ["sbir_sttr"],
    timestampColumn: "started_at",
  },
  "/api/cron/scrape-forecasts": {
    table: "scraper_runs",
    sourceColumn: "source",
    sourceValues: ["forecasts", "subcontracting"],
    timestampColumn: "started_at",
  },

  // DSBS crons — explicit summary row writers.
  "/api/cron/dsbs-delta": {
    table: "scraper_runs",
    sourceColumn: "source",
    sourceValues: ["dsbs_delta"],
    timestampColumn: "started_at",
  },
  "/api/cron/dsbs-weekly-sweep": {
    table: "scraper_runs",
    sourceColumn: "source",
    sourceValues: ["dsbs_weekly"],
    timestampColumn: "started_at",
    lookbackHours: 8 * 24,
  },

  // ── Crons NOT part of the coverage check ──────────────────────────
  // Self-skip: the health-check cron's evidence is the run we're inside.
  "/api/cron/health-check": null,

  // Email/notification crons — write to messaging/email tables, not
  // scraper_runs. Out of scope for now (covered by other checks).
  "/api/cron/send-digests": null,
  "/api/cron/compliance-alerts": null,
  "/api/cron/owner-report": null,
  "/api/cron/nurture-emails": null,
  "/api/cron/performance-prompts": null,

  // Pipeline cron — writes to pipeline_runs / cert_queue_state. Out of
  // scope for cron_coverage; pipeline_stalls covers it separately.
  "/api/cron/cert-pipeline": null,

  // Match cron — writes to matches table; not part of scraper coverage.
  "/api/cron/match-opportunities": null,

  // Paginated scraper routes — these write directly to `opportunities`
  // and DO NOT call logScraperRun. The aggregate scrape-federal /
  // scrape-grants-full / scrape-usaspending-full crons cover the
  // category-level evidence in scraper_runs.
  "/api/cron/scrape-grants-full": null,
  "/api/cron/scrape-grants-p1": null,
  "/api/cron/scrape-grants-p2": null,
  "/api/cron/scrape-grants-p3": null,
  "/api/cron/scrape-grants-p4": null,
  "/api/cron/scrape-grants-p5": null,
  "/api/cron/scrape-grants-p6": null,
  "/api/cron/scrape-grants-p7": null,
  "/api/cron/scrape-grants-p8": null,
  "/api/cron/scrape-grants-p9": null,
  "/api/cron/scrape-grants-p10": null,
  "/api/cron/scrape-usaspending-full": null,
  "/api/cron/scrape-usaspending-backfill": null,
  "/api/cron/scrape-bidnet": null,
  "/api/cron/scrape-usa-p1": null,
  "/api/cron/scrape-usa-p2": null,
  "/api/cron/scrape-usa-p3": null,
  "/api/cron/scrape-usa-p4": null,
  "/api/cron/scrape-usa-p5": null,
  "/api/cron/scrape-usa-p6": null,
  "/api/cron/scrape-usa-p7": null,
  "/api/cron/scrape-usa-p8": null,
  "/api/cron/scrape-usa-p9": null,
  "/api/cron/scrape-usa-p10": null,
  "/api/cron/scrape-usa-p11": null,
  "/api/cron/scrape-usa-p12": null,
  "/api/cron/scrape-usa-p13": null,
  "/api/cron/scrape-usa-p14": null,
  "/api/cron/scrape-usa-p15": null,
  "/api/cron/scrape-usa-p16": null,
  "/api/cron/scrape-usa-p17": null,
  "/api/cron/scrape-usa-p18": null,
  "/api/cron/scrape-usa-p19": null,
  "/api/cron/scrape-usa-p20": null,
};

// Crons whose schedule fires less than daily — need a longer lookback
// when no per-cron `lookbackHours` is set. Preserved from the original
// implementation per plan §5 E8.
const WEEKLY_CRONS: ReadonlySet<string> = new Set([
  "scrape-usaspending-backfill",
  "dsbs-weekly-sweep",
  "owner-report",
]);
const MONTHLY_CRONS: ReadonlySet<string> = new Set(["performance-prompts"]);

const HOUR_MS = 60 * 60 * 1000;

function defaultLookbackHoursFor(path: string): number {
  const last = path.split("/").pop() ?? path;
  if (MONTHLY_CRONS.has(last)) return 35 * 24;
  if (WEEKLY_CRONS.has(last)) return 8 * 24;
  const env = parseInt(process.env.HEALTH_CRON_LOOKBACK_HOURS || "", 10);
  return Number.isFinite(env) && env > 0 ? env : 48;
}

function lookbackHoursFor(path: string, evidence: EvidenceConfig): number {
  if (typeof evidence.lookbackHours === "number" && evidence.lookbackHours > 0) {
    return evidence.lookbackHours;
  }
  return defaultLookbackHoursFor(path);
}

interface CheckedCronResult {
  path: string;
  schedule: string;
  evidence_table: string;
  evidence_source: string[];
  lookback_hours: number;
  fired: boolean;
  matched_sources: string[];
}

interface SkippedCron {
  path: string;
  reason: "self" | "unmapped" | "out_of_scope";
}

export async function runCronCoverage(
  ctx: HealthRunContext,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const crons = ((vercelJson as { crons?: CronEntry[] }).crons ?? []) as CronEntry[];

  const now = Date.now();
  const checked: CheckedCronResult[] = [];
  const skipped: SkippedCron[] = [];

  for (const c of crons) {
    if (!Object.prototype.hasOwnProperty.call(CRON_EVIDENCE, c.path)) {
      // Cron added to vercel.json without an allowlist entry. Don't
      // flag as red, but record it so the omission is visible.
      skipped.push({ path: c.path, reason: "unmapped" });
      continue;
    }
    const evidence = CRON_EVIDENCE[c.path];
    if (evidence === null) {
      skipped.push({
        path: c.path,
        reason: c.path === "/api/cron/health-check" ? "self" : "out_of_scope",
      });
      continue;
    }

    const lookback = lookbackHoursFor(c.path, evidence);
    const since = new Date(now - lookback * HOUR_MS).toISOString();
    const sourceValues = evidence.sourceValues ?? [];
    const tsCol = evidence.timestampColumn ?? "started_at";
    const matched: string[] = [];

    if (sourceValues.length === 0) {
      // No discriminator — just count rows in window on the table.
      const { data, error } = await ctx.supabase
        .from(evidence.table)
        .select("*")
        .gte(tsCol, since)
        .limit(1);
      if (!error && data && data.length > 0) {
        matched.push("(any)");
      }
    } else {
      for (const src of sourceValues) {
        const { data, error } = await ctx.supabase
          .from(evidence.table)
          .select(evidence.sourceColumn ?? "*")
          .eq(evidence.sourceColumn ?? "source", src)
          .gte(tsCol, since)
          .limit(1);
        if (error) continue;
        if (data && data.length > 0) matched.push(src);
      }
    }

    checked.push({
      path: c.path,
      schedule: c.schedule,
      evidence_table: evidence.table,
      evidence_source: sourceValues,
      lookback_hours: lookback,
      fired: matched.length > 0,
      matched_sources: matched,
    });
  }

  const missing = checked.filter((p) => !p.fired);
  const greenCount = checked.length - missing.length;

  // Status policy:
  //   green  — every checked cron has evidence
  //   red    — any checked cron has zero evidence
  //   yellow — partial-data edge case (none triggered yet, since with
  //            the allowlist any zero-evidence cron is meaningful).
  // We retain a `partial_data` yellow path for the case where we have
  // some checked crons but the supabase client returned errors for
  // ≥1 (matched.length zero AND we couldn't differentiate). For now,
  // the simple rule below is correct.
  const status =
    missing.length === 0 ? "green" : "red";

  return {
    name: "cron_coverage",
    status,
    metric: missing.length,
    threshold: 0,
    details: {
      total_crons: crons.length,
      checked: checked.length,
      green_count: greenCount,
      skipped_count: skipped.length,
      skipped: skipped,
      missing_count: missing.length,
      missing: missing.map((m) => ({
        path: m.path,
        evidence_table: m.evidence_table,
        evidence_source: m.evidence_source,
        lookback_hours: m.lookback_hours,
      })),
    },
    errorMessage: null,
    durationMs: Date.now() - start,
  };
}

export const cronCoverageCheck: HealthCheck = {
  name: "cron_coverage",
  run: runCronCoverage,
};
