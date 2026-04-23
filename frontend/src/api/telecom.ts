/**
 * Telecommunications sector API types and client methods.
 */

// ── Types ──

export interface TelecomDashboardStats {
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

export interface TelecomCompanyListItem {
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

interface TelecomCompanyListResponse {
  total: number;
  limit: number;
  offset: number;
  companies: TelecomCompanyListItem[];
}

export interface TelecomCompanyDetail {
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

export interface TelecomFilingItem {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

interface TelecomFilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: TelecomFilingItem[];
}

export interface TelecomContractItem {
  id: number;
  award_id: string | null;
  award_amount: number | null;
  awarding_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
}

interface TelecomContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: TelecomContractItem[];
}

export interface TelecomContractSummary {
  total_contracts: number;
  total_amount: number;
  by_agency: Record<string, number>;
}

export interface TelecomLobbyingItem {
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

interface TelecomLobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: TelecomLobbyingItem[];
}

export interface TelecomLobbySummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

export interface TelecomEnforcementItem {
  id: number;
  case_title: string | null;
  case_date: string | null;
  case_url: string | null;
  enforcement_type: string | null;
  penalty_amount: number | null;
  description: string | null;
  source: string | null;
}

interface TelecomEnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: TelecomEnforcementItem[];
}

export interface TelecomDonationItem {
  id: number;
  recipient_name: string | null;
  amount: number | null;
  date: string | null;
  committee_id: string | null;
  contributor_name: string | null;
  party: string | null;
}

interface TelecomDonationsResponse {
  total: number;
  limit: number;
  offset: number;
  donations: TelecomDonationItem[];
}

export interface TelecomStockData {
  latest_stock: TelecomCompanyDetail['latest_stock'];
}

export interface TelecomComparisonItem {
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

interface TelecomComparisonResponse {
  companies: TelecomComparisonItem[];
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

export async function getTelecomDashboardStats(): Promise<TelecomDashboardStats> {
  return fetchJSON<TelecomDashboardStats>(`${API_BASE}/telecom/dashboard/stats`);
}

export async function getTelecomRecentActivity(limit = 10): Promise<RecentActivityResponse> {
  return fetchJSON<RecentActivityResponse>(`${API_BASE}/telecom/dashboard/recent-activity?limit=${limit}`);
}

export async function getTelecomCompanies(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<TelecomCompanyListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<TelecomCompanyListResponse>(`${API_BASE}/telecom/companies?${sp}`);
}

export async function getTelecomCompanyDetail(id: string): Promise<TelecomCompanyDetail> {
  return fetchJSON<TelecomCompanyDetail>(`${API_BASE}/telecom/companies/${encodeURIComponent(id)}`);
}

export async function getTelecomCompanyFilings(
  id: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<TelecomFilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<TelecomFilingsResponse>(`${API_BASE}/telecom/companies/${encodeURIComponent(id)}/filings?${sp}`);
}

export async function getTelecomCompanyContracts(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TelecomContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TelecomContractsResponse>(`${API_BASE}/telecom/companies/${encodeURIComponent(id)}/contracts?${sp}`);
}

export async function getTelecomCompanyContractSummary(id: string): Promise<TelecomContractSummary> {
  return fetchJSON<TelecomContractSummary>(`${API_BASE}/telecom/companies/${encodeURIComponent(id)}/contracts/summary`);
}

export async function getTelecomCompanyLobbying(
  id: string,
  params?: { limit?: number; offset?: number; filing_year?: number }
): Promise<TelecomLobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
  return fetchJSON<TelecomLobbyingResponse>(`${API_BASE}/telecom/companies/${encodeURIComponent(id)}/lobbying?${sp}`);
}

export async function getTelecomCompanyLobbySummary(id: string): Promise<TelecomLobbySummary> {
  return fetchJSON<TelecomLobbySummary>(`${API_BASE}/telecom/companies/${encodeURIComponent(id)}/lobbying/summary`);
}

export async function getTelecomCompanyEnforcement(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TelecomEnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TelecomEnforcementResponse>(`${API_BASE}/telecom/companies/${encodeURIComponent(id)}/enforcement?${sp}`);
}

export async function getTelecomCompanyDonations(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TelecomDonationsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TelecomDonationsResponse>(`${API_BASE}/telecom/companies/${encodeURIComponent(id)}/donations?${sp}`);
}

export async function getTelecomCompanyStock(id: string): Promise<TelecomStockData> {
  return fetchJSON<TelecomStockData>(`${API_BASE}/telecom/companies/${encodeURIComponent(id)}/stock`);
}

export async function getTelecomComparison(ids: string[]): Promise<TelecomComparisonResponse> {
  return fetchJSON<TelecomComparisonResponse>(`${API_BASE}/telecom/compare?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`);
}
