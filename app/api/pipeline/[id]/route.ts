import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computePwin, GATE_STAGES, lookupAgencyWinRate, type GateStage } from "@/lib/pwin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/pipeline/[id]
// body: { gate_stage?, gate_notes?, pwin? }
// When gate_stage is provided, recompute pwin automatically unless the
// caller explicitly overrides it.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
    const orgId = userRecord.organization_id;

    // Load existing row (tenant-scoped)
    const { data: existing, error: fetchErr } = await supabase
      .from("opportunity_matches")
      .select("id, match_score, gate_stage, opportunities(agency)")
      .eq("id", params.id)
      .eq("organization_id", orgId)
      .single();
    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const update: Record<string, any> = {};

    if (body.gate_stage !== undefined) {
      if (body.gate_stage !== null && !GATE_STAGES.includes(body.gate_stage as GateStage)) {
        return NextResponse.json(
          { error: `gate_stage must be one of ${GATE_STAGES.join(", ")}` },
          { status: 400 },
        );
      }
      update.gate_stage = body.gate_stage;
      update.gate_reviewed_at = new Date().toISOString();
    }
    if (body.gate_notes !== undefined) {
      update.gate_notes = String(body.gate_notes).slice(0, 2000);
      update.gate_reviewed_at = new Date().toISOString();
    }

    let pwin: number | undefined;
    if (body.pwin !== undefined && body.pwin !== null) {
      const n = Number(body.pwin);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json({ error: "pwin must be 0..100" }, { status: 400 });
      }
      pwin = Math.round(n);
    } else if (body.gate_stage !== undefined) {
      // Recompute automatically when gate stage changes.
      const oppAgency = (existing.opportunities as unknown as { agency: string | null } | null)?.agency ?? null;
      const winRate = await lookupAgencyWinRate(orgId, oppAgency);
      pwin = computePwin({
        matchScore: existing.match_score,
        agencyWinRate: winRate,
        gateStage: (body.gate_stage as GateStage) ?? (existing.gate_stage as GateStage | null) ?? undefined,
      });
    }
    if (pwin !== undefined) update.pwin = pwin;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data: updated, error: updErr } = await supabase
      .from("opportunity_matches")
      .update(update)
      .eq("id", params.id)
      .eq("organization_id", orgId)
      .select("id, gate_stage, gate_notes, pwin, gate_reviewed_at")
      .single();
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, match: updated });
  } catch (err) {
    console.error("pipeline PATCH error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
