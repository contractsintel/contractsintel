import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { translateNLQuery } from "@/lib/nl-search";
import { checkAndConsumeSearchQuota } from "@/lib/quota";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`ai:${user.id}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly." },
        { status: 429 },
      );
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }
    if (prompt.length > 1000) {
      return NextResponse.json({ error: "Prompt too long" }, { status: 400 });
    }

    // G24: Free-tier daily search quota
    const quota = await checkAndConsumeSearchQuota(supabase, userRecord.organization_id);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: "Daily search limit reached",
          quota,
          upgrade: {
            message: "You've used all 5 free searches today. Upgrade to Discovery for unlimited searches.",
            href: "/pricing",
          },
        },
        { status: 429 },
      );
    }

    const filters = await translateNLQuery(prompt);

    let q = supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .limit(PAGE_SIZE);

    // OR-combine keywords across title/description/agency
    if (filters.keywords.length > 0) {
      const escaped = filters.keywords
        .map((k) => k.replace(/[%,()]/g, " ").trim())
        .filter((k) => k.length > 0)
        .slice(0, 6);
      if (escaped.length > 0) {
        const orClause = escaped
          .flatMap((k) => [`title.ilike.%${k}%`, `description.ilike.%${k}%`, `agency.ilike.%${k}%`])
          .join(",");
        q = q.or(orClause);
      }
    }
    if (filters.naics.length > 0) {
      q = q.in("naics_code", filters.naics);
    }
    if (filters.set_asides.length > 0) {
      // set_aside columns are text; ilike against either type or description
      const orClause = filters.set_asides
        .flatMap((s) => {
          const cleaned = s.replace(/[%,()]/g, " ");
          return [
            `set_aside_type.ilike.%${cleaned}%`,
            `set_aside_description.ilike.%${cleaned}%`,
          ];
        })
        .join(",");
      q = q.or(orClause);
    }
    if (filters.agencies.length > 0) {
      const orClause = filters.agencies
        .map((a) => `agency.ilike.%${a.replace(/[%,()]/g, " ")}%`)
        .join(",");
      q = q.or(orClause);
    }
    if (filters.value_min !== null) {
      q = q.gte("estimated_value", filters.value_min);
    }
    if (filters.value_max !== null) {
      q = q.lte("estimated_value", filters.value_max);
    }
    if (filters.states.length > 0) {
      const orClause = filters.states
        .map((s) => `place_of_performance.ilike.%${s}%`)
        .join(",");
      q = q.or(orClause);
    }

    q = q.order("response_deadline", { ascending: true, nullsFirst: false });

    const { data, count, error } = await q;
    if (error) {
      console.error("nl-search query error:", error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    return NextResponse.json({
      filters,
      results: data ?? [],
      total: count ?? 0,
      quota,
    });
  } catch (err: unknown) {
    console.error("nl-search error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
