/**
 * Tech sector API types and client methods.
 */

// ── Types ──

export interface TechDashboardStats {
  total_companies: number;
  total_filings: number;
  total_patents: number;
  total_contracts: number;
  // Political data
  total_lobbying?: number;
  total_lobbying_spend?: number;
  total_contract_value?: number;
  total_enforcement?: number;
  total_penalties?: number;
  by_sector: Record<string, number>;
}

export interface TechCompanyListItem {
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

export interface TechCompanyListResponse {
  total: number;
  limit: number;
  offset: number;
  companies: TechCompanyListItem[];
}

export interface TechCompanyDetail {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  sec_cik: string | null;
  patent_count: number;
  contract_count: number;
  filing_count: number;
  total_contract_value: number;
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
  sanctions_data?: any;
  sanctions_checked_at?: string;
  patent_policy_summary?: TechPatentPolicySummary;
}

export interface TechPatentItem {
  id: number;
  patent_number: string | null;
  patent_title: string | null;
  patent_date: string | null;
  patent_abstract: string | null;
  num_claims: number | null;
  cpc_codes: string | null;
}

export interface TechPatentsResponse {
  total: number;
  limit: number;
  offset: number;
  patents: TechPatentItem[];
}

export interface TechContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
}

export interface TechContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: TechContractItem[];
}

export interface TechContractSummary {
  total_contracts: number;
  total_amount: number;
  by_agency: Record<string, number>;
  by_type: Record<string, number>;
}

export interface TechFilingItem {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

export interface TechFilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: TechFilingItem[];
}

export interface TechLobbyingItem {
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

export interface TechLobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: TechLobbyingItem[];
}

export interface TechLobbySummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

export interface TechEnforcementItem {
  id: number;
  case_title: string | null;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
}

export interface TechEnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: TechEnforcementItem[];
}

export interface TechStockData {
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
}

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

export interface TechContractTrend {
  year: string;
  total_amount: number;
  count: number;
}

export interface TechContractTrendsResponse {
  trends: TechContractTrend[];
}

export interface TechPatentPolicyBill {
  bill_id: string;
  title: string | null;
  congress: number;
  bill_type: string;
  bill_number: number;
  policy_area: string | null;
  status_bucket: string | null;
  latest_action_text: string | null;
  latest_action_date: string | null;
}

export interface TechPatentPolicyLobbyingItem {
  id: number;
  filing_uuid: string | null;
  filing_year: number | null;
  filing_period: string | null;
  income: number | null;
  registrant_name: string | null;
  lobbying_issues: string | null;
}

export interface TechPatentPolicyResponse {
  company_id: string;
  display_name: string;
  patent_count: number;
  patent_categories: Record<string, number>;
  lobbying_on_ip_policy: number;
  ip_lobbying_spend: number;
  ip_lobbying_filings: TechPatentPolicyLobbyingItem[];
  related_bills_count: number;
  related_bills: TechPatentPolicyBill[];
}

export interface TechPatentPolicySummary {
  patent_count: number;
  lobbying_on_ip_policy: number;
  related_bills: number;
}

export interface TechRecentActivityItem {
  type: 'enforcement' | 'patent' | 'contract' | 'lobbying';
  title: string;
  description: string | null;
  date: string | null;
  company_id: string;
  company_name: string;
  url: string | null;
  meta: Record<string, any>;
}

export interface TechRecentActivityResponse {
  items: TechRecentActivityItem[];
}

// ── Client ──

import { getApiBaseUrl } from './client';
const API_BASE = getApiBaseUrl();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getTechDashboardStats(): Promise<TechDashboardStats> {
  return fetchJSON<TechDashboardStats>(`${API_BASE}/tech/dashboard/stats`);
}

export async function getTechRecentActivity(limit = 10): Promise<TechRecentActivityResponse> {
  return fetchJSON<TechRecentActivityResponse>(`${API_BASE}/tech/dashboard/recent-activity?limit=${limit}`);
}

export async function getTechCompanies(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<TechCompanyListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<TechCompanyListResponse>(`${API_BASE}/tech/companies?${sp}`);
}

export async function getTechCompanyDetail(id: string): Promise<TechCompanyDetail> {
  return fetchJSON<TechCompanyDetail>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}`);
}

export async function getTechCompanyFilings(
  id: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<TechFilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<TechFilingsResponse>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/filings?${sp}`);
}

export async function getTechCompanyPatents(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TechPatentsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TechPatentsResponse>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/patents?${sp}`);
}

export async function getTechCompanyContracts(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TechContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TechContractsResponse>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/contracts?${sp}`);
}

export async function getTechCompanyContractSummary(id: string): Promise<TechContractSummary> {
  return fetchJSON<TechContractSummary>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/contracts/summary`);
}

export async function getTechCompanyContractTrends(id: string): Promise<TechContractTrendsResponse> {
  return fetchJSON<TechContractTrendsResponse>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/contracts/trends`);
}

export async function getTechCompanyLobbying(
  id: string,
  params?: { limit?: number; offset?: number; filing_year?: number }
): Promise<TechLobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
  return fetchJSON<TechLobbyingResponse>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/lobbying?${sp}`);
}

export async function getTechCompanyLobbySummary(id: string): Promise<TechLobbySummary> {
  return fetchJSON<TechLobbySummary>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/lobbying/summary`);
}

export async function getTechCompanyEnforcement(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TechEnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TechEnforcementResponse>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/enforcement?${sp}`);
}

export async function getTechCompanyStock(id: string): Promise<TechStockData> {
  return fetchJSON<TechStockData>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/stock`);
}

export async function getTechComparison(ids: string[]): Promise<TechComparisonResponse> {
  return fetchJSON<TechComparisonResponse>(`${API_BASE}/tech/compare?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`);
}

export async function getTechCompanyPatentPolicy(id: string): Promise<TechPatentPolicyResponse> {
  return fetchJSON<TechPatentPolicyResponse>(`${API_BASE}/tech/companies/${encodeURIComponent(id)}/patent-policy`);
}
