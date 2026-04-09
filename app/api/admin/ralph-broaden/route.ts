import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// One-shot: add IT-adjacent NAICS codes to Ralph's profile.
// Current codes: 561499, 518210, 541513.
// Adding: 541511 (Custom Programming), 541512 (Systems Design),
//         541519 (Other Computer Services), 541611 (Mgmt Consulting)
// These four showed up in his top-5 match list as "same sub-industry"
// scoring 80 pts — making them direct matches lets them hit 85-90.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = "bd7ab856-03da-4756-b77c-821e2f337b90";

  const { data: before } = await supabase
    .from("organizations")
    .select("naics_codes, keywords")
    .eq("id", orgId)
    .single();

  const existingNaics = new Set(before?.naics_codes || []);
  const toAdd = ["541511", "541512", "541519", "541611"];
  for (const n of toAdd) existingNaics.add(n);

  const existingKw = new Set((before?.keywords || []).map((k: string) => k.toLowerCase()));
  const kwToAdd = ["information technology", "computer services", "IT services"];
  const newKeywords = [...(before?.keywords || [])];
  for (const k of kwToAdd) {
    if (!existingKw.has(k.toLowerCase())) newKeywords.push(k);
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      naics_codes: Array.from(existingNaics),
      keywords: newKeywords,
    })
    .eq("id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    before: { naics: before?.naics_codes, keywords: before?.keywords },
    after: { naics: Array.from(existingNaics), keywords: newKeywords },
  });
}
