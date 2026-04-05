import type { SupabaseClient } from "@supabase/supabase-js";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

function monthsFromNow(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

const sampleOpportunities = [
  {
    title: "IT Support Services — Fort Belvoir, VA",
    solicitation_number: "DEMO-2026-0001",
    agency: "Department of Defense",
    set_aside: "SDVOSB",
    naics_code: "541512",
    estimated_value: 847000,
    response_deadline: daysFromNow(8),
    place_of_performance: "Fort Belvoir, VA",
    description:
      "The Department of Defense requires comprehensive IT support services including network administration, helpdesk operations, and cybersecurity monitoring for approximately 2,400 end users across 12 facilities at Fort Belvoir, Virginia.",
    is_demo: true,
  },
  {
    title: "Facilities Management — Multiple Locations",
    solicitation_number: "DEMO-2026-0002",
    agency: "General Services Administration",
    set_aside: "8A",
    naics_code: "561210",
    estimated_value: 1200000,
    response_deadline: daysFromNow(15),
    place_of_performance: "Washington, DC Metro",
    description:
      "GSA requires facilities management services for multiple federal buildings in the Washington DC metropolitan area, including janitorial, maintenance, and grounds keeping.",
    is_demo: true,
  },
  {
    title: "Program Support Services",
    solicitation_number: "DEMO-2026-0003",
    agency: "Department of Health and Human Services",
    set_aside: "WOSB",
    naics_code: "541611",
    estimated_value: 320000,
    response_deadline: daysFromNow(4),
    place_of_performance: "Remote",
    description:
      "HHS seeks program management and administrative support for the Office of the Assistant Secretary for Health. Work is primarily remote with occasional on-site meetings in Rockville, MD.",
    is_demo: true,
  },
  {
    title: "Cybersecurity Assessment Services",
    solicitation_number: "DEMO-2026-0004",
    agency: "Department of Homeland Security",
    set_aside: "HUBZone",
    naics_code: "541512",
    estimated_value: 1400000,
    response_deadline: daysFromNow(21),
    place_of_performance: "Arlington, VA",
    description:
      "DHS requires cybersecurity vulnerability assessment and penetration testing services for critical infrastructure protection programs.",
    is_demo: true,
  },
  {
    title: "Logistics Support — Fort Hood",
    solicitation_number: "DEMO-2026-0005",
    agency: "Department of the Army",
    set_aside: "8A",
    naics_code: "541614",
    estimated_value: 560000,
    response_deadline: daysFromNow(12),
    place_of_performance: "Fort Hood, TX",
    description:
      "The Army requires logistics and supply chain management support services at Fort Hood, Texas, including warehouse operations, inventory management, and distribution.",
    is_demo: true,
  },
  {
    title: "Healthcare IT Modernization",
    solicitation_number: "DEMO-2026-0006",
    agency: "Department of Veterans Affairs",
    set_aside: "SDVOSB",
    naics_code: "541512",
    estimated_value: 2100000,
    response_deadline: daysFromNow(30),
    place_of_performance: "Multiple VA Facilities",
    description:
      "VA seeks IT modernization services to upgrade electronic health records systems across multiple VA medical centers. Includes data migration, system integration, and staff training.",
    is_demo: true,
  },
  {
    title: "Environmental Remediation Study",
    solicitation_number: "DEMO-2026-0007",
    agency: "Environmental Protection Agency",
    set_aside: "SBA",
    naics_code: "541620",
    estimated_value: 185000,
    response_deadline: daysFromNow(18),
    place_of_performance: "Various US Locations",
    description:
      "EPA requires environmental site assessment and remediation planning services for Superfund sites in EPA Region 3.",
    is_demo: true,
  },
];

const matchScores = [94, 71, 85, 68, 77, 91, 55];
const bidRecs = ["bid", "monitor", "bid", "monitor", "bid", "bid", "skip"];
const reasonings = [
  "Your SDVOSB certification is a direct match for this set-aside, and your NAICS 541512 experience aligns perfectly. The incumbent contract value of $780K suggests the government has budget for this scope.",
  "This 8(a) set-aside doesn't match your primary certifications, but the facilities management scope could be a secondary capability. Worth monitoring for teaming opportunities.",
  "Strong fit for your program support capabilities, and the remote work model reduces overhead costs. The short deadline means fewer competitors will have time to respond.",
  "While the cybersecurity scope matches your NAICS code, the HUBZone set-aside requires certification you may not hold. The incumbent Booz Allen Hamilton will be difficult to unseat.",
  "Your logistics experience and 8(a) certification make this a viable opportunity. The Army has a strong track record of awarding to small businesses at Fort Hood.",
  "This large-scale VA modernization contract is an excellent match for your IT capabilities and SDVOSB status. No incumbent means an open competition with level footing.",
  "This environmental remediation work falls outside your primary NAICS codes and core competencies. The low contract value and specialized requirements make this a poor use of bid resources.",
];

export async function seedDemoData(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  // Insert 7 sample opportunities
  const { data: opportunities } = await supabase
    .from("opportunities")
    .insert(sampleOpportunities)
    .select("id");

  if (!opportunities || opportunities.length === 0) return;

  // Insert 7 opportunity matches
  const matchInserts = opportunities.map((opp, i) => ({
    organization_id: orgId,
    opportunity_id: opp.id,
    match_score: matchScores[i],
    bid_recommendation: bidRecs[i],
    reasoning: reasonings[i],
    user_status: "new",
    is_demo: true,
  }));

  await supabase.from("opportunity_matches").insert(matchInserts);

  // Insert 1 sample past performance record
  const { data: ppData } = await supabase
    .from("past_performance")
    .insert({
      organization_id: orgId,
      contract_title: "Sample: VA IT Support Contract",
      agency: "Department of Veterans Affairs",
      contract_number: "DEMO-VA-2025-001",
      contract_value: 320000,
      period_of_performance: `${monthsAgo(6).split("T")[0]} to ${monthsFromNow(6).split("T")[0]}`,
      description:
        "IT support services for VA medical center including helpdesk, network administration, and cybersecurity monitoring.",
      monthly_logs: [],
      is_demo: true,
    })
    .select("id")
    .single();

  // Insert 3 performance logs for the past performance record
  if (ppData) {
    await supabase.from("performance_logs").insert([
      {
        past_performance_id: ppData.id,
        organization_id: orgId,
        month: monthsAgo(3).split("T")[0].slice(0, 7),
        summary:
          "Resolved 247 helpdesk tickets with 98% satisfaction rating. Completed quarterly network security audit ahead of schedule. Zero unplanned outages.",
        deliverables_completed: 12,
        issues_resolved: 3,
        is_demo: true,
      },
      {
        past_performance_id: ppData.id,
        organization_id: orgId,
        month: monthsAgo(2).split("T")[0].slice(0, 7),
        summary:
          "Migrated 400 users to new email platform with no downtime. Implemented two-factor authentication across all facilities. Client commended team responsiveness.",
        deliverables_completed: 8,
        issues_resolved: 1,
        is_demo: true,
      },
      {
        past_performance_id: ppData.id,
        organization_id: orgId,
        month: monthsAgo(1).split("T")[0].slice(0, 7),
        summary:
          "Deployed endpoint detection and response (EDR) solution to 2,400 workstations. Conducted staff cybersecurity training for 180 employees. Passed surprise IG inspection with zero findings.",
        deliverables_completed: 15,
        issues_resolved: 5,
        is_demo: true,
      },
    ]);
  }

  // Insert 1 sample contract
  const { data: contractData } = await supabase
    .from("contracts")
    .insert({
      organization_id: orgId,
      title: "Sample: VA IT Support Contract",
      agency: "Department of Veterans Affairs",
      contract_number: "DEMO-VA-2025-001",
      value: 320000,
      start_date: monthsAgo(6).split("T")[0],
      end_date: monthsFromNow(6).split("T")[0],
      status: "active",
      is_demo: true,
    })
    .select("id")
    .single();

  if (contractData) {
    // Insert milestones (some completed, some upcoming, one overdue)
    await supabase.from("contract_milestones").insert([
      {
        contract_id: contractData.id,
        organization_id: orgId,
        title: "Kick-off Meeting",
        due_date: daysAgo(160),
        status: "completed",
        is_demo: true,
      },
      {
        contract_id: contractData.id,
        organization_id: orgId,
        title: "Q1 Performance Report",
        due_date: daysAgo(90),
        status: "completed",
        is_demo: true,
      },
      {
        contract_id: contractData.id,
        organization_id: orgId,
        title: "Security Assessment Deliverable",
        due_date: daysAgo(45),
        status: "completed",
        is_demo: true,
      },
      {
        contract_id: contractData.id,
        organization_id: orgId,
        title: "Q2 Performance Report",
        due_date: daysAgo(3),
        status: "overdue",
        is_demo: true,
      },
      {
        contract_id: contractData.id,
        organization_id: orgId,
        title: "Mid-Year Review",
        due_date: daysFromNow(14),
        status: "upcoming",
        is_demo: true,
      },
      {
        contract_id: contractData.id,
        organization_id: orgId,
        title: "Q3 Performance Report",
        due_date: daysFromNow(90),
        status: "upcoming",
        is_demo: true,
      },
    ]);

    // Insert 2 invoices
    await supabase.from("invoices").insert([
      {
        contract_id: contractData.id,
        organization_id: orgId,
        number: "DEMO-INV-001",
        amount: 53333,
        submitted_date: daysAgo(45),
        paid_date: daysAgo(15),
        status: "paid",
        flagged_late: false,
        is_demo: true,
      },
      {
        contract_id: contractData.id,
        organization_id: orgId,
        number: "DEMO-INV-002",
        amount: 53333,
        submitted_date: daysAgo(10),
        paid_date: null,
        status: "submitted",
        flagged_late: false,
        is_demo: true,
      },
    ]);
  }
}
