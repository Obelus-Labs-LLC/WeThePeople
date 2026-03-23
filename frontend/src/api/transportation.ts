/**
 * Transportation sector API types and client methods.
 */

// ── Types ──

export interface TransportationDashboardStats {
  total_companies: number;
  total_filings: number;
  total_contracts: number;
  total_enforcement: number;
  total_lobbying?: number;
  total_lobbying_spend?: number;
  total_contract_value?: number;
  total_penalties?: number;
  total_recalls?: number;
  total_complaints?: number;
  total_fuel_economy_vehicles?: number;
  by_sector: Record<string, number>;
}

export interface TransportationCompanyListItem {
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

export interface TransportationCompanyListResponse {
  total: number;
  limit: number;
  offset: number;
  companies: TransportationCompanyListItem[];
}

export interface TransportationCompanyDetail {
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
  sanctions_data?: any;
  sanctions_checked_at?: string;
}

export interface TransportationFilingItem {
  id: number;
  accession_number: string | null;
  form_type: string | null;
  filing_date: string | null;
  primary_doc_url: string | null;
  filing_url: string | null;
  description: string | null;
}

export interface TransportationFilingsResponse {
  total: number;
  limit: number;
  offset: number;
  filings: TransportationFilingItem[];
}

export interface TransportationContractItem {
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

export interface TransportationContractsResponse {
  total: number;
  limit: number;
  offset: number;
  contracts: TransportationContractItem[];
}

export interface TransportationContractSummary {
  total_contracts: number;
  total_amount: number;
  by_agency: Record<string, number>;
}

export interface TransportationLobbyingItem {
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

export interface TransportationLobbyingResponse {
  total: number;
  limit: number;
  offset: number;
  filings: TransportationLobbyingItem[];
}

export interface TransportationLobbySummary {
  total_filings: number;
  total_income: number;
  by_year: Record<string, { income: number; filings: number }>;
  top_firms: Record<string, { income: number; filings: number }>;
}

export interface TransportationEnforcementItem {
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

export interface TransportationEnforcementResponse {
  total: number;
  total_penalties: number;
  limit: number;
  offset: number;
  actions: TransportationEnforcementItem[];
}

export interface TransportationStockData {
  latest_stock: TransportationCompanyDetail['latest_stock'];
}

export interface TransportationComparisonItem {
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

export interface TransportationComparisonResponse {
  companies: TransportationComparisonItem[];
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

export async function getTransportationDashboardStats(): Promise<TransportationDashboardStats> {
  return fetchJSON<TransportationDashboardStats>(`${API_BASE}/transportation/dashboard/stats`);
}

export async function getTransportationRecentActivity(limit = 10): Promise<RecentActivityResponse> {
  return fetchJSON<RecentActivityResponse>(`${API_BASE}/transportation/dashboard/recent-activity?limit=${limit}`);
}

export async function getTransportationCompanies(params?: {
  limit?: number;
  offset?: number;
  sector_type?: string;
  q?: string;
}): Promise<TransportationCompanyListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.sector_type) sp.set('sector_type', params.sector_type);
  if (params?.q) sp.set('q', params.q);
  return fetchJSON<TransportationCompanyListResponse>(`${API_BASE}/transportation/companies?${sp}`);
}

export async function getTransportationCompanyDetail(id: string): Promise<TransportationCompanyDetail> {
  return fetchJSON<TransportationCompanyDetail>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}`);
}

export async function getTransportationCompanyFilings(
  id: string,
  params?: { limit?: number; offset?: number; form_type?: string }
): Promise<TransportationFilingsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.form_type) sp.set('form_type', params.form_type);
  return fetchJSON<TransportationFilingsResponse>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/filings?${sp}`);
}

export async function getTransportationCompanyContracts(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TransportationContractsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TransportationContractsResponse>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/contracts?${sp}`);
}

export async function getTransportationCompanyContractSummary(id: string): Promise<TransportationContractSummary> {
  return fetchJSON<TransportationContractSummary>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/contracts/summary`);
}

export async function getTransportationCompanyLobbying(
  id: string,
  params?: { limit?: number; offset?: number; filing_year?: number }
): Promise<TransportationLobbyingResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
  return fetchJSON<TransportationLobbyingResponse>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/lobbying?${sp}`);
}

export async function getTransportationCompanyLobbySummary(id: string): Promise<TransportationLobbySummary> {
  return fetchJSON<TransportationLobbySummary>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/lobbying/summary`);
}

export async function getTransportationCompanyEnforcement(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TransportationEnforcementResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TransportationEnforcementResponse>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/enforcement?${sp}`);
}

export async function getTransportationCompanyStock(id: string): Promise<TransportationStockData> {
  return fetchJSON<TransportationStockData>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/stock`);
}

export async function getTransportationComparison(ids: string[]): Promise<TransportationComparisonResponse> {
  return fetchJSON<TransportationComparisonResponse>(`${API_BASE}/transportation/compare?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`);
}

// ── NHTSA Recalls ──

export interface TransportationRecallItem {
  id: number;
  recall_number: string | null;
  make: string | null;
  model: string | null;
  model_year: number | null;
  recall_date: string | null;
  component: string | null;
  summary: string | null;
  consequence: string | null;
  remedy: string | null;
  manufacturer: string | null;
}

export interface TransportationRecallsResponse {
  total: number;
  limit: number;
  offset: number;
  recalls: TransportationRecallItem[];
}

export async function getTransportationCompanyRecalls(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TransportationRecallsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TransportationRecallsResponse>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/recalls?${sp}`);
}

// ── NHTSA Complaints ──

export interface TransportationComplaintItem {
  id: number;
  odi_number: string | null;
  make: string | null;
  model: string | null;
  model_year: number | null;
  date_of_complaint: string | null;
  crash: boolean;
  fire: boolean;
  injuries: number;
  deaths: number;
  component: string | null;
  summary: string | null;
}

export interface TransportationComplaintsResponse {
  total: number;
  limit: number;
  offset: number;
  complaints: TransportationComplaintItem[];
}

export async function getTransportationCompanyComplaints(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TransportationComplaintsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TransportationComplaintsResponse>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/complaints?${sp}`);
}

// ── Fuel Economy ──

export interface TransportationFuelEconomyItem {
  id: number;
  vehicle_id: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  mpg_city: number | null;
  mpg_highway: number | null;
  mpg_combined: number | null;
  co2_tailpipe: number | null;
  fuel_type: string | null;
  vehicle_class: string | null;
  ghg_score: number | null;
  smog_rating: number | null;
}

export interface TransportationFuelEconomyResponse {
  total: number;
  limit: number;
  offset: number;
  vehicles: TransportationFuelEconomyItem[];
}

export async function getTransportationCompanyFuelEconomy(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TransportationFuelEconomyResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TransportationFuelEconomyResponse>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/fuel-economy?${sp}`);
}

// ── Donations ──

export interface TransportationDonationItem {
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

export interface TransportationDonationsResponse {
  total: number;
  total_amount: number;
  limit: number;
  offset: number;
  donations: TransportationDonationItem[];
}

export async function getTransportationCompanyDonations(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<TransportationDonationsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<TransportationDonationsResponse>(`${API_BASE}/transportation/companies/${encodeURIComponent(id)}/donations?${sp}`);
}

// ── News ──

export interface TransportationNewsItem {
  title: string;
  link: string;
  source: string;
  published: string;
}

export interface TransportationNewsResponse {
  query: string;
  articles: TransportationNewsItem[];
}

export async function getTransportationCompanyNews(
  companyName: string,
  limit = 5
): Promise<TransportationNewsResponse> {
  return fetchJSON<TransportationNewsResponse>(`${API_BASE}/common/news/${encodeURIComponent(companyName)}?limit=${limit}`);
}
