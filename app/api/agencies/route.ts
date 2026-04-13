import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fallback: if the `agencies` table doesn't exist yet (migration not applied),
 * derive a minimal agency list from the `opportunities` table so the page
 * doesn't 500.
 */
async function fallbackAgenciesFromOpportunities(
  supabase: Awaited<ReturnType<typeof createClient>>,
  q?: string | null,
) {
  let query = supabase
    .from("opportunities")
    .select("agency")
    .not("agency", "is", null)
    .limit(500);

  const { data: rows, error: fbError } = await query;

  if (fbError || !rows) {
    return [];
  }

  // Deduplicate and shape into the Agency interface the frontend expects.
  const seen = new Map<string, number>();
  for (const row of rows as Array<{ agency: string }>) {
    const name = row.agency?.trim();
    if (!name) continue;
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }

  let agencies = Array.from(seen.entries()).map(([name, count]) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    acronym: null as string | null,
    parent_agency_id: null as string | null,
    description: null as string | null,
    total_obligations: null as number | null,
    active_opportunities: count,
  }));

  // Apply search filter if provided.
  if (q) {
    const lower = q.toLowerCase();
    agencies = agencies.filter((a) => a.name.toLowerCase().includes(lower));
  }

  // Sort by active_opportunities descending.
  agencies.sort(
    (a, b) => (b.active_opportunities ?? 0) - (a.active_opportunities ?? 0),
  );

  return agencies.slice(0, 50);
}

// GET /api/agencies?q=CISA → list (optionally filtered by name/acronym)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const parentOnly = url.searchParams.get("parent_only") === "true";

  // Primary path: query the agencies table directly.
  let query = supabase
    .from("agencies")
    .select(
      "id, name, acronym, parent_agency_id, description, website, total_obligations, active_opportunities",
    )
    .order("total_obligations", { ascending: false, nullsFirst: false });

  if (q) {
    const safe = q.replace(/[%,.()"'\\]/g, "");
    if (safe) query = query.or(`name.ilike.%${safe}%,acronym.ilike.%${safe}%`);
  }
  if (parentOnly) query = query.is("parent_agency_id", null);

  const { data, error } = await query.limit(50);

  // If the agencies table exists and query succeeded, return normally.
  if (!error) {
    return NextResponse.json({
      agencies: data ?? [],
      count: data?.length ?? 0,
    });
  }

  // Fallback: the agencies table likely doesn't exist yet.
  // Aggregate distinct agency names from the opportunities table instead.
  console.warn(
    `[agencies] Primary query failed (${error.message}), falling back to opportunities table`,
  );

  try {
    const agencies = await fallbackAgenciesFromOpportunities(supabase, q);
    return NextResponse.json({
      agencies,
      count: agencies.length,
      _fallback: true,
    });
  } catch (fbErr) {
    console.error("[agencies] Fallback also failed:", fbErr);
    return NextResponse.json(
      { error: "Unable to load agencies. Please try again later." },
      { status: 500 },
    );
  }
}
