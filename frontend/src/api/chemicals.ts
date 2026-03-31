/**
 * Chemicals sector API types and client methods.
 */

// ── Types ──

export interface ChemicalDashboardStats {
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

export interface ChemicalCompanyListItem {
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

export interface ChemicalCompanyListResponse {
  total: number;
  limit: number;
  offset: number;
  companies: ChemicalCompanyListItem[];
}

export interface ChemicalCompanyDetail {
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

export interface ChemicalFilingItem {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

export interface ChemicalFilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: ChemicalFilingItem[];
}

export interface ChemicalContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
}

export interface ChemicalContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: ChemicalContractItem[];
}

export interface ChemicalContractSummary {
  total_contracts: number;
  total_amount: number;
  by_agency: Record<string, number>;
}

export interface ChemicalLobbyingItem {
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

export interface ChemicalLobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: ChemicalLobbyingItem[];
}

export interface ChemicalLobbySummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

export interface ChemicalEnforcementItem {
  id: number;
  case_title: string | null;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
}

export interface ChemicalEnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: ChemicalEnforcementItem[];
}

export interface ChemicalStockData {
  latest_stock: ChemicalCompanyDetail['latest_stock'];
}

export interface ChemicalComparisonItem {
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

export interface ChemicalComparisonResponse {
  companies: ChemicalComparisonItem[];
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

export async function getChemicalsDashboardStats(): Promise<ChemicalDashboardStats> {
  return fetchJSON<ChemicalDashboardStats>(`${API_BASE}/chemicals/dashboard/stats`);
}

export async function getChemicalsRecentActivity(limit = 10): Promise<RecentActivityResponse> {
  return fetchJSON<RecentActivityResponse>(`${API_BASE}/chemicals/dashboard/recent-activity?limit=${limit}`);
}

export async function getChemicalsCompanies(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<ChemicalCompanyListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<ChemicalCompanyListResponse>(`${API_BASE}/chemicals/companies?${sp}`);
}

export async function getChemicalsCompanyDetail(id: string): Promise<ChemicalCompanyDetail> {
  return fetchJSON<ChemicalCompanyDetail>(`${API_BASE}/chemicals/companies/${encodeURIComponent(id)}`);
}

export async function getChemicalsCompanyFilings(
  id: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<ChemicalFilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<ChemicalFilingsResponse>(`${API_BASE}/chemicals/companies/${encodeURIComponent(id)}/filings?${sp}`);
}

export async function getChemicalsCompanyContracts(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<ChemicalContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<ChemicalContractsResponse>(`${API_BASE}/chemicals/companies/${encodeURIComponent(id)}/contracts?${sp}`);
}

export async function getChemicalsCompanyContractSummary(id: string): Promise<ChemicalContractSummary> {
  return fetchJSON<ChemicalContractSummary>(`${API_BASE}/chemicals/companies/${encodeURIComponent(id)}/contracts/summary`);
}

export async function getChemicalsCompanyLobbying(
  id: string,
  params?: { limit?: number; offset?: number; filing_year?: number }
): Promise<ChemicalLobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
  return fetchJSON<ChemicalLobbyingResponse>(`${API_BASE}/chemicals/companies/${encodeURIComponent(id)}/lobbying?${sp}`);
}

export async function getChemicalsCompanyLobbySummary(id: string): Promise<ChemicalLobbySummary> {
  return fetchJSON<ChemicalLobbySummary>(`${API_BASE}/chemicals/companies/${encodeURIComponent(id)}/lobbying/summary`);
}

export async function getChemicalsCompanyEnforcement(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<ChemicalEnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<ChemicalEnforcementResponse>(`${API_BASE}/chemicals/companies/${encodeURIComponent(id)}/enforcement?${sp}`);
}

export async function getChemicalsCompanyStock(id: string): Promise<ChemicalStockData> {
  return fetchJSON<ChemicalStockData>(`${API_BASE}/chemicals/companies/${encodeURIComponent(id)}/stock`);
}

export async function getChemicalsComparison(ids: string[]): Promise<ChemicalComparisonResponse> {
  return fetchJSON<ChemicalComparisonResponse>(`${API_BASE}/chemicals/compare?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`);
}
