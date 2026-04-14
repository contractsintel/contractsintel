import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// TEMPORARY endpoint for stress testing — creates test accounts with specific tiers/profiles
// DELETE THIS FILE after testing is complete

const ACCOUNTS = [
  // === DISCOVERY TIER ===
  // 1. Minimal profile — just name
  {
    email: "test-disc-minimal@contractsintel.com",
    password: "Test1234!disc",
    companyName: "Disc Minimal LLC",
    tier: "discovery",
    profile: {},
  },
  // 2. Partial profile — name + some NAICS + certs
  {
    email: "test-disc-partial@contractsintel.com",
    password: "Test1234!disc",
    companyName: "Disc Partial Corp",
    tier: "discovery",
    profile: {
      naics_codes: ["541512", "541511"],
      certifications: ["Small Business"],
      keywords: ["software development"],
      onboarding_complete: true,
    },
  },
  // 3. Complete profile — everything filled
  {
    email: "test-disc-complete@contractsintel.com",
    password: "Test1234!disc",
    companyName: "Disc Complete Inc",
    tier: "discovery",
    profile: {
      uei: "DC1234567890",
      cage_code: "7A1B2",
      naics_codes: ["541512", "541511", "541519", "518210"],
      certifications: ["8(a)", "Small Business", "WOSB"],
      keywords: ["cloud computing", "DevOps", "cybersecurity", "managed services", "FedRAMP"],
      entity_description: "Full-service IT solutions provider specializing in cloud migration, DevOps, and cybersecurity for federal agencies.",
      serves_nationwide: true,
      preferred_agencies: ["Department of Defense", "Department of Homeland Security", "GSA"],
      min_contract_value: 100000,
      max_contract_value: 5000000,
      onboarding_complete: true,
      setup_wizard_complete: true,
    },
  },
  // === BD PRO TIER ===
  // 4. Minimal
  {
    email: "test-bdpro-minimal@contractsintel.com",
    password: "Test1234!bdpro",
    companyName: "BDPro Minimal LLC",
    tier: "bd_pro",
    profile: {},
  },
  // 5. Partial
  {
    email: "test-bdpro-partial@contractsintel.com",
    password: "Test1234!bdpro",
    companyName: "BDPro Partial Services",
    tier: "bd_pro",
    profile: {
      naics_codes: ["236220", "237310"],
      certifications: ["SDVOSB", "HUBZone"],
      keywords: ["construction", "infrastructure"],
      entity_description: "Veteran-owned construction firm focused on federal infrastructure projects.",
      onboarding_complete: true,
    },
  },
  // 6. Complete
  {
    email: "test-bdpro-complete@contractsintel.com",
    password: "Test1234!bdpro",
    companyName: "BDPro Complete Consulting",
    tier: "bd_pro",
    profile: {
      uei: "BP9876543210",
      cage_code: "3C4D5",
      naics_codes: ["541611", "541612", "541613", "541690", "611430"],
      certifications: ["8(a)", "EDWOSB", "Small Business"],
      keywords: ["management consulting", "training", "organizational development", "strategic planning", "program management"],
      entity_description: "Management consulting firm providing training, strategic planning, and program management services to civilian and defense agencies.",
      serves_nationwide: false,
      service_states: ["VA", "MD", "DC", "PA", "NC"],
      preferred_agencies: ["Department of Veterans Affairs", "Department of Health and Human Services"],
      min_contract_value: 250000,
      max_contract_value: 10000000,
      onboarding_complete: true,
      setup_wizard_complete: true,
    },
  },
  // === TEAM TIER ===
  // 7. Minimal
  {
    email: "test-team-minimal@contractsintel.com",
    password: "Test1234!team",
    companyName: "Team Minimal Corp",
    tier: "team",
    profile: {},
  },
  // 8. Partial
  {
    email: "test-team-partial@contractsintel.com",
    password: "Test1234!team",
    companyName: "Team Partial Solutions",
    tier: "team",
    profile: {
      naics_codes: ["561210", "561320"],
      certifications: ["Small Business"],
      keywords: ["staffing", "facilities management", "janitorial"],
      min_contract_value: 50000,
      max_contract_value: 2000000,
      onboarding_complete: true,
    },
  },
  // 9. Complete
  {
    email: "test-team-complete@contractsintel.com",
    password: "Test1234!team",
    companyName: "Team Complete Enterprises",
    tier: "team",
    profile: {
      uei: "TC5555555555",
      cage_code: "9Z8Y7",
      naics_codes: ["541330", "541310", "541340", "541350", "541370", "541380"],
      certifications: ["8(a)", "SDVOSB", "HUBZone", "Small Business"],
      keywords: ["engineering", "architecture", "environmental", "surveying", "geospatial", "project management"],
      entity_description: "Multi-disciplinary engineering and architecture firm with 15 years of federal contracting experience across DoD, USACE, and NASA.",
      serves_nationwide: true,
      preferred_agencies: ["US Army Corps of Engineers", "NASA", "Department of Energy", "EPA"],
      min_contract_value: 500000,
      max_contract_value: 50000000,
      onboarding_complete: true,
      setup_wizard_complete: true,
      cmmc_current_level: 2,
      cmmc_target_level: 3,
    },
  },
];

export async function POST(request: Request) {
  // Verify caller is an authenticated user (owner of any org)
  const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify the JWT is valid
  if (!authHeader) {
    return NextResponse.json({ error: "No token" }, { status: 401 });
  }
  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(authHeader);
  if (authErr || !caller) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const results: any[] = [];

  for (const acct of ACCOUNTS) {
    try {
      // 1. Create auth user
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: acct.email,
        password: acct.password,
        email_confirm: true,
        user_metadata: { company_name: acct.companyName },
      });

      if (authErr) {
        // If user already exists, skip gracefully
        if (authErr.message?.includes("already been registered")) {
          results.push({ email: acct.email, status: "already_exists" });
          continue;
        }
        results.push({ email: acct.email, status: "auth_error", error: authErr.message });
        continue;
      }

      const userId = authData.user.id;

      // 2. Wait for trigger to create org, or create manually
      let orgId: string | null = null;
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 600));
        const { data: userRec } = await admin
          .from("users")
          .select("organization_id")
          .eq("auth_id", userId)
          .single();
        if (userRec?.organization_id) {
          orgId = userRec.organization_id;
          break;
        }
      }

      // Fallback: create org + user manually
      if (!orgId) {
        const { data: newOrg, error: orgErr } = await admin
          .from("organizations")
          .insert({ name: acct.companyName })
          .select("id")
          .single();
        if (orgErr || !newOrg) {
          results.push({ email: acct.email, status: "org_create_error", error: orgErr?.message });
          continue;
        }
        orgId = newOrg.id;
        await admin.from("users").insert({
          auth_id: userId,
          email: acct.email,
          organization_id: orgId,
          role: "owner",
        });
      }

      // 3. Update org with tier + profile
      const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const orgUpdate: Record<string, any> = {
        name: acct.companyName,
        subscription_status: acct.tier === "discovery" ? "trialing" : "active",
        subscription_tier: acct.tier,
        trial_ends_at: trialEnds,
        plan: acct.tier,
        ...acct.profile,
      };
      await admin.from("organizations").update(orgUpdate).eq("id", orgId);

      // 4. Create user preferences
      await admin.from("user_preferences").upsert({
        organization_id: orgId,
        default_page: acct.profile.onboarding_complete ? "dashboard" : "get-started",
        checklist_account_created: true,
        onboarding_completed: !!acct.profile.onboarding_complete,
      }, { onConflict: "organization_id" });

      results.push({
        email: acct.email,
        status: "created",
        orgId,
        tier: acct.tier,
        profileLevel: Object.keys(acct.profile).length === 0 ? "minimal" :
          acct.profile.setup_wizard_complete ? "complete" : "partial",
      });

    } catch (err: any) {
      results.push({ email: acct.email, status: "exception", error: err.message });
    }
  }

  return NextResponse.json({ results });
}

// GET to check what accounts exist
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  if (!authHeader) return NextResponse.json({ error: "No token" }, { status: 401 });
  const { data: { user: caller } } = await admin.auth.getUser(authHeader);
  if (!caller) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const emails = ACCOUNTS.map(a => a.email);
  const { data: users } = await admin
    .from("users")
    .select("email, organization_id, role")
    .in("email", emails);

  const orgIds = (users ?? []).map(u => u.organization_id).filter(Boolean);
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, subscription_tier, subscription_status, naics_codes, certifications, onboarding_complete, setup_wizard_complete")
    .in("id", orgIds);

  return NextResponse.json({ users, orgs });
}

// PUT — fix existing test accounts (update profiles/tiers)
export async function PATCH(request: Request) {
  const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  if (!authHeader) return NextResponse.json({ error: "No token" }, { status: 401 });
  const { data: { user: caller } } = await admin.auth.getUser(authHeader);
  if (!caller) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const results: any[] = [];

  for (const acct of ACCOUNTS) {
    // Find the user's org
    const { data: userRec } = await admin
      .from("users")
      .select("organization_id")
      .eq("email", acct.email)
      .single();

    if (!userRec?.organization_id) {
      results.push({ email: acct.email, status: "not_found" });
      continue;
    }

    const orgId = userRec.organization_id;
    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Build update with only valid org columns
    const orgUpdate: Record<string, any> = {
      name: acct.companyName,
      subscription_status: acct.tier === "discovery" ? "trialing" : "active",
      subscription_tier: acct.tier,
      trial_ends_at: trialEnds,
      plan: acct.tier,
    };

    // Map profile fields to org columns (only valid ones)
    const validOrgCols = [
      "uei", "cage_code", "naics_codes", "certifications", "keywords",
      "entity_description", "serves_nationwide", "service_states",
      "preferred_agencies", "min_contract_value", "max_contract_value",
      "onboarding_complete", "setup_wizard_complete",
      "cmmc_current_level", "cmmc_target_level",
    ];
    const prof = acct.profile as Record<string, any>;
    for (const key of validOrgCols) {
      if (prof[key] !== undefined) {
        orgUpdate[key] = prof[key];
      }
    }

    const { error: updateErr } = await admin
      .from("organizations")
      .update(orgUpdate)
      .eq("id", orgId);

    if (updateErr) {
      results.push({ email: acct.email, status: "update_error", error: updateErr.message, orgId });
    } else {
      results.push({ email: acct.email, status: "updated", orgId, tier: acct.tier });
    }
  }

  return NextResponse.json({ results });
}
