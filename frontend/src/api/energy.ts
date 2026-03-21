/**
 * Energy sector API types and client methods.
 */

// ── Types ──

export interface EnergyDashboardStats {
  total_companies: number;
  total_filings: number;
  total_emissions_records: number;
  total_contracts: number;
  total_enforcement: number;
  // Political data
  total_lobbying?: number;
  total_lobbying_spend?: number;
  total_contract_value?: number;
  total_penalties?: number;
  by_sector: Record<string, number>;
}

export interface EnergyCompanyListItem {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  emission_count: number;
  contract_count: number;
  filing_count: number;
  enforcement_count: number;
}

export interface EnergyCompanyListResponse {
  total: number;
  limit: number;
  offset: number;
  companies: EnergyCompanyListItem[];
}

export interface EnergyCompanyDetail {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  headquarters: string | null;
  logo_url: string | null;
  sec_cik: string | null;
  emission_count: number;
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
  sanctions_data?: any;
  sanctions_checked_at?: string;
}

export interface EnergyFilingItem {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

export interface EnergyFilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: EnergyFilingItem[];
}

export interface EnergyEmissionItem {
  id: number;
  facility_name: string | null;
  facility_state: string | null;
  reporting_year: number | null;
  total_emissions: number | null;
  emission_type: string | null;
  industry_type: string | null;
  source_url: string | null;
}

export interface EnergyEmissionsResponse {
  total: number;
  total_co2e: number;
  limit: number;
  offset: number;
  emissions: EnergyEmissionItem[];
}

export interface EnergyEmissionsSummary {
  total_records: number;
  total_co2e: number;
  by_year: Record<string, { total_emissions: number; facilities: number }>;
  by_state: Record<string, { total_emissions: number; facilities: number }>;
}

export interface EnergyContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
}

export interface EnergyContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: EnergyContractItem[];
}

export interface EnergyContractSummary {
  total_contracts: number;
  total_amount: number;
  by_agency: Record<string, number>;
}

export interface EnergyLobbyingItem {
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

export interface EnergyLobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: EnergyLobbyingItem[];
}

export interface EnergyLobbySummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

export interface EnergyEnforcementItem {
  id: number;
  case_title: string | null;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
}

export interface EnergyEnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: EnergyEnforcementItem[];
}

export interface EnergyStockData {
  latest_stock: EnergyCompanyDetail['latest_stock'];
}

export interface EnergyComparisonItem {
  company_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  emission_count: number;
  total_emissions: number;
  contract_count: number;
  total_contract_value: number;
  lobbying_total: number;
  enforcement_count: number;
  total_penalties: number;
  market_cap: number | null;
  pe_ratio: number | null;
  profit_margin: number | null;
}

export interface EnergyComparisonResponse {
  companies: EnergyComparisonItem[];
}

export interface RecentActivityItem {
  type: 'enforcement' | 'contract' | 'lobbying';
  title: string;
  description: string | null;
  date: string | null;
  company_id: string;
  company_name: string;
  url: string | null;
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

export async function getEnergyDashboardStats(): Promise<EnergyDashboardStats> {
  return fetchJSON<EnergyDashboardStats>(`${API_BASE}/energy/dashboard/stats`);
}

export async function getEnergyRecentActivity(limit = 10): Promise<RecentActivityResponse> {
  return fetchJSON<RecentActivityResponse>(`${API_BASE}/energy/dashboard/recent-activity?limit=${limit}`);
}

export async function getEnergyCompanies(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<EnergyCompanyListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<EnergyCompanyListResponse>(`${API_BASE}/energy/companies?${sp}`);
}

export async function getEnergyCompanyDetail(id: string): Promise<EnergyCompanyDetail> {
  return fetchJSON<EnergyCompanyDetail>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}`);
}

export async function getEnergyCompanyFilings(
  id: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<EnergyFilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<EnergyFilingsResponse>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}/filings?${sp}`);
}

export async function getEnergyCompanyEmissions(
  id: string,
  params?: { limit?: number; offset?: number; reporting_year?: number }
): Promise<EnergyEmissionsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.reporting_year !== undefined) sp.set('reporting_year', params.reporting_year.toString());
  return fetchJSON<EnergyEmissionsResponse>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}/emissions?${sp}`);
}

export async function getEnergyCompanyEmissionsSummary(id: string): Promise<EnergyEmissionsSummary> {
  return fetchJSON<EnergyEmissionsSummary>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}/emissions/summary`);
}

export async function getEnergyCompanyContracts(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<EnergyContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<EnergyContractsResponse>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}/contracts?${sp}`);
}

export async function getEnergyCompanyContractSummary(id: string): Promise<EnergyContractSummary> {
  return fetchJSON<EnergyContractSummary>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}/contracts/summary`);
}

export async function getEnergyCompanyLobbying(
  id: string,
  params?: { limit?: number; offset?: number; filing_year?: number }
): Promise<EnergyLobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
  return fetchJSON<EnergyLobbyingResponse>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}/lobbying?${sp}`);
}

export async function getEnergyCompanyLobbySummary(id: string): Promise<EnergyLobbySummary> {
  return fetchJSON<EnergyLobbySummary>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}/lobbying/summary`);
}

export async function getEnergyCompanyEnforcement(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<EnergyEnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<EnergyEnforcementResponse>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}/enforcement?${sp}`);
}

export async function getEnergyCompanyStock(id: string): Promise<EnergyStockData> {
  return fetchJSON<EnergyStockData>(`${API_BASE}/energy/companies/${encodeURIComponent(id)}/stock`);
}

export async function getEnergyComparison(ids: string[]): Promise<EnergyComparisonResponse> {
  return fetchJSON<EnergyComparisonResponse>(`${API_BASE}/energy/compare?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`);
}
