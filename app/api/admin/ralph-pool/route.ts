import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function rawCount(url: string, key: string, params: string): Promise<number | null> {
  const r = await fetch(`${url}/rest/v1/opportunities?${params}`, {
    method: "HEAD",
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = r.headers.get("content-range") || "";
  const t = cr.split("/")[1];
  return t && t !== "*" ? parseInt(t) : null;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Ralph's NAICS: 561499, 518210, 541513
  // 4-digit prefixes: 5614, 5182, 5415
  // 3-digit prefixes: 561, 518, 541

  const [
    exact,
    prefix5_5614, prefix5_5182, prefix5_5415,
    prefix3_561, prefix3_518, prefix3_541,
    sa_8a, sa_sdvosb, sa_wosb, sa_hubzone, sa_sb,
    anySetAside,
    activeTotal,
  ] = await Promise.all([
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&naics_code=in.(561499,518210,541513)&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&naics_code=like.5614*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&naics_code=like.5182*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&naics_code=like.5415*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&naics_code=like.561*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&naics_code=like.518*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&naics_code=like.541*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&set_aside_type=ilike.*8(a)*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&set_aside_type=ilike.*SDVOSB*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&set_aside_type=ilike.*WOSB*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&set_aside_type=ilike.*HUBZone*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&set_aside_type=ilike.*Small*Business*&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&set_aside_type=not.is.null&set_aside_type=neq.&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&select=id"),
  ]);

  return NextResponse.json({
    ralphExactNaics: exact,
    ralph4DigitFamily: {
      "5614 (561499)": prefix5_5614,
      "5182 (518210)": prefix5_5182,
      "5415 (541513)": prefix5_5415,
    },
    ralph3DigitGroup: {
      "561": prefix3_561,
      "518": prefix3_518,
      "541": prefix3_541,
    },
    setAsideCounts: {
      "8(a)": sa_8a,
      SDVOSB: sa_sdvosb,
      WOSB: sa_wosb,
      HUBZone: sa_hubzone,
      "Small Business": sa_sb,
    },
    activeTotal,
    activeWithRealSetAside: anySetAside,
  });
}
