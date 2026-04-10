import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Spending Analytics endpoint — pulls USASpending.gov data to show
// agency spend trends, top contractors by NAICS, and market sizing.
// Equivalent to GovWin's Spending Analytics (Professional tier, $10K+/yr).

const USA_SPENDING_API = "https://api.usaspending.gov/api/v2";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();

    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get org NAICS codes for market analysis
    const { data: org } = await supabase
      .from("organizations")
      .select("naics_codes, certifications, name")
      .eq("id", userRecord.organization_id)
      .single();

    const body = await request.json();
    const { analysis_type, naics_code, agency, fiscal_year } = body;

    // Route to the appropriate analysis
    switch (analysis_type) {
      case "agency_spending":
        return await getAgencySpending(agency, fiscal_year);
      case "naics_market":
        return await getNaicsMarketSize(naics_code || org?.naics_codes?.[0], fiscal_year);
      case "top_contractors":
        return await getTopContractors(naics_code || org?.naics_codes?.[0], agency, fiscal_year);
      case "spending_trend":
        return await getSpendingTrend(naics_code || org?.naics_codes?.[0], agency);
      case "set_aside_breakdown":
        return await getSetAsideBreakdown(naics_code || org?.naics_codes?.[0], fiscal_year);
      default:
        return NextResponse.json({ error: "Invalid analysis_type" }, { status: 400 });
    }
  } catch (error) {
    console.error("Spending analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch spending data" }, { status: 500 });
  }
}

async function fetchUSASpending(endpoint: string, body: any): Promise<any> {
  const resp = await fetch(`${USA_SPENDING_API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`USASpending API ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

async function getAgencySpending(agency: string | undefined, fiscalYear: number = 2025) {
  // Get spending by agency, broken down by award type
  const data = await fetchUSASpending("/search/spending_by_category/awarding_agency", {
    filters: {
      time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }],
      ...(agency ? { agencies: [{ type: "awarding", tier: "toptier", name: agency }] } : {}),
    },
    category: "awarding_agency",
    limit: 20,
    page: 1,
  });

  return NextResponse.json({
    fiscal_year: fiscalYear,
    agencies: (data.results || []).map((r: any) => ({
      name: r.name,
      amount: r.amount,
      count: r.count,
    })),
    total: data.total_metadata?.count || 0,
  });
}

async function getNaicsMarketSize(naicsCode: string | undefined, fiscalYear: number = 2025) {
  if (!naicsCode) {
    return NextResponse.json({ error: "NAICS code required" }, { status: 400 });
  }

  // Get total spending for this NAICS code
  const data = await fetchUSASpending("/search/spending_by_category/naics", {
    filters: {
      time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }],
      naics_codes: [naicsCode],
    },
    category: "naics",
    limit: 10,
    page: 1,
  });

  // Also get top agencies spending in this NAICS
  const agencyData = await fetchUSASpending("/search/spending_by_category/awarding_agency", {
    filters: {
      time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }],
      naics_codes: [naicsCode],
    },
    category: "awarding_agency",
    limit: 10,
    page: 1,
  });

  return NextResponse.json({
    naics_code: naicsCode,
    fiscal_year: fiscalYear,
    total_spending: (data.results || []).reduce((s: number, r: any) => s + (r.amount || 0), 0),
    total_awards: (data.results || []).reduce((s: number, r: any) => s + (r.count || 0), 0),
    top_agencies: (agencyData.results || []).map((r: any) => ({
      name: r.name,
      amount: r.amount,
      count: r.count,
    })),
  });
}

async function getTopContractors(naicsCode: string | undefined, agency: string | undefined, fiscalYear: number = 2025) {
  if (!naicsCode) {
    return NextResponse.json({ error: "NAICS code required" }, { status: 400 });
  }

  const filters: any = {
    time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }],
    naics_codes: [naicsCode],
  };

  if (agency) {
    filters.agencies = [{ type: "awarding", tier: "toptier", name: agency }];
  }

  const data = await fetchUSASpending("/search/spending_by_category/recipient", {
    filters,
    category: "recipient",
    limit: 25,
    page: 1,
  });

  return NextResponse.json({
    naics_code: naicsCode,
    agency: agency || "All",
    fiscal_year: fiscalYear,
    contractors: (data.results || []).map((r: any, i: number) => ({
      rank: i + 1,
      name: r.name,
      amount: r.amount,
      count: r.count,
    })),
  });
}

async function getSpendingTrend(naicsCode: string | undefined, agency: string | undefined) {
  if (!naicsCode) {
    return NextResponse.json({ error: "NAICS code required" }, { status: 400 });
  }

  // Get spending for last 5 fiscal years
  const years = [2021, 2022, 2023, 2024, 2025];
  const trend = [];

  for (const fy of years) {
    const filters: any = {
      time_period: [{ start_date: `${fy - 1}-10-01`, end_date: `${fy}-09-30` }],
      naics_codes: [naicsCode],
    };
    if (agency) {
      filters.agencies = [{ type: "awarding", tier: "toptier", name: agency }];
    }

    try {
      const data = await fetchUSASpending("/search/spending_by_category/naics", {
        filters,
        category: "naics",
        limit: 5,
        page: 1,
      });

      const totalAmount = (data.results || []).reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const totalCount = (data.results || []).reduce((s: number, r: any) => s + (r.count || 0), 0);

      trend.push({
        fiscal_year: fy,
        amount: totalAmount,
        awards: totalCount,
      });
    } catch {
      trend.push({ fiscal_year: fy, amount: 0, awards: 0 });
    }
  }

  return NextResponse.json({
    naics_code: naicsCode,
    agency: agency || "All",
    trend,
  });
}

async function getSetAsideBreakdown(naicsCode: string | undefined, fiscalYear: number = 2025) {
  if (!naicsCode) {
    return NextResponse.json({ error: "NAICS code required" }, { status: 400 });
  }

  const data = await fetchUSASpending("/search/spending_by_category/awarding_subagency", {
    filters: {
      time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }],
      naics_codes: [naicsCode],
    },
    subawards: false,
    category: "awarding_subagency",
    limit: 50,
    page: 1,
  });

  // Get set-aside type breakdown via award search
  const awardData = await fetchUSASpending("/search/spending_by_award_count", {
    filters: {
      time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }],
      naics_codes: [naicsCode],
    },
    subawards: false,
  });

  return NextResponse.json({
    naics_code: naicsCode,
    fiscal_year: fiscalYear,
    subagencies: (data.results || []).slice(0, 15).map((r: any) => ({
      name: r.name,
      amount: r.amount,
      count: r.count,
    })),
    award_counts: awardData || {},
  });
}
