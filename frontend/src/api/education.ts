/**
 * Education sector API types and client methods.
 */

// ── Types ──

export interface EducationDashboardStats {
  total_companies: number;
  total_filings: number;
  total_contracts: number;
  total_enforcement: number;
  // Political data
  total_lobbying?: number;
  total_lobbying_spend?: number;
  total_contract_value?: number;
  total_penalties?: number;
  by_sector: Record<string, number>;
}

export interface EducationCompanyListItem {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  contract_count: number;
  filing_count: number;
  enforcement_count: number;
}

export interface EducationCompanyListResponse {
  total: number;
  limit: number;
  offset: number;
  companies: EducationCompanyListItem[];
}

export interface EducationCompanyDetail {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  sec_cik: string | null;
  contract_count: number;
  filing_count: number;
  enforcement_count: number;
  lobbying_count: number;
  total_contract_value: number;
  total_penalties: number;
  latest_stock: {
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
  } | null;
  sanctions_status?: string;
  sanctions_data?: Record<string, unknown>;
  sanctions_checked_at?: string;
}

export interface EducationFilingItem {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

export interface EducationFilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: EducationFilingItem[];
}

export interface EducationContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
}

export interface EducationContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: EducationContractItem[];
}

export interface EducationContractSummary {
  total_contracts: number;
  total_amount: number;
  by_agency: Record<string, number>;
}

export interface EducationLobbyingItem {
  id: number;
  filing_uuid: string | null;
  filing_year: number | null;
  filing_period: string | null;
  income: number | null;
  expenses: number | null;
  registrant_name: string | null;
  client_name: string | null;
  lobbying_issues: string | null;
  government_entities: string | null;
}

export interface EducationLobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: EducationLobbyingItem[];
}

export interface EducationLobbySummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

export interface EducationEnforcementItem {
  id: number;
  case_title: string | null;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
}

export interface EducationEnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: EducationEnforcementItem[];
}

export interface EducationDonationItem {
  id: number;
  recipient_name: string | null;
  amount: number | null;
  date: string | null;
  committee_id: string | null;
  contributor_name: string | null;
  party: string | null;
}

export interface EducationDonationsResponse {
  total: number;
  limit: number;
  offset: number;
  donations: EducationDonationItem[];
}

export interface EducationStockData {
  latest_stock: EducationCompanyDetail['latest_stock'];
}

export interface EducationComparisonItem {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  contract_count: number;
  total_contract_value: number;
  lobbying_total: number;
  enforcement_count: number;
  total_penalties: number;
  market_cap: number | null;
  pe_ratio: number | null;
  profit_margin: number | null;
}

export interface EducationComparisonResponse {
  companies: EducationComparisonItem[];
}

export interface RecentActivityItem {
  type: 'enforcement' | 'contract' | 'lobbying';
  title: string;
  description: string | null;
  date: string | null;
  company_id: string;
  company_name: string;
  url: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- meta contains dynamic fields (award_amount, penalty_amount, income) from various activity types
  meta: Record<string, any>;
}

export interface RecentActivityResponse {
  items: RecentActivityItem[];
}

// ── Client ──

import { getApiBaseUrl } from './client';
const API_BASE = getApiBaseUrl();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getEducationDashboardStats(): Promise<EducationDashboardStats> {
  return fetchJSON<EducationDashboardStats>(`${API_BASE}/education/dashboard/stats`);
}

export async function getEducationRecentActivity(limit = 10): Promise<RecentActivityResponse> {
  return fetchJSON<RecentActivityResponse>(`${API_BASE}/education/dashboard/recent-activity?limit=${limit}`);
}

export async function getEducationCompanies(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<EducationCompanyListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<EducationCompanyListResponse>(`${API_BASE}/education/companies?${sp}`);
}

export async function getEducationCompanyDetail(id: string): Promise<EducationCompanyDetail> {
  return fetchJSON<EducationCompanyDetail>(`${API_BASE}/education/companies/${encodeURIComponent(id)}`);
}

export async function getEducationCompanyFilings(
  id: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<EducationFilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<EducationFilingsResponse>(`${API_BASE}/education/companies/${encodeURIComponent(id)}/filings?${sp}`);
}

export async function getEducationCompanyContracts(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<EducationContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<EducationContractsResponse>(`${API_BASE}/education/companies/${encodeURIComponent(id)}/contracts?${sp}`);
}

export async function getEducationCompanyContractSummary(id: string): Promise<EducationContractSummary> {
  return fetchJSON<EducationContractSummary>(`${API_BASE}/education/companies/${encodeURIComponent(id)}/contracts/summary`);
}

export async function getEducationCompanyLobbying(
  id: string,
  params?: { limit?: number; offset?: number; filing_year?: number }
): Promise<EducationLobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
  return fetchJSON<EducationLobbyingResponse>(`${API_BASE}/education/companies/${encodeURIComponent(id)}/lobbying?${sp}`);
}

export async function getEducationCompanyLobbySummary(id: string): Promise<EducationLobbySummary> {
  return fetchJSON<EducationLobbySummary>(`${API_BASE}/education/companies/${encodeURIComponent(id)}/lobbying/summary`);
}

export async function getEducationCompanyEnforcement(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<EducationEnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<EducationEnforcementResponse>(`${API_BASE}/education/companies/${encodeURIComponent(id)}/enforcement?${sp}`);
}

export async function getEducationCompanyDonations(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<EducationDonationsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<EducationDonationsResponse>(`${API_BASE}/education/companies/${encodeURIComponent(id)}/donations?${sp}`);
}

export async function getEducationCompanyStock(id: string): Promise<EducationStockData> {
  return fetchJSON<EducationStockData>(`${API_BASE}/education/companies/${encodeURIComponent(id)}/stock`);
}

export async function getEducationComparison(ids: string[]): Promise<EducationComparisonResponse> {
  return fetchJSON<EducationComparisonResponse>(`${API_BASE}/education/compare?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`);
}
