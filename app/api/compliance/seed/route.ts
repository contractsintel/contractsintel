import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/compliance/seed
 *
 * Idempotent: seeds the default compliance checklist for the caller's
 * organization if it has zero compliance_items. Used by B6/C3 to surface
 * a real health score on first visit instead of "--".
 *
 * The seed covers the four categories the Compliance page groups on:
 *   - sam          SAM.gov registration lifecycle
 *   - certs        Certification renewals
 *   - cmmc         CMMC readiness tasks
 *   - compliance   General compliance items (insurance, bonding, etc.)
 *
 * Due dates are computed relative to "now" so every org starts with a mix
 * of overdue/upcoming/future items that exercise the severity colors.
 */
export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Look up caller's org
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id, organizations(id, certifications, uei)")
      .eq("auth_id", user.id)
      .maybeSingle();

    const orgId: string | null =
      profile?.organization_id ??
      (profile?.organizations as any)?.id ??
      null;
    if (!orgId) {
      return NextResponse.json({ error: "no_org" }, { status: 400 });
    }

    // Idempotency: if any items exist, noop
    const { count } = await supabase
      .from("compliance_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .neq("category", "far_change");
    if ((count ?? 0) > 0) {
      return NextResponse.json({ seeded: false, count });
    }

    const now = new Date();
    const daysFromNow = (n: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };

    const certs: string[] =
      ((profile?.organizations as any)?.certifications as string[] | undefined) ?? [];

    const seed: Array<Record<string, unknown>> = [
      // SAM.gov
      {
        organization_id: orgId,
        type: "sam_renewal",
        category: "registration",
        title: "SAM.gov registration annual renewal",
        status: "pending",
        due_date: daysFromNow(60),
        details:
          "SAM.gov registration must be renewed yearly. Missing a renewal removes you from award eligibility.",
        severity: "high",
      },
      {
        organization_id: orgId,
        type: "sam_renewal",
        category: "registration",
        title: "Verify UEI and CAGE code on profile",
        status: (profile?.organizations as any)?.uei ? "complete" : "pending",
        due_date: daysFromNow(14),
        details: "Confirm UEI and CAGE match your legal business name on SAM.gov.",
        severity: "medium",
      },
      {
        organization_id: orgId,
        type: "sam_renewal",
        category: "registration",
        title: "Confirm POC and banking (FSRS) details",
        status: "pending",
        due_date: daysFromNow(30),
        details:
          "Primary POC + Electronic Funds Transfer (EFT) info must be current to receive payments.",
        severity: "medium",
      },

      // Certifications
      ...(certs.length > 0
        ? certs.map((c) => ({
            organization_id: orgId,
            type: "reps_certs",
            category: "certifications",
            title: `${c} certification active`,
            status: "complete",
            due_date: daysFromNow(300),
            details: `Your ${c} certification is active. Review the renewal requirements at least 90 days before expiration.`,
            severity: "medium",
          }))
        : [
            {
              organization_id: orgId,
              type: "reps_certs",
              category: "certifications",
              title: "Add at least one socio-economic certification",
              status: "pending",
              due_date: daysFromNow(21),
              details:
                "Unlock set-aside opportunities by registering for 8(a), HUBZone, WOSB, SDVOSB, or EDWOSB.",
              severity: "low",
            },
          ]),

      // CMMC readiness
      {
        organization_id: orgId,
        type: "cmmc",
        category: "cybersecurity",
        title: "Complete CMMC self-assessment (Level 1 basic safeguarding)",
        status: "pending",
        due_date: daysFromNow(45),
        details:
          "DoD primes require at least CMMC Level 1. Complete the 17 basic safeguarding practices and post your score in SPRS.",
        severity: "high",
      },
      {
        organization_id: orgId,
        type: "cmmc",
        category: "cybersecurity",
        title: "Implement basic access control policy",
        status: "pending",
        due_date: daysFromNow(75),
        details:
          "CMMC Level 1 Practice AC.L1-3.1.1: Limit system access to authorized users and devices.",
        severity: "medium",
      },
      {
        organization_id: orgId,
        type: "cmmc",
        category: "cybersecurity",
        title: "Post assessment score in SPRS",
        status: "pending",
        due_date: daysFromNow(90),
        details:
          "Your DoD SPRS score is checked by contracting officers before award.",
        severity: "medium",
      },

      // General compliance
      {
        organization_id: orgId,
        type: "iso",
        category: "quality",
        title: "General liability insurance certificate on file",
        status: "pending",
        due_date: daysFromNow(120),
        details:
          "Most federal contracts require proof of general liability, workers comp, and professional liability.",
        severity: "medium",
      },
      {
        organization_id: orgId,
        type: "dcaa",
        category: "accounting",
        title: "Bonding capacity letter",
        status: "pending",
        due_date: daysFromNow(150),
        details:
          "Construction and large-dollar service contracts require bid, payment, and performance bonds.",
        severity: "low",
      },
      {
        organization_id: orgId,
        type: "iso",
        category: "quality",
        title: "Quality management plan (ISO 9001 equivalent)",
        status: "pending",
        due_date: daysFromNow(180),
        details:
          "Large primes and many agencies require a documented quality management plan.",
        severity: "low",
      },
    ];

    const { error } = await supabase.from("compliance_items").insert(seed);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ seeded: true, inserted: seed.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "unknown" }, { status: 500 });
  }
}
