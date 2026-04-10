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
  let q = supabase
    .from("forecasts")
    .select("*")
    .order("expected_rfp_at", { ascending: true });

  if (filters.agency) q = q.ilike("agency", `%${filters.agency}%`);
  if (filters.naics) q = q.eq("naics", filters.naics);

  if (typeof filters.months_out === "number" && filters.months_out > 0) {
    const cutoff = new Date(Date.now() + filters.months_out * MS_PER_MONTH);
    q = q.lte("expected_rfp_at", cutoff.toISOString().slice(0, 10));
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ForecastRow[];
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

  const { data: rows, error } = await supabase
    .from("past_performance")
    .select("id, agency, naics_code, period_end, award_amount, contract_name")
    .eq("organization_id", organizationId)
    .gte("period_end", today);

  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return 0;

  // Skip awards already projected (linked_recompete_award_id).
  const awardIds = rows.map((r) => r.id);
  const { data: existing } = await supabase
    .from("forecasts")
    .select("linked_recompete_award_id")
    .in("linked_recompete_award_id", awardIds);
  const linked = new Set(
    (existing ?? [])
      .map((e) => e.linked_recompete_award_id)
      .filter((v): v is string => !!v),
  );

  const inserts = rows
    .filter((r) => !linked.has(r.id) && r.agency && r.period_end)
    .map((r) => {
      const expected = projectExpectedRfpDate(new Date(r.period_end as string));
      return {
        agency: r.agency as string,
        naics: r.naics_code,
        expected_rfp_at: expected.toISOString().slice(0, 10),
        period_end: r.period_end,
        incumbent: r.contract_name,
        estimated_value: r.award_amount,
        source: "tenant_past_performance",
        confidence: 0.7,
        linked_recompete_award_id: r.id,
      };
    });

  if (inserts.length === 0) return 0;
  const { error: insertErr } = await supabase.from("forecasts").insert(inserts);
  if (insertErr) throw new Error(insertErr.message);
  return inserts.length;
}
