/**
 * API Contract Types — matches backend exactly
 */

export interface PeopleResponse {
  total: number;
  people: Person[];
  limit: number;
  offset: number;
}

export interface Person {
  person_id: string;
  display_name: string;
  chamber: string;
  state: string;
  party: string;
  is_active: boolean;
  photo_url: string | null;
}

export interface LedgerPersonResponse {
  person_id: string;
  total: number;
  limit: number;
  offset: number;
  entries: LedgerEntry[];
}

export interface LedgerEntry {
  id: number;
  claim_id: number;
  evaluation_id: number | null;
  person_id: string;
  claim_date: string | null;
  source_url: string;
  normalized_text: string;
  intent_type: string | null;
  policy_area: string | null;
  matched_bill_id: string | null;
  best_action_id: number | null;
  score: number | null;
  tier: string;
  relevance: string | null;
  progress: string | null;
  timing: string | null;
  evidence: Record<string, any> | null;
  why: string[];
  created_at: string | null;
}

export type LedgerClaimResponse = LedgerEntry;

export interface PersonProfile {
  person_id: string;
  display_name: string;
  summary: string | null;
  thumbnail: string | null;
  wikidata_id: string | null;
  infobox: Record<string, string>;
  sections: Record<string, string>;
  url: string | null;
}

export interface PersonFinance {
  person_id: string;
  display_name: string;
  candidate_id: string | null;
  totals: {
    receipts: number;
    disbursements: number;
    cash_on_hand: number;
    debt: number;
  } | null;
  committees: Array<{
    id: string;
    name: string;
    designation: string;
  }>;
  top_donors: Array<{
    name: string;
    employer: string;
    amount: number;
  }>;
}

export interface PersonPerformance {
  person_id: string;
  total_claims: number;
  total_scored: number;
  by_tier: Record<string, number>;
  by_category: Record<string, number>;
  by_timing: Record<string, number>;
  by_progress: Record<string, number>;
  top_receipts: Array<{
    claim_id: number;
    claim_text: string;
    category: string;
    tier: string;
    relevance: string | null;
    progress: string | null;
    timing: string | null;
    score: number | null;
    action: {
      id: number;
      title: string;
      date: string | null;
      source_url: string | null;
      bill_congress: number | null;
      bill_type: string | null;
      bill_number: string | null;
      policy_area: string | null;
      latest_action_text: string | null;
      latest_action_date: string | null;
    } | null;
  }>;
}

export interface DashboardStats {
  total_people: number;
  total_claims: number;
  total_actions: number;
  total_bills: number;
  by_tier: Record<string, number>;
  match_rate: number;
}

export interface RecentAction {
  id: number;
  person_id: string;
  title: string;
  summary: string | null;
  date: string | null;
  source_url: string | null;
  bill_congress: number | null;
  bill_type: string | null;
  bill_number: string | null;
}

// ── Finance Sector Types ──

export interface FinanceDashboardStats {
  total_institutions: number;
  total_filings: number;
  total_financials: number;
  total_complaints: number;
  by_sector: Record<string, number>;
}

export interface Institution {
  institution_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  filing_count: number;
  complaint_count: number;
}

export interface InstitutionsResponse {
  total: number;
  limit: number;
  offset: number;
  institutions: Institution[];
}

export interface InstitutionDetail extends Institution {
  sec_cik: string | null;
  fdic_cert: string | null;
  financial_count: number;
  latest_financial: FinancialSnapshot | null;
}

export interface FinancialSnapshot {
  report_date: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  net_income: number | null;
  roa: number | null;
  roe: number | null;
  tier1_capital_ratio: number | null;
}

export interface SECFiling {
  id: number;
  accession_number: string;
  form_type: string;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

export interface FilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: SECFiling[];
}

export interface FDICFinancial {
  id: number;
  report_date: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  net_income: number | null;
  net_loans: number | null;
  roa: number | null;
  roe: number | null;
  tier1_capital_ratio: number | null;
  efficiency_ratio: number | null;
  noncurrent_loan_ratio: number | null;
  net_charge_off_ratio: number | null;
}

export interface FinancialsResponse {
  total: number;
  limit: number;
  offset: number;
  financials: FDICFinancial[];
}

export interface CFPBComplaint {
  id: number;
  complaint_id: string;
  date_received: string | null;
  product: string | null;
  sub_product: string | null;
  issue: string | null;
  sub_issue: string | null;
  company_response: string | null;
  timely_response: string | null;
  consumer_disputed: string | null;
  state: string | null;
}

export interface ComplaintsResponse {
  total: number;
  limit: number;
  offset: number;
  complaints: CFPBComplaint[];
}

export interface ComplaintSummary {
  total_complaints: number;
  by_product: Record<string, number>;
  by_response: Record<string, number>;
  timely_response_pct: number | null;
}

// ── News Types ──

export interface NewsArticle {
  title: string;
  link: string;
  published: string;
  source: string;
}

export interface NewsResponse {
  query: string;
  articles: NewsArticle[];
}

// ── Health Sector Types ──

export interface HealthDashboardStats {
  total_companies: number;
  total_adverse_events: number;
  total_recalls: number;
  total_trials: number;
  total_payments: number;
  by_sector: Record<string, number>;
}

export interface Company {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  adverse_event_count: number;
  recall_count: number;
  trial_count: number;
}

export interface CompaniesResponse {
  total: number;
  limit: number;
  offset: number;
  companies: Company[];
}

export interface CompanyDetail extends Company {
  fda_manufacturer_name: string | null;
  ct_sponsor_name: string | null;
  payment_count: number;
  serious_event_count: number;
  trials_by_status: Record<string, number>;
  latest_recall: {
    recall_number: string | null;
    classification: string | null;
    recall_initiation_date: string | null;
    product_description: string | null;
    reason_for_recall: string | null;
    status: string | null;
  } | null;
}

export interface FDAAdverseEvent {
  id: number;
  report_id: string;
  receive_date: string | null;
  serious: number | null;
  drug_name: string | null;
  reaction: string | null;
  outcome: string | null;
}

export interface AdverseEventsResponse {
  total: number;
  limit: number;
  offset: number;
  adverse_events: FDAAdverseEvent[];
}

export interface FDARecall {
  id: number;
  recall_number: string | null;
  classification: string | null;
  recall_initiation_date: string | null;
  product_description: string | null;
  reason_for_recall: string | null;
  status: string | null;
}

export interface RecallsResponse {
  total: number;
  limit: number;
  offset: number;
  recalls: FDARecall[];
}

export interface ClinicalTrialItem {
  id: number;
  nct_id: string;
  title: string | null;
  overall_status: string | null;
  phase: string | null;
  start_date: string | null;
  conditions: string | null;
  interventions: string | null;
  enrollment: number | null;
}

export interface TrialsResponse {
  total: number;
  limit: number;
  offset: number;
  trials: ClinicalTrialItem[];
}

export interface CMSPaymentItem {
  id: number;
  record_id: string;
  payment_date: string | null;
  amount: number | null;
  payment_nature: string | null;
  physician_name: string | null;
  physician_specialty: string | null;
  state: string | null;
}

export interface PaymentsResponse {
  total: number;
  limit: number;
  offset: number;
  payments: CMSPaymentItem[];
}

export interface PaymentSummary {
  total_payments: number;
  total_amount: number;
  by_nature: Record<string, number>;
  by_specialty: Record<string, number>;
}

// ── Technology Sector Types ──

export interface TechDashboardStats {
  total_companies: number;
  total_filings: number;
  total_patents: number;
  total_contracts: number;
  by_sector: Record<string, number>;
}

export interface TechCompany {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  patent_count: number;
  contract_count: number;
  filing_count: number;
}

export interface TechCompaniesResponse {
  total: number;
  limit: number;
  offset: number;
  companies: TechCompany[];
}

export interface TechCompanyDetail extends TechCompany {
  sec_cik: string | null;
  total_contract_value: number;
  latest_stock: StockSnapshot | null;
}

export interface StockSnapshot {
  snapshot_date: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  peg_ratio: number | null;
  price_to_book: number | null;
  eps: number | null;
  revenue_ttm: number | null;
  profit_margin: number | null;
  operating_margin: number | null;
  return_on_equity: number | null;
  dividend_yield: number | null;
  dividend_per_share: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  day_50_moving_avg: number | null;
  day_200_moving_avg: number | null;
  sector: string | null;
  industry: string | null;
}

export interface TechPatentItem {
  id: number;
  patent_number: string;
  patent_title: string | null;
  patent_date: string | null;
  patent_abstract: string | null;
  num_claims: number | null;
  cpc_codes: string | null;
}

export interface PatentsResponse {
  total: number;
  limit: number;
  offset: number;
  patents: TechPatentItem[];
}

export interface ContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
}

export interface ContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: ContractItem[];
}

export interface ContractSummary {
  total_contracts: number;
  total_amount: number;
  by_agency: Record<string, number>;
  by_type: Record<string, number>;
}

export interface ContractTrendYear {
  year: string;
  total_amount: number;
  count: number;
}

export interface ContractTrendsResponse {
  trends: ContractTrendYear[];
}

// ── Lobbying Types ──

export interface LobbyingFiling {
  id: number;
  filing_uuid: string | null;
  filing_year: number;
  filing_period: string | null;
  income: number | null;
  expenses: number | null;
  registrant_name: string | null;
  client_name: string | null;
  lobbying_issues: string | null;
  government_entities: string | null;
}

export interface LobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: LobbyingFiling[];
}

export interface LobbyingSummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

// ── Enforcement Types ──

export interface EnforcementAction {
  id: number;
  case_title: string;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
}

export interface EnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: EnforcementAction[];
}

// ── Comparison Types ──

export interface TechComparisonItem {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  patent_count: number;
  contract_count: number;
  filing_count: number;
  total_contract_value: number;
  lobbying_total: number;
  enforcement_count: number;
  total_penalties: number;
  market_cap: number | null;
  pe_ratio: number | null;
  profit_margin: number | null;
}

export interface TechComparisonResponse {
  companies: TechComparisonItem[];
}

// ── Legislative Activity Types ────────────────────────────────
export interface ActivityEntry {
  bill_id: string;
  role: string;                        // "sponsored" | "cosponsored" | "sponsor" | "cosponsor"
  congress: number | null;
  bill_type: string | null;
  bill_number: number | null;
  title: string;
  policy_area: string | null;
  status: string | null;               // "introduced" | "in_committee" | "passed_house" etc.
  latest_action: string | null;
  latest_action_date: string | null;
  summary: string | null;
  congress_url: string | null;
}

export interface ActivityResponse {
  person_id: string;
  display_name: string;
  total: number;
  sponsored_count: number;
  cosponsored_count: number;
  policy_areas: Record<string, number>;
  limit: number;
  offset: number;
  entries: ActivityEntry[];
}

// ── Bill Detail ──────────────────────────────────────────────
export interface BillDetail {
  bill_id: string;
  title: string | null;
  status_bucket: string | null;
  latest_action_date: string | null;
  introduced_date: string | null;
  sponsor_person_id: string | null;
  policy_area: string | null;
  summary_text: string | null;
  summary_date: string | null;
  full_text_url: string | null;
  is_enriched: boolean;
  source_urls: string[];
}
