/**
 * Finance sector API types and client methods.
 */

// ── Types ──

export interface FinanceDashboardStats {
  total_institutions: number;
  total_filings: number;
  total_complaints: number;
  // Political data
  total_lobbying: number;
  total_lobbying_spend: number;
  total_contracts: number;
  total_contract_value: number;
  total_enforcement: number;
  total_penalties: number;
  total_insider_trades: number;
}

export interface InstitutionListItem {
  institution_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  filing_count: number;
  complaint_count: number;
}

interface InstitutionListResponse {
  total: number;
  limit: number;
  offset: number;
  institutions: InstitutionListItem[];
}

export interface InstitutionDetail {
  institution_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  sec_cik: string | null;
  fdic_cert: string | null;
  filing_count: number;
  financial_count: number;
  complaint_count: number;
  fred_count: number;
  press_count: number;
  latest_stock: {
    snapshot_date: string | null;
    market_cap: number | null;
    pe_ratio: number | null;
    eps: number | null;
    dividend_yield: number | null;
    week_52_high: number | null;
    week_52_low: number | null;
    profit_margin: number | null;
  } | null;
  sanctions_status?: string;
  sanctions_data?: Record<string, unknown>;
  sanctions_checked_at?: string;
  ai_profile_summary?: string;
}

export interface SECFiling {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

interface FilingsResponse {
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

interface FinancialsResponse {
  total: number;
  limit: number;
  offset: number;
  financials: FDICFinancial[];
}

export interface StockSnapshot {
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

interface StockResponse {
  stock: StockSnapshot | null;
}

// ── Complaint Types ──

export interface CFPBComplaintItem {
  id: number;
  complaint_id: string;
  institution_id: string;
  company_name: string;
  date_received: string | null;
  product: string | null;
  sub_product: string | null;
  issue: string | null;
  sub_issue: string | null;
  company_response: string | null;
  timely_response: string | null;
  consumer_disputed: string | null;
  complaint_narrative: string | null;
  state: string | null;
}

interface ComplaintsListResponse {
  total: number;
  limit: number;
  offset: number;
  complaints: CFPBComplaintItem[];
}

export interface ComplaintSummary {
  total_complaints: number;
  by_product: Record<string, number>;
  by_response: Record<string, number>;
  timely_response_pct: number | null;
}

// ── Insider Trade Types ──

export interface InsiderTradeItem {
  id: number;
  institution_id: string;
  company_name: string;
  ticker: string | null;
  filer_name: string;
  filer_title: string | null;
  transaction_date: string | null;
  transaction_type: string | null;
  shares: number | null;
  price_per_share: number | null;
  total_value: number | null;
  filing_url: string | null;
}

interface InsiderTradesListResponse {
  total: number;
  limit: number;
  offset: number;
  trades: InsiderTradeItem[];
}

// ── Client ──

import { getApiBaseUrl } from './client';
const API_BASE = getApiBaseUrl();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getFinanceDashboardStats(): Promise<FinanceDashboardStats> {
  return fetchJSON<FinanceDashboardStats>(`${API_BASE}/finance/dashboard/stats`);
}

export async function getInstitutions(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<InstitutionListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<InstitutionListResponse>(`${API_BASE}/finance/institutions?${sp}`);
}

export async function getInstitutionDetail(id: string): Promise<InstitutionDetail> {
  return fetchJSON<InstitutionDetail>(`${API_BASE}/finance/institutions/${encodeURIComponent(id)}`);
}

export async function getInstitutionFilings(
  id: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<FilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<FilingsResponse>(`${API_BASE}/finance/institutions/${encodeURIComponent(id)}/filings?${sp}`);
}

export async function getInstitutionFinancials(
  id: string,
  params?: { limit?: number }
): Promise<FinancialsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  return fetchJSON<FinancialsResponse>(`${API_BASE}/finance/institutions/${encodeURIComponent(id)}/financials?${sp}`);
}

export async function getInstitutionStock(id: string): Promise<StockResponse> {
  return fetchJSON<StockResponse>(`${API_BASE}/finance/institutions/${encodeURIComponent(id)}/stock`);
}

export interface InstitutionTrendsResponse {
  years: number[];
  series: Record<string, number[]>;
}

/**
 * Per-institution trend series (revenue, lobbying spend, contract value, etc.).
 * Goes through the typed client so it inherits the 30s timeout + structured
 * error handling that raw fetch() in InstitutionPage was bypassing.
 */
export async function getInstitutionTrends(id: string): Promise<InstitutionTrendsResponse> {
  return fetchJSON<InstitutionTrendsResponse>(
    `${API_BASE}/finance/institutions/${encodeURIComponent(id)}/trends`,
  );
}

// ── Per-Institution Complaints ──

export async function getInstitutionComplaints(
  id: string,
  params?: { limit?: number; offset?: number; product?: string }
): Promise<ComplaintsListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.product) sp.set('product', params.product);
  return fetchJSON<ComplaintsListResponse>(`${API_BASE}/finance/institutions/${encodeURIComponent(id)}/complaints?${sp}`);
}

export async function getInstitutionComplaintSummary(id: string): Promise<ComplaintSummary> {
  return fetchJSON<ComplaintSummary>(`${API_BASE}/finance/institutions/${encodeURIComponent(id)}/complaints/summary`);
}

// ── Per-Institution Insider Trades ──

export async function getInstitutionInsiderTrades(
  id: string,
  params?: { limit?: number; offset?: number; transaction_type?: string }
): Promise<{ total: number; trades: Array<{ id: number; filer_name: string; filer_title: string | null; transaction_date: string | null; transaction_type: string | null; shares: number | null; price_per_share: number | null; total_value: number | null; filing_url: string | null; accession_number: string | null }> }> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.transaction_type) sp.set('transaction_type', params.transaction_type);
  return fetchJSON(`${API_BASE}/finance/institutions/${encodeURIComponent(id)}/insider-trades?${sp}`);
}

// ── Per-Institution Press Releases ──

export interface PressRelease {
  id: number;
  title: string;
  release_date: string | null;
  url: string | null;
  category: string | null;
  summary: string | null;
}

interface PressReleasesResponse {
  total: number;
  limit: number;
  offset: number;
  press_releases: PressRelease[];
}

export async function getInstitutionPressReleases(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<PressReleasesResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<PressReleasesResponse>(`${API_BASE}/finance/institutions/${encodeURIComponent(id)}/press-releases?${sp}`);
}

// ── Per-Institution FRED Data ──

export interface FREDObservation {
  id: number;
  series_id: string;
  series_title?: string | null;
  observation_date: string | null;
  value: number | null;
}

interface FREDResponse {
  total: number;
  limit: number;
  offset: number;
  observations: FREDObservation[];
}

export async function getInstitutionFRED(
  id: string,
  params?: { series_id?: string; limit?: number }
): Promise<FREDResponse> {
  const sp = new URLSearchParams();
  if (params?.series_id) sp.set('series_id', params.series_id);
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  return fetchJSON<FREDResponse>(`${API_BASE}/finance/institutions/${encodeURIComponent(id)}/fred?${sp}`);
}

// ── Global Insider Trades ──

export async function getAllInsiderTrades(params?: {
  limit?: number;
  offset?: number;
  transaction_type?: string;
}): Promise<InsiderTradesListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.transaction_type) sp.set('transaction_type', params.transaction_type);
  return fetchJSON<InsiderTradesListResponse>(`${API_BASE}/finance/insider-trades?${sp}`);
}

// ── Comparison ──

export interface ComparisonInstitution {
  institution_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  industry: string | null;
  filing_count: number;
  complaint_count: number;
  // FDIC financials
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
  // Stock fundamentals
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
}

interface ComparisonResponse {
  institutions: ComparisonInstitution[];
}

export async function getFinanceComparison(ids: string[]): Promise<ComparisonResponse> {
  return fetchJSON<ComparisonResponse>(`${API_BASE}/finance/compare?ids=${ids.join(',')}`);
}

// ── Political data types & functions ──

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

interface LobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: LobbyingFiling[];
}

export interface GovernmentContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
}

interface ContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: GovernmentContractItem[];
}

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

interface EnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: EnforcementAction[];
}

export interface DonationItem {
  id: number;
  committee_name: string | null;
  committee_id: string | null;
  candidate_name: string | null;
  candidate_id: string | null;
  person_id: string | null;
  amount: number | null;
  cycle: string | null;
  donation_date: string | null;
  source_url: string | null;
}

interface DonationsResponse {
  total: number;
  total_amount: number;
  limit: number;
  offset: number;
  donations: DonationItem[];
}

export async function getInstitutionLobbying(id: string, params?: { filing_year?: number; limit?: number; offset?: number }): Promise<LobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.filing_year) sp.set('filing_year', params.filing_year.toString());
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<LobbyingResponse>(`${API_BASE}/finance/institutions/${id}/lobbying?${sp}`);
}

export async function getInstitutionContracts(id: string, params?: { limit?: number; offset?: number }): Promise<ContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set('limit', params.limit.toString());
  if (params?.offset) sp.set('offset', params.offset.toString());
  return fetchJSON<ContractsResponse>(`${API_BASE}/finance/institutions/${id}/contracts?${sp}`);
}

export async function getInstitutionEnforcement(id: string, params?: { limit?: number; offset?: number }): Promise<EnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set('limit', params.limit.toString());
  if (params?.offset) sp.set('offset', params.offset.toString());
  return fetchJSON<EnforcementResponse>(`${API_BASE}/finance/institutions/${id}/enforcement?${sp}`);
}

export async function getInstitutionDonations(id: string, params?: { limit?: number; offset?: number }): Promise<DonationsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set('limit', params.limit.toString());
  if (params?.offset) sp.set('offset', params.offset.toString());
  return fetchJSON<DonationsResponse>(`${API_BASE}/finance/institutions/${id}/donations?${sp}`);
}
