import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, publicClient } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// G22 / G28: Quick-save endpoint used by the ContractsIntel browser extension.
// Authenticated with a public API key (Bearer header) so users can stay
// signed-out in the web app while the extension is pinned. Upserts the
// opportunity by `sam_url` (unique per SAM notice) then inserts an
// opportunity_matches row for the user's org at score 0 so the opportunity
// shows up on their pipeline.
export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const agency = typeof body?.agency === "string" ? body.agency.trim() : null;
  const solicitation = typeof body?.solicitation_number === "string" ? body.solicitation_number.trim() : null;
  const description = typeof body?.description === "string" ? body.description.slice(0, 8000) : null;
  const naics = typeof body?.naics === "string" ? body.naics.trim() : null;
  const deadline = typeof body?.deadline === "string" ? body.deadline.trim() : null;

  if (!title || !url) {
    return NextResponse.json({ error: "Missing title or url" }, { status: 400 });
  }
  if (title.length > 500) {
    return NextResponse.json({ error: "Title too long" }, { status: 400 });
  }

  const client = publicClient();

  // Look up an existing row by sam_url so re-saving the same page is a no-op.
  const { data: existing } = await client
    .from("opportunities")
    .select("id")
    .eq("sam_url", url)
    .maybeSingle();

  let opportunityId = existing?.id as string | undefined;
  if (!opportunityId) {
    const insertPayload: Record<string, any> = {
      title,
      agency,
      solicitation_number: solicitation,
      full_description: description,
      naics_code: naics,
      sam_url: url,
      source: "browser_ext",
      posted_date: new Date().toISOString().slice(0, 10),
    };
    if (deadline) {
      const parsed = new Date(deadline);
      if (!Number.isNaN(parsed.getTime())) {
        insertPayload.response_deadline = parsed.toISOString();
      }
    }
    const { data: inserted, error: insertErr } = await client
      .from("opportunities")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insertErr || !inserted) {
      console.error("quick-save insert error:", insertErr);
      return NextResponse.json({ error: "Could not save opportunity" }, { status: 500 });
    }
    opportunityId = inserted.id;
  }

  // Pin to pipeline via opportunity_matches if not already present.
  const { data: matchExisting } = await client
    .from("opportunity_matches")
    .select("id")
    .eq("organization_id", auth.ctx.organizationId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (!matchExisting) {
    const { error: matchErr } = await client.from("opportunity_matches").insert({
      organization_id: auth.ctx.organizationId,
      opportunity_id: opportunityId,
      match_score: 0,
      pipeline_stage: "identified",
      user_status: "tracking",
      reasoning: "Saved via browser extension",
    });
    if (matchErr) {
      console.error("quick-save match error:", matchErr);
      // Non-fatal — return the opportunity regardless.
    }
  }

  return NextResponse.json({
    ok: true,
    opportunity_id: opportunityId,
    duplicate: !!existing,
  });
}
