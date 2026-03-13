/**
 * Finance sector API types and client methods.
 */

// ── Types ──

export interface FinanceDashboardStats {
  total_institutions: number;
  total_filings: number;
  total_complaints: number;
}

export interface InstitutionListItem {
  institution_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  logo_url: string | null;
  filing_count: number;
  complaint_count: number;
}

export interface InstitutionListResponse {
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
  fdic_cert_number: string | null;
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

export interface FilingsResponse {
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
  npl_ratio: number | null;
}

export interface FinancialsResponse {
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

export interface StockResponse {
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

export interface ComplaintsListResponse {
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

export interface InsiderTradesListResponse {
  total: number;
  limit: number;
  offset: number;
  trades: InsiderTradeItem[];
}

// ── Macro / News Types ──

export interface MacroIndicator {
  series_id: string;
  series_title: string | null;
  value: number | null;
  units: string | null;
  observation_date: string | null;
}

export interface MacroIndicatorsResponse {
  indicators: MacroIndicator[];
}

export interface SectorNewsItem {
  id: number;
  title: string | null;
  release_date: string | null;
  url: string | null;
  release_type: string | null;
}

export interface SectorNewsResponse {
  news: SectorNewsItem[];
}

// ── Client ──

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8006';

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

export interface PressReleasesResponse {
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
  observation_date: string | null;
  value: number | null;
}

export interface FREDResponse {
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

// ── Global Complaints ──

export async function getAllComplaints(params?: {
  limit?: number;
  offset?: number;
  product?: string;
}): Promise<ComplaintsListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.product) sp.set('product', params.product);
  return fetchJSON<ComplaintsListResponse>(`${API_BASE}/finance/complaints?${sp}`);
}

export async function getComplaintSummary(): Promise<ComplaintSummary> {
  return fetchJSON<ComplaintSummary>(`${API_BASE}/finance/complaints/summary`);
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

// ── Macro & News ──

export async function getMacroIndicators(): Promise<MacroIndicatorsResponse> {
  return fetchJSON<MacroIndicatorsResponse>(`${API_BASE}/finance/macro-indicators`);
}

export async function getSectorNews(limit: number = 20): Promise<SectorNewsResponse> {
  return fetchJSON<SectorNewsResponse>(`${API_BASE}/finance/sector-news?limit=${limit}`);
}

// ── Comparison ──

export interface ComparisonInstitution {
  institution_id: string;
  display_name: string;
  ticker: string | null;
  sector_type: string;
  filing_count: number;
  complaint_count: number;
  total_assets: number | null;
  total_deposits: number | null;
  net_income: number | null;
  roa: number | null;
  roe: number | null;
  tier1_capital_ratio: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  profit_margin: number | null;
}

export interface ComparisonResponse {
  institutions: ComparisonInstitution[];
}

export async function getFinanceComparison(ids: string[]): Promise<ComparisonResponse> {
  return fetchJSON<ComparisonResponse>(`${API_BASE}/finance/compare?ids=${ids.join(',')}`);
}
