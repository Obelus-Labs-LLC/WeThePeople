/**
 * Health sector API types and client methods.
 */

// ── Types ──

export interface HealthDashboardStats {
  total_companies: number;
  total_adverse_events: number;
  total_recalls: number;
  total_trials: number;
  total_payments: number;
  total_sec_filings: number;
  // Political data
  total_lobbying: number;
  total_lobbying_spend: number;
  total_contracts: number;
  total_contract_value: number;
  total_enforcement: number;
  total_penalties: number;
  by_sector: Record<string, number>;
}

export interface CompanyListItem {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  adverse_event_count: number;
  recall_count: number;
  trial_count: number;
  payment_count?: number;
}

export interface CompanyListResponse {
  total: number;
  limit: number;
  offset: number;
  companies: CompanyListItem[];
}

export interface CompanyDetail {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  fda_manufacturer_name: string | null;
  ct_sponsor_name: string | null;
  sec_cik: string | null;
  adverse_event_count: number;
  recall_count: number;
  trial_count: number;
  payment_count: number;
  filing_count: number;
  serious_event_count: number;
  lobbying_count: number;
  lobbying_spend: number;
  contract_count: number;
  contract_value: number;
  enforcement_count: number;
  penalty_total: number;
  trials_by_status: Record<string, number>;
  latest_stock: {
    snapshot_date: string | null;
    market_cap: number | null;
    pe_ratio: number | null;
    eps: number | null;
    dividend_yield: number | null;
    week_52_high: number | null;
    week_52_low: number | null;
    profit_margin: number | null;
    operating_margin: number | null;
    return_on_equity: number | null;
  } | null;
  latest_recall: {
    recall_number: string;
    classification: string | null;
    recall_initiation_date: string | null;
    product_description: string | null;
    reason_for_recall: string | null;
    status: string | null;
  } | null;
  sanctions_status?: string;
  sanctions_data?: Record<string, unknown>;
  sanctions_checked_at?: string;
  ai_profile_summary?: string;
}

export interface AdverseEventItem {
  id: number;
  report_id: string | null;
  receive_date: string | null;
  serious: number;
  drug_name: string | null;
  reaction: string | null;
  outcome: string | null;
}

export interface AdverseEventsResponse {
  total: number;
  limit: number;
  offset: number;
  adverse_events: AdverseEventItem[];
}

export interface RecallItem {
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
  recalls: RecallItem[];
}

export interface ClinicalTrialItem {
  id: number;
  nct_id: string | null;
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

export interface PaymentItem {
  id: number;
  record_id: string | null;
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
  payments: PaymentItem[];
}

export interface PaymentSummary {
  total_payments: number;
  total_amount: number;
  by_nature: Record<string, number>;
  by_specialty: Record<string, number>;
}

export interface HealthFiling {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

export interface FilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: HealthFiling[];
}

export interface HealthStockSnapshot {
  ticker: string | null;
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

export interface HealthStockResponse {
  stock: HealthStockSnapshot | null;
}

// ── Client ──

import { getApiBaseUrl } from './client';
const API_BASE = getApiBaseUrl();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getHealthDashboardStats(): Promise<HealthDashboardStats> {
  return fetchJSON<HealthDashboardStats>(`${API_BASE}/health/dashboard/stats`);
}

export async function getHealthCompanies(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<CompanyListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<CompanyListResponse>(`${API_BASE}/health/companies?${sp}`);
}

export async function getHealthCompanyDetail(companyId: string): Promise<CompanyDetail> {
  return fetchJSON<CompanyDetail>(`${API_BASE}/health/companies/${encodeURIComponent(companyId)}`);
}

export async function getHealthCompanyAdverseEvents(
  companyId: string,
  params?: { limit?: number; offset?: number }
): Promise<AdverseEventsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<AdverseEventsResponse>(`${API_BASE}/health/companies/${encodeURIComponent(companyId)}/adverse-events?${sp}`);
}

export async function getHealthCompanyRecalls(
  companyId: string,
  params?: { limit?: number; offset?: number; classification?: string }
): Promise<RecallsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.classification) sp.set('classification', params.classification);
  return fetchJSON<RecallsResponse>(`${API_BASE}/health/companies/${encodeURIComponent(companyId)}/recalls?${sp}`);
}

export async function getHealthCompanyTrials(
  companyId: string,
  params?: { limit?: number; offset?: number; status?: string; phase?: string }
): Promise<TrialsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.status) sp.set('status', params.status);
  if (params?.phase) sp.set('phase', params.phase);
  return fetchJSON<TrialsResponse>(`${API_BASE}/health/companies/${encodeURIComponent(companyId)}/trials?${sp}`);
}

export async function getHealthCompanyPayments(
  companyId: string,
  params?: { limit?: number; offset?: number }
): Promise<PaymentsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<PaymentsResponse>(`${API_BASE}/health/companies/${encodeURIComponent(companyId)}/payments?${sp}`);
}

export async function getHealthCompanyPaymentSummary(companyId: string): Promise<PaymentSummary> {
  return fetchJSON<PaymentSummary>(`${API_BASE}/health/companies/${encodeURIComponent(companyId)}/payments/summary`);
}

export async function getHealthCompanyFilings(
  companyId: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<FilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<FilingsResponse>(`${API_BASE}/health/companies/${encodeURIComponent(companyId)}/filings?${sp}`);
}

export async function getHealthCompanyStock(companyId: string): Promise<HealthStockResponse> {
  return fetchJSON<HealthStockResponse>(`${API_BASE}/health/companies/${encodeURIComponent(companyId)}/stock`);
}

// ── Political data types & functions ──

export interface HealthLobbyingFiling {
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

export interface HealthLobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: HealthLobbyingFiling[];
}

export interface HealthLobbySummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

export interface HealthContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
}

export interface HealthContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: HealthContractItem[];
}

export interface HealthEnforcementAction {
  id: number;
  case_title: string;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
}

export interface HealthEnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: HealthEnforcementAction[];
}

export async function getHealthCompanyLobbying(id: string, params?: { filing_year?: number; limit?: number; offset?: number }): Promise<HealthLobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.filing_year) sp.set('filing_year', params.filing_year.toString());
  if (params?.limit) sp.set('limit', params.limit.toString());
  if (params?.offset) sp.set('offset', params.offset.toString());
  return fetchJSON<HealthLobbyingResponse>(`${API_BASE}/health/companies/${id}/lobbying?${sp}`);
}

export async function getHealthCompanyLobbySummary(id: string): Promise<HealthLobbySummary> {
  return fetchJSON<HealthLobbySummary>(`${API_BASE}/health/companies/${id}/lobbying/summary`);
}

export async function getHealthCompanyContracts(id: string, params?: { limit?: number; offset?: number }): Promise<HealthContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set('limit', params.limit.toString());
  if (params?.offset) sp.set('offset', params.offset.toString());
  return fetchJSON<HealthContractsResponse>(`${API_BASE}/health/companies/${id}/contracts?${sp}`);
}

export async function getHealthCompanyEnforcement(id: string, params?: { limit?: number; offset?: number }): Promise<HealthEnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set('limit', params.limit.toString());
  if (params?.offset) sp.set('offset', params.offset.toString());
  return fetchJSON<HealthEnforcementResponse>(`${API_BASE}/health/companies/${id}/enforcement?${sp}`);
}
