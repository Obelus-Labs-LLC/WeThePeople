/**
 * Agriculture sector API types and client methods.
 */

// ── Types ──

export interface AgricultureDashboardStats {
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

export interface AgricultureCompanyListItem {
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

interface AgricultureCompanyListResponse {
  total: number;
  limit: number;
  offset: number;
  companies: AgricultureCompanyListItem[];
}

export interface AgricultureCompanyDetail {
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
  ai_profile_summary?: string;
}

export interface AgricultureFilingItem {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

interface AgricultureFilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: AgricultureFilingItem[];
}

export interface AgricultureContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
}

interface AgricultureContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: AgricultureContractItem[];
}

export interface AgricultureContractSummary {
  total_contracts: number;
  total_amount: number;
  by_agency: Record<string, number>;
}

export interface AgricultureLobbyingItem {
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

interface AgricultureLobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: AgricultureLobbyingItem[];
}

export interface AgricultureLobbySummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

export interface AgricultureEnforcementItem {
  id: number;
  case_title: string | null;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
}

interface AgricultureEnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: AgricultureEnforcementItem[];
}

export interface AgricultureStockData {
  latest_stock: AgricultureCompanyDetail['latest_stock'];
}

export interface AgricultureComparisonItem {
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

interface AgricultureComparisonResponse {
  companies: AgricultureComparisonItem[];
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

// ── Client ──

import { getApiBaseUrl } from './client';
const API_BASE = getApiBaseUrl();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getAgricultureDashboardStats(): Promise<AgricultureDashboardStats> {
  return fetchJSON<AgricultureDashboardStats>(`${API_BASE}/agriculture/dashboard/stats`);
}

export async function getAgricultureRecentActivity(limit = 10): Promise<RecentActivityResponse> {
  return fetchJSON<RecentActivityResponse>(`${API_BASE}/agriculture/dashboard/recent-activity?limit=${limit}`);
}

export async function getAgricultureCompanies(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<AgricultureCompanyListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<AgricultureCompanyListResponse>(`${API_BASE}/agriculture/companies?${sp}`);
}

export async function getAgricultureCompanyDetail(id: string): Promise<AgricultureCompanyDetail> {
  return fetchJSON<AgricultureCompanyDetail>(`${API_BASE}/agriculture/companies/${encodeURIComponent(id)}`);
}

export async function getAgricultureCompanyFilings(
  id: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<AgricultureFilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<AgricultureFilingsResponse>(`${API_BASE}/agriculture/companies/${encodeURIComponent(id)}/filings?${sp}`);
}

export async function getAgricultureCompanyContracts(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<AgricultureContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<AgricultureContractsResponse>(`${API_BASE}/agriculture/companies/${encodeURIComponent(id)}/contracts?${sp}`);
}

export async function getAgricultureCompanyContractSummary(id: string): Promise<AgricultureContractSummary> {
  return fetchJSON<AgricultureContractSummary>(`${API_BASE}/agriculture/companies/${encodeURIComponent(id)}/contracts/summary`);
}

export async function getAgricultureCompanyLobbying(
  id: string,
  params?: { limit?: number; offset?: number; filing_year?: number }
): Promise<AgricultureLobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
  return fetchJSON<AgricultureLobbyingResponse>(`${API_BASE}/agriculture/companies/${encodeURIComponent(id)}/lobbying?${sp}`);
}

export async function getAgricultureCompanyLobbySummary(id: string): Promise<AgricultureLobbySummary> {
  return fetchJSON<AgricultureLobbySummary>(`${API_BASE}/agriculture/companies/${encodeURIComponent(id)}/lobbying/summary`);
}

export async function getAgricultureCompanyEnforcement(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<AgricultureEnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<AgricultureEnforcementResponse>(`${API_BASE}/agriculture/companies/${encodeURIComponent(id)}/enforcement?${sp}`);
}

export async function getAgricultureCompanyStock(id: string): Promise<AgricultureStockData> {
  return fetchJSON<AgricultureStockData>(`${API_BASE}/agriculture/companies/${encodeURIComponent(id)}/stock`);
}

export async function getAgricultureComparison(ids: string[]): Promise<AgricultureComparisonResponse> {
  return fetchJSON<AgricultureComparisonResponse>(`${API_BASE}/agriculture/compare?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`);
}
