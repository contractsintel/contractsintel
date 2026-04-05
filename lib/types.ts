export interface Organization {
  id: string;
  name: string;
  uei: string | null;
  cage_code: string | null;
  certifications: string[];
  naics_codes: string[];
  address: string | null;
  plan: string;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string;
  role: string;
  created_at: string;
}

export interface Opportunity {
  id: string;
  title: string;
  agency: string;
  solicitation_number: string | null;
  notice_id: string | null;
  set_aside: string | null;
  naics_code: string | null;
  place_of_performance: string | null;
  estimated_value: number | null;
  response_deadline: string | null;
  posted_date: string | null;
  description: string | null;
  sam_url: string | null;
  created_at: string;
}

export interface OpportunityMatch {
  id: string;
  organization_id: string;
  opportunity_id: string;
  match_score: number;
  bid_recommendation: string;
  reasoning: string | null;
  user_status: string | null;
  pipeline_stage: string | null;
  award_amount: number | null;
  contract_number: string | null;
  loss_reason: string | null;
  loss_notes: string | null;
  created_at: string;
  opportunities?: Opportunity;
}

export interface ComplianceItem {
  id: string;
  organization_id: string;
  category: string;
  title: string;
  status: string;
  due_date: string | null;
  details: string | null;
  created_at: string;
}

export interface PastPerformance {
  id: string;
  organization_id: string;
  contract_title: string;
  agency: string;
  contract_number: string | null;
  period_of_performance: string | null;
  contract_value: number | null;
  description: string | null;
  monthly_logs: Record<string, string>[];
  ppq_narrative: string | null;
  created_at: string;
}

export interface Contract {
  id: string;
  organization_id: string;
  title: string;
  agency: string;
  contract_number: string;
  value: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  milestones: Milestone[];
  option_periods: OptionPeriod[];
  invoices: Invoice[];
  created_at: string;
}

export interface Milestone {
  id: string;
  title: string;
  due_date: string;
  status: string;
}

export interface OptionPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  exercised: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  amount: number;
  submitted_date: string;
  paid_date: string | null;
  status: string;
  flagged_late: boolean;
}

export interface DashboardContext {
  user: UserProfile;
  organization: Organization;
}
