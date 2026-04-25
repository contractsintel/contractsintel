/**
 * Shared types for the ops digest cron (PR 4).
 *
 * See docs/architecture/pr4-digest-email-plan.md §3.
 */

import type { HealthCheckName, HealthStatus } from "@/lib/health/types";

export type RollupStatus = HealthStatus | "stale";

export interface HealthCheckRow {
  name: HealthCheckName;
  status: HealthStatus;
  metric: number | null;
  threshold: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface HealthHeader {
  rollup: RollupStatus;
  runId: string | null;
  date: string; // YYYY-MM-DD UTC
  greenCount: number;
  totalCount: number;
  stale: boolean;
  checks: HealthCheckRow[];
}

export interface CriticalAlert {
  id: number;
  severity: string;
  source: string;
  message: string;
  created_at: string;
  run_id: string | null;
}

export interface CriticalItems {
  alerts: CriticalAlert[];
  reds: HealthCheckRow[];
  capped: boolean;
}

export interface ScrapingRow {
  source: string;
  runs: number;
  ok: number;
  fail: number;
  opps: number;
  matches: number;
}

export interface ScrapingSummary {
  rows: ScrapingRow[];
  totalRuns: number;
  totalOk: number;
  totalFail: number;
  totalOpps: number;
  totalMatches: number;
}

export interface CertProgress {
  cert: string;
  stage: string | null;
  stageStartedAt: string | null;
  lastTickAt: string | null;
  mode: string | null;
  rowsThisStage: number | null;
  lastError: string | null;
  verifiedYesterday: number;
  cumulative: number;
  universe: number;
}

export interface ResourceItem {
  label: string;
  value: string;
  status: HealthStatus | "stale" | "unknown";
  detail?: string;
}

export interface SparklineRow {
  name: HealthCheckName;
  chars: string; // 7 chars
}

export interface DigestData {
  runId: string;
  generatedAt: string; // ISO
  dateUtc: string; // YYYY-MM-DD
  health: HealthHeader;
  critical: CriticalItems;
  scraping: ScrapingSummary;
  certs: CertProgress[];
  resources: ResourceItem[];
  sparklines: SparklineRow[];
  links: {
    vercel: string;
    supabase: string;
    instantly: string;
    audit: string;
    healthchecks: string | null;
  };
  errors: { section: string; error: string }[];
}

export interface RenderResult {
  html: string;
  text: string;
  subject: string;
}
