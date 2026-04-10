import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildProposalDocx } from "@/lib/docx-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { title, company?, agency?, solicitation?, sections: {executive_summary,...} }
// → returns .docx binary stream
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const sections = payload?.sections || {};
    const hasContent = Object.values(sections).some(
      (v) => typeof v === "string" && v.trim().length > 0,
    );
    if (!hasContent) {
      return NextResponse.json(
        { error: "sections must include at least one non-empty string" },
        { status: 400 },
      );
    }

    const buffer = await buildProposalDocx({
      title: payload.title || "Proposal",
      company: payload.company,
      agency: payload.agency,
      solicitation: payload.solicitation,
      sections,
    });

    const safeName =
      (payload.title || "proposal")
        .toString()
        .replace(/[^a-z0-9-_ ]/gi, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 60) || "proposal";

    const bytes = new Uint8Array(buffer);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeName}.docx"`,
        "Content-Length": String(bytes.length),
      },
    });
  } catch (err) {
    console.error("proposals export error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
