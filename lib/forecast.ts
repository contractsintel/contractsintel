// G03 Procurement forecasting
//
// Projects expected RFP release dates from recompete-eligible awards:
//   expected_rfp_at = period_of_performance_end - ~6 months
//
// The `forecasts` table is populated two ways:
//   1. Seed rows from the 20260410_g03_forecasts.sql migration (baseline).
//   2. On-demand projection from the tenant's own `past_performance` rows
//      whose period_end is in the future (generateForecastsFromPastPerformance).
//
// Read access is shared across all authenticated tenants (federal-public
// signal, same RLS model as sub_awards).

import { createClient } from "@/lib/supabase/server";

export interface ForecastRow {
  id: string;
  agency: string;
  naics: string | null;
  expected_rfp_at: string;
  period_end: string | null;
  incumbent: string | null;
  estimated_value: number | null;
  source: string;
  confidence: number;
  linked_recompete_award_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface ForecastFilters {
  agency?: string;
  naics?: string;
  limit?: number;
  months_out?: number; // only return rows with expected_rfp_at within this horizon
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

/**
 * Return forecasts ordered by soonest expected_rfp_at first.
 * All authenticated users can read (RLS policy allows TO authenticated USING true).
 */
export async function listForecasts(filters: ForecastFilters = {}) {
  const supabase = await createClient();

  const allFields =
    "id, agency, naics, expected_rfp_at, period_end, incumbent, estimated_value, source, confidence, linked_recompete_award_id, notes, created_at";

  // Minimal fields that are guaranteed by the base CREATE TABLE in the migration
  const minimalFields =
    "id, agency, naics, expected_rfp_at, period_end, incumbent, estimated_value, source, confidence, notes";

  async function buildQuery(fields: string) {
    let q = supabase
      .from("forecasts")
      .select(fields)
      .order("expected_rfp_at", { ascending: true });

    if (filters.agency) q = q.ilike("agency", `%${filters.agency}%`);
    if (filters.naics) q = q.eq("naics", filters.naics);

    if (typeof filters.months_out === "number" && filters.months_out > 0) {
      const cutoff = new Date(Date.now() + filters.months_out * MS_PER_MONTH);
      q = q.lte("expected_rfp_at", cutoff.toISOString().slice(0, 10));
    }

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    q = q.limit(limit);

    return q;
  }

  // Try full query first
  const primary = await buildQuery(allFields);
  if (!primary.error) {
    return (primary.data ?? []) as ForecastRow[];
  }

  console.warn("forecasts primary query failed, trying minimal fields:", primary.error.message);

  // Fallback: try with minimal fields (in case linked_recompete_award_id or
  // created_at columns don't exist yet)
  const fallback = await buildQuery(minimalFields);
  if (!fallback.error) {
    return (fallback.data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      linked_recompete_award_id: null,
      created_at: "",
    })) as ForecastRow[];
  }

  console.warn("forecasts minimal query also failed:", fallback.error.message);

  // Table may not exist at all — return empty array instead of crashing
  if (
    fallback.error.message.includes("does not exist") ||
    fallback.error.message.includes("relation") ||
    fallback.error.code === "42P01"
  ) {
    return [] as ForecastRow[];
  }

  throw new Error(fallback.error.message);
}

/**
 * Project a single period_end into an expected RFP date.
 * Industry rule-of-thumb: agencies release recompete RFPs roughly 6 months
 * before the incumbent contract ends so there's time for Q&A, proposal
 * evaluation, protest window, and transition.
 */
export function projectExpectedRfpDate(periodEnd: Date, leadMonths = 6): Date {
  const out = new Date(periodEnd);
  out.setMonth(out.getMonth() - leadMonths);
  return out;
}

/**
 * Given a tenant's past_performance rows with future period_end dates,
 * insert one forecast per row (skipping ones already linked).
 * Called on-demand from the dashboard when the user clicks "Project my
 * recompetes". Returns the count of newly inserted forecasts.
 */
export async function generateForecastsFromPastPerformance(
  organizationId: string,
): Promise<number> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Try full column set first, then fall back to fewer columns if some don't
  // exist in production yet (e.g. naics_code, award_amount, contract_name may
  // be migration-gated).
  let rows: Record<string, unknown>[] | null = null;

  const primary = await supabase
    .from("past_performance")
    .select("id, agency, naics_code, period_end, award_amount, contract_name")
    .eq("organization_id", organizationId)
    .gte("period_end", today);

  if (!primary.error) {
    rows = primary.data;
  } else {
    console.warn(
      "past_performance primary query failed, trying minimal:",
      primary.error.message,
    );
    // Fallback: only select columns that are likely to exist
    const fallback = await supabase
      .from("past_performance")
      .select("id, agency, period_end")
      .eq("organization_id", organizationId)
      .gte("period_end", today);

    if (!fallback.error) {
      rows = (fallback.data ?? []).map((r) => ({
        ...r,
        naics_code: null,
        award_amount: null,
        contract_name: null,
      }));
    } else {
      // Table may not exist — return 0 instead of crashing
      if (
        fallback.error.message.includes("does not exist") ||
        fallback.error.message.includes("relation") ||
        fallback.error.code === "42P01"
      ) {
        return 0;
      }
      throw new Error(fallback.error.message);
    }
  }

  if (!rows || rows.length === 0) return 0;

  // Skip awards already projected (linked_recompete_award_id).
  const awardIds = rows.map((r) => r.id as string);

  // The forecasts table might not exist yet either
  let linked = new Set<string>();
  const existingQuery = await supabase
    .from("forecasts")
    .select("linked_recompete_award_id")
    .in("linked_recompete_award_id", awardIds);

  if (!existingQuery.error) {
    linked = new Set(
      (existingQuery.data ?? [])
        .map((e) => e.linked_recompete_award_id)
        .filter((v): v is string => !!v),
    );
  } else if (
    existingQuery.error.message.includes("does not exist") ||
    existingQuery.error.message.includes("relation") ||
    existingQuery.error.code === "42P01"
  ) {
    // forecasts table doesn't exist — can't insert, return 0
    return 0;
  }

  const inserts = rows
    .filter((r) => !linked.has(r.id as string) && r.agency && r.period_end)
    .map((r) => {
      const expected = projectExpectedRfpDate(new Date(r.period_end as string));
      return {
        agency: r.agency as string,
        naics: r.naics_code as string | null,
        expected_rfp_at: expected.toISOString().slice(0, 10),
        period_end: r.period_end as string,
        incumbent: r.contract_name as string | null,
        estimated_value: r.award_amount as number | null,
        source: "tenant_past_performance",
        confidence: 0.7,
        linked_recompete_award_id: r.id as string,
      };
    });

  if (inserts.length === 0) return 0;
  const { error: insertErr } = await supabase.from("forecasts").insert(inserts);
  if (insertErr) throw new Error(insertErr.message);
  return inserts.length;
}
