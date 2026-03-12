/**
 * WTP Mobile API Client
 */
import Constants from 'expo-constants';
import type {
  PeopleResponse,
  LedgerPersonResponse,
  PersonProfile,
  PersonFinance,
  PersonPerformance,
  DashboardStats,
  RecentAction,
  FinanceDashboardStats,
  InstitutionsResponse,
  InstitutionDetail,
  FilingsResponse,
  FinancialsResponse,
  ComplaintsResponse,
  ComplaintSummary,
  HealthDashboardStats,
  CompaniesResponse,
  CompanyDetail,
  AdverseEventsResponse,
  RecallsResponse,
  TrialsResponse,
  PaymentsResponse,
  PaymentSummary,
  TechDashboardStats,
  TechCompaniesResponse,
  TechCompanyDetail,
  PatentsResponse,
  ContractsResponse,
  ContractSummary,
  ContractTrendsResponse,
  LobbyingResponse,
  LobbyingSummary,
  EnforcementResponse,
  TechComparisonResponse,
  NewsResponse,
  BillDetail,
} from './types';

// Production API URL loaded from app.config.ts extra.apiUrl.
// Set WTP_API_URL env var at build time — no hardcoded IPs.
const PRODUCTION_API = 'http://localhost:8006';

function getApiUrl(): string {
  try {
    // Prefer env-driven value from app.config.ts if available
    const fromConfig = Constants.expoConfig?.extra?.apiUrl;
    if (fromConfig && fromConfig !== 'http://localhost:8006') return fromConfig;

    const manifest = Constants.manifest ?? Constants.manifest2;
    const fromManifest = (manifest as any)?.extra?.apiUrl
      ?? (manifest as any)?.extra?.expoClient?.extra?.apiUrl;
    if (fromManifest && fromManifest !== 'http://localhost:8006') return fromManifest;
  } catch (_) {
    // Constants may not be available in all contexts
  }

  return PRODUCTION_API;
}

const BASE_URL: string = getApiUrl();

class WTPClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async fetchJSON<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async getPeople(params?: {
    active_only?: boolean;
    has_ledger?: boolean;
    limit?: number;
    offset?: number;
    q?: string;
  }): Promise<PeopleResponse> {
    const sp = new URLSearchParams();
    if (params?.active_only !== undefined) sp.set('active_only', params.active_only ? '1' : '0');
    if (params?.has_ledger !== undefined) sp.set('has_ledger', params.has_ledger ? '1' : '0');
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.q) sp.set('q', params.q);
    return this.fetchJSON<PeopleResponse>(`${this.baseUrl}/people?${sp}`);
  }

  async getLedgerForPerson(
    personId: string,
    params?: { limit?: number; offset?: number; tier?: string }
  ): Promise<LedgerPersonResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.tier) sp.set('tier', params.tier);
    return this.fetchJSON<LedgerPersonResponse>(
      `${this.baseUrl}/ledger/person/${encodeURIComponent(personId)}?${sp}`
    );
  }

  async getPersonProfile(personId: string): Promise<PersonProfile> {
    return this.fetchJSON<PersonProfile>(
      `${this.baseUrl}/people/${encodeURIComponent(personId)}/profile`
    );
  }

  async getPersonFinance(personId: string): Promise<PersonFinance> {
    return this.fetchJSON<PersonFinance>(
      `${this.baseUrl}/people/${encodeURIComponent(personId)}/finance`
    );
  }

  async getPersonPerformance(personId: string): Promise<PersonPerformance> {
    return this.fetchJSON<PersonPerformance>(
      `${this.baseUrl}/people/${encodeURIComponent(personId)}/performance`
    );
  }

  async getDashboardStats(): Promise<DashboardStats> {
    return this.fetchJSON<DashboardStats>(`${this.baseUrl}/dashboard/stats`);
  }

  async getRecentActions(limit: number = 10): Promise<RecentAction[]> {
    return this.fetchJSON<RecentAction[]>(`${this.baseUrl}/actions/recent?limit=${limit}`);
  }

  // ── Finance Sector ──

  async getFinanceDashboardStats(): Promise<FinanceDashboardStats> {
    return this.fetchJSON<FinanceDashboardStats>(`${this.baseUrl}/finance/dashboard/stats`);
  }

  async getInstitutions(params?: {
    limit?: number;
    offset?: number;
    q?: string;
    sector_type?: string;
  }): Promise<InstitutionsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.q) sp.set('q', params.q);
    if (params?.sector_type) sp.set('sector_type', params.sector_type);
    return this.fetchJSON<InstitutionsResponse>(`${this.baseUrl}/finance/institutions?${sp}`);
  }

  async getInstitutionDetail(id: string): Promise<InstitutionDetail> {
    return this.fetchJSON<InstitutionDetail>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}`
    );
  }

  async getInstitutionFilings(
    id: string,
    params?: { form_type?: string; limit?: number; offset?: number }
  ): Promise<FilingsResponse> {
    const sp = new URLSearchParams();
    if (params?.form_type) sp.set('form_type', params.form_type);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<FilingsResponse>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/filings?${sp}`
    );
  }

  async getInstitutionFinancials(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<FinancialsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<FinancialsResponse>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/financials?${sp}`
    );
  }

  async getInstitutionComplaints(
    id: string,
    params?: { product?: string; limit?: number; offset?: number }
  ): Promise<ComplaintsResponse> {
    const sp = new URLSearchParams();
    if (params?.product) sp.set('product', params.product);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<ComplaintsResponse>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/complaints?${sp}`
    );
  }

  async getInstitutionComplaintSummary(id: string): Promise<ComplaintSummary> {
    return this.fetchJSON<ComplaintSummary>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/complaints/summary`
    );
  }

  // ── Health Sector ──

  async getHealthDashboardStats(): Promise<HealthDashboardStats> {
    return this.fetchJSON<HealthDashboardStats>(`${this.baseUrl}/health/dashboard/stats`);
  }

  async getCompanies(params?: {
    limit?: number; offset?: number; q?: string; sector_type?: string;
  }): Promise<CompaniesResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.q) sp.set('q', params.q);
    if (params?.sector_type) sp.set('sector_type', params.sector_type);
    return this.fetchJSON<CompaniesResponse>(`${this.baseUrl}/health/companies?${sp}`);
  }

  async getCompanyDetail(id: string): Promise<CompanyDetail> {
    return this.fetchJSON<CompanyDetail>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}`
    );
  }

  async getCompanyAdverseEvents(
    id: string, params?: { limit?: number; offset?: number }
  ): Promise<AdverseEventsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<AdverseEventsResponse>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/adverse-events?${sp}`
    );
  }

  async getCompanyRecalls(
    id: string, params?: { classification?: string; limit?: number; offset?: number }
  ): Promise<RecallsResponse> {
    const sp = new URLSearchParams();
    if (params?.classification) sp.set('classification', params.classification);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<RecallsResponse>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/recalls?${sp}`
    );
  }

  async getCompanyTrials(
    id: string, params?: { status?: string; phase?: string; limit?: number; offset?: number }
  ): Promise<TrialsResponse> {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.phase) sp.set('phase', params.phase);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<TrialsResponse>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/trials?${sp}`
    );
  }

  async getCompanyPayments(
    id: string, params?: { limit?: number; offset?: number }
  ): Promise<PaymentsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<PaymentsResponse>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/payments?${sp}`
    );
  }

  async getCompanyPaymentSummary(id: string): Promise<PaymentSummary> {
    return this.fetchJSON<PaymentSummary>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/payments/summary`
    );
  }

  // ── Technology Sector ──

  async getTechDashboardStats(): Promise<TechDashboardStats> {
    return this.fetchJSON<TechDashboardStats>(`${this.baseUrl}/tech/dashboard/stats`);
  }

  async getTechCompanies(params?: {
    limit?: number; offset?: number; q?: string; sector_type?: string;
  }): Promise<TechCompaniesResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.q) sp.set('q', params.q);
    if (params?.sector_type) sp.set('sector_type', params.sector_type);
    return this.fetchJSON<TechCompaniesResponse>(`${this.baseUrl}/tech/companies?${sp}`);
  }

  async getTechCompanyDetail(id: string): Promise<TechCompanyDetail> {
    return this.fetchJSON<TechCompanyDetail>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}`
    );
  }

  async getTechCompanyFilings(
    id: string, params?: { form_type?: string; limit?: number; offset?: number }
  ): Promise<FilingsResponse> {
    const sp = new URLSearchParams();
    if (params?.form_type) sp.set('form_type', params.form_type);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<FilingsResponse>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}/filings?${sp}`
    );
  }

  async getTechCompanyPatents(
    id: string, params?: { limit?: number; offset?: number }
  ): Promise<PatentsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<PatentsResponse>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}/patents?${sp}`
    );
  }

  async getTechCompanyContracts(
    id: string, params?: { limit?: number; offset?: number }
  ): Promise<ContractsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<ContractsResponse>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}/contracts?${sp}`
    );
  }

  async getTechCompanyContractSummary(id: string): Promise<ContractSummary> {
    return this.fetchJSON<ContractSummary>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}/contracts/summary`
    );
  }

  async getTechCompanyContractTrends(id: string): Promise<ContractTrendsResponse> {
    return this.fetchJSON<ContractTrendsResponse>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}/contracts/trends`
    );
  }

  async getTechCompanyLobbying(
    id: string, params?: { filing_year?: number; limit?: number; offset?: number }
  ): Promise<LobbyingResponse> {
    const sp = new URLSearchParams();
    if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<LobbyingResponse>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}/lobbying?${sp}`
    );
  }

  async getTechCompanyLobbySummary(id: string): Promise<LobbyingSummary> {
    return this.fetchJSON<LobbyingSummary>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}/lobbying/summary`
    );
  }

  async getTechCompanyEnforcement(
    id: string, params?: { limit?: number; offset?: number }
  ): Promise<EnforcementResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<EnforcementResponse>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}/enforcement?${sp}`
    );
  }

  async getTechComparison(ids: string[]): Promise<TechComparisonResponse> {
    return this.fetchJSON<TechComparisonResponse>(
      `${this.baseUrl}/tech/compare?ids=${ids.join(',')}`
    );
  }

  // ── News (shared) ──

  async getNews(query: string, limit: number = 10): Promise<NewsResponse> {
    return this.fetchJSON<NewsResponse>(
      `${this.baseUrl}/news/${encodeURIComponent(query)}?limit=${limit}`
    );
  }

  // ── Bills ──

  async getBillDetail(billId: string): Promise<BillDetail> {
    return this.fetchJSON<BillDetail>(
      `${this.baseUrl}/bills/${encodeURIComponent(billId)}`
    );
  }
}

export const apiClient = new WTPClient(BASE_URL);
