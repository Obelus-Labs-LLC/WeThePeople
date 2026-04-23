/**
 * Defense sector API types and client methods.
 */

// -- Types --

export interface DefenseDashboardStats {
  total_companies: number;
  total_filings: number;
  total_contracts: number;
  total_enforcement: number;
  total_lobbying?: number;
  total_lobbying_spend?: number;
  total_contract_value?: number;
  total_penalties?: number;
  by_sector: Record<string, number>;
}

export interface DefenseCompanyListItem {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  contract_count: number;
  filing_count: number;
  enforcement_count: number;
  lobbying_count: number;
}

interface DefenseCompanyListResponse {
  total: number;
  limit: number;
  offset: number;
  companies: DefenseCompanyListItem[];
}

export interface DefenseCompanyDetail {
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
  ai_profile_summary?: string;
  sanctions_status?: string;
  sanctions_data?: Record<string, unknown>;
  sanctions_checked_at?: string;
}

export interface DefenseFilingItem {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

interface DefenseFilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: DefenseFilingItem[];
}

export interface DefenseContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
  ai_summary: string | null;
}

interface DefenseContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: DefenseContractItem[];
}

export interface DefenseContractSummary {
  total_contracts: number;
  total_amount: number;
  by_agency: Record<string, number>;
}

export interface DefenseLobbyingItem {
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
  ai_summary: string | null;
}

interface DefenseLobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: DefenseLobbyingItem[];
}

export interface DefenseLobbySummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

export interface DefenseEnforcementItem {
  id: number;
  case_title: string | null;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
  ai_summary: string | null;
}

interface DefenseEnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: DefenseEnforcementItem[];
}

export interface DefenseStockData {
  latest_stock: DefenseCompanyDetail['latest_stock'];
}

export interface DefenseComparisonItem {
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

interface DefenseComparisonResponse {
  companies: DefenseComparisonItem[];
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

interface RecentActivityResponse {
  items: RecentActivityItem[];
}

// -- Donations --

export interface DefenseDonationItem {
  id: number;
  committee_name: string | null;
  committee_id: string | null;
  candidate_name: string | null;
  candidate_id: string | null;
  person_id: string | null;
  amount: number | null;
  cycle: number | null;
  donation_date: string | null;
  source_url: string | null;
}

interface DefenseDonationsResponse {
  total: number;
  total_amount: number;
  limit: number;
  offset: number;
  donations: DefenseDonationItem[];
}

// -- News --

export interface DefenseNewsItem {
  title: string;
  link: string;
  source: string;
  published: string;
}

interface DefenseNewsResponse {
  query: string;
  articles: DefenseNewsItem[];
}

// -- Client --

import { getApiBaseUrl } from './client';
const API_BASE = getApiBaseUrl();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getDefenseDashboardStats(): Promise<DefenseDashboardStats> {
  return fetchJSON<DefenseDashboardStats>(`${API_BASE}/defense/dashboard/stats`);
}

export async function getDefenseRecentActivity(limit = 10): Promise<RecentActivityResponse> {
  return fetchJSON<RecentActivityResponse>(`${API_BASE}/defense/dashboard/recent-activity?limit=${limit}`);
}

export async function getDefenseCompanies(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<DefenseCompanyListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<DefenseCompanyListResponse>(`${API_BASE}/defense/companies?${sp}`);
}

export async function getDefenseCompanyDetail(id: string): Promise<DefenseCompanyDetail> {
  return fetchJSON<DefenseCompanyDetail>(`${API_BASE}/defense/companies/${encodeURIComponent(id)}`);
}

export async function getDefenseCompanyFilings(
  id: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<DefenseFilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<DefenseFilingsResponse>(`${API_BASE}/defense/companies/${encodeURIComponent(id)}/filings?${sp}`);
}

export async function getDefenseCompanyContracts(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<DefenseContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<DefenseContractsResponse>(`${API_BASE}/defense/companies/${encodeURIComponent(id)}/contracts?${sp}`);
}

export async function getDefenseCompanyContractSummary(id: string): Promise<DefenseContractSummary> {
  return fetchJSON<DefenseContractSummary>(`${API_BASE}/defense/companies/${encodeURIComponent(id)}/contracts/summary`);
}

export async function getDefenseCompanyLobbying(
  id: string,
  params?: { limit?: number; offset?: number; filing_year?: number }
): Promise<DefenseLobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
  return fetchJSON<DefenseLobbyingResponse>(`${API_BASE}/defense/companies/${encodeURIComponent(id)}/lobbying?${sp}`);
}

export async function getDefenseCompanyLobbySummary(id: string): Promise<DefenseLobbySummary> {
  return fetchJSON<DefenseLobbySummary>(`${API_BASE}/defense/companies/${encodeURIComponent(id)}/lobbying/summary`);
}

export async function getDefenseCompanyEnforcement(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<DefenseEnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<DefenseEnforcementResponse>(`${API_BASE}/defense/companies/${encodeURIComponent(id)}/enforcement?${sp}`);
}

export async function getDefenseCompanyStock(id: string): Promise<DefenseStockData> {
  return fetchJSON<DefenseStockData>(`${API_BASE}/defense/companies/${encodeURIComponent(id)}/stock`);
}

export async function getDefenseComparison(ids: string[]): Promise<DefenseComparisonResponse> {
  return fetchJSON<DefenseComparisonResponse>(`${API_BASE}/defense/compare?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`);
}

export async function getDefenseCompanyDonations(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<DefenseDonationsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<DefenseDonationsResponse>(`${API_BASE}/defense/companies/${encodeURIComponent(id)}/donations?${sp}`);
}

export async function getDefenseCompanyNews(
  companyName: string,
  limit = 5
): Promise<DefenseNewsResponse> {
  return fetchJSON<DefenseNewsResponse>(`${API_BASE}/common/news/${encodeURIComponent(companyName)}?limit=${limit}`);
}
