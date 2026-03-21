/**
 * WTP Mobile API Client
 */
import Constants from 'expo-constants';
import type {
  PeopleResponse,
  LedgerPersonResponse,
  ActivityResponse,
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
  EnergyDashboardStats,
  EnergyCompaniesResponse,
  EnergyCompanyDetail,
  EmissionsResponse,
  EmissionsSummary,
  EnergyComparisonResponse,
  NewsResponse,
  BillDetail,
  PersonVotesResponse,
  StockResponse,
  FREDObservationsResponse,
  FinanceComparisonResponse,
  PoliticsComparisonResponse,
  InsiderTradesResponse,
  // Influence
  InfluenceStats,
  InfluenceNetworkResponse,
  SpendingByStateResponse,
  TradeTimelineResponse,
  DataFreshnessResponse,
  TopLobbyingItem,
  TopContractsItem,
  CongressionalTradesResponse,
  // Search
  GlobalSearchResponse,
  // State
  StatesListResponse,
  StateDashboardData,
  StateLegislatorsResponse,
  StateBillsResponse,
  // Representatives
  RepresentativesResponse,
  // Recent Activity
  RecentActivityResponse,
  // Health Comparison
  HealthComparisonResponse,
} from './types';

// Hardcoded production API URL.
// Overridable via app.config.ts extra.apiUrl (set WTP_API_URL env var at build time).
const PRODUCTION_API = 'https://api.wethepeopleforus.com';

function getApiUrl(): string {
  try {
    // Prefer env-driven value from app.config.ts if available
    const fromConfig = Constants.expoConfig?.extra?.apiUrl;
    if (fromConfig && fromConfig !== 'https://api.wethepeopleforus.com') return fromConfig;

    const manifest = Constants.manifest ?? Constants.manifest2;
    const fromManifest = (manifest as any)?.extra?.apiUrl
      ?? (manifest as any)?.extra?.expoClient?.extra?.apiUrl;
    if (fromManifest && fromManifest !== 'https://api.wethepeopleforus.com') return fromManifest;
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
    party?: string;
    chamber?: string;
    limit?: number;
    offset?: number;
    q?: string;
  }): Promise<PeopleResponse> {
    const sp = new URLSearchParams();
    if (params?.active_only !== undefined) sp.set('active_only', params.active_only ? '1' : '0');
    if (params?.has_ledger !== undefined) sp.set('has_ledger', params.has_ledger ? '1' : '0');
    if (params?.party) sp.set('party', params.party);
    if (params?.chamber) sp.set('chamber', params.chamber);
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

  async getPersonCommittees(personId: string): Promise<any> {
    return this.fetchJSON<any>(
      `${this.baseUrl}/people/${encodeURIComponent(personId)}/committees`
    );
  }

  async getCommittees(chamber?: string): Promise<any> {
    const sp = new URLSearchParams();
    if (chamber) sp.set('chamber', chamber);
    return this.fetchJSON<any>(`${this.baseUrl}/committees?${sp}`);
  }

  async getCommitteeMembers(committeeId: string): Promise<any> {
    return this.fetchJSON<any>(
      `${this.baseUrl}/committees/${encodeURIComponent(committeeId)}/members`
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

  async getPersonActivity(
    personId: string,
    params?: { role?: string; congress?: number; policy_area?: string; limit?: number; offset?: number }
  ): Promise<ActivityResponse> {
    const sp = new URLSearchParams();
    if (params?.role) sp.set('role', params.role);
    if (params?.congress !== undefined) sp.set('congress', params.congress.toString());
    if (params?.policy_area) sp.set('policy_area', params.policy_area);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<ActivityResponse>(
      `${this.baseUrl}/people/${encodeURIComponent(personId)}/activity?${sp}`
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

  async getCompanyFilings(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<FilingsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<FilingsResponse>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/filings?${sp}`
    );
  }

  async getCompanyStock(id: string): Promise<StockResponse> {
    return this.fetchJSON<StockResponse>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/stock`
    );
  }

  // ── Finance Sector (additional) ──

  async getInstitutionStock(id: string): Promise<StockResponse> {
    return this.fetchJSON<StockResponse>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/stock`
    );
  }

  async getInstitutionInsiderTrades(
    id: string,
    params?: { limit?: number; offset?: number; transaction_type?: string }
  ): Promise<InsiderTradesResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.transaction_type) sp.set('transaction_type', params.transaction_type);
    const qs = sp.toString();
    return this.fetchJSON<InsiderTradesResponse>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/insider-trades${qs ? `?${qs}` : ''}`
    );
  }

  async getInstitutionFRED(
    id: string,
    params?: { series_id?: string; limit?: number }
  ): Promise<FREDObservationsResponse> {
    const sp = new URLSearchParams();
    if (params?.series_id) sp.set('series_id', params.series_id);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    return this.fetchJSON<FREDObservationsResponse>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/fred?${sp}`
    );
  }

  async getFinanceComparison(ids: string[]): Promise<FinanceComparisonResponse> {
    return this.fetchJSON<FinanceComparisonResponse>(
      `${this.baseUrl}/finance/compare?ids=${ids.join(',')}`
    );
  }

  // ── Politics Sector (additional) ──

  async getPoliticsComparison(ids: string[]): Promise<PoliticsComparisonResponse> {
    return this.fetchJSON<PoliticsComparisonResponse>(
      `${this.baseUrl}/politics/compare?ids=${ids.join(',')}`
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

  // ── Energy Sector ──

  async getEnergyDashboardStats(): Promise<EnergyDashboardStats> {
    return this.fetchJSON<EnergyDashboardStats>(`${this.baseUrl}/energy/dashboard/stats`);
  }

  async getEnergyCompanies(params?: {
    limit?: number; offset?: number; q?: string; sector_type?: string;
  }): Promise<EnergyCompaniesResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.q) sp.set('q', params.q);
    if (params?.sector_type) sp.set('sector_type', params.sector_type);
    return this.fetchJSON<EnergyCompaniesResponse>(`${this.baseUrl}/energy/companies?${sp}`);
  }

  async getEnergyCompanyDetail(id: string): Promise<EnergyCompanyDetail> {
    return this.fetchJSON<EnergyCompanyDetail>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}`
    );
  }

  async getEnergyCompanyFilings(
    id: string, params?: { form_type?: string; limit?: number; offset?: number }
  ): Promise<FilingsResponse> {
    const sp = new URLSearchParams();
    if (params?.form_type) sp.set('form_type', params.form_type);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<FilingsResponse>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/filings?${sp}`
    );
  }

  async getEnergyCompanyEmissions(
    id: string, params?: { reporting_year?: number; limit?: number; offset?: number }
  ): Promise<EmissionsResponse> {
    const sp = new URLSearchParams();
    if (params?.reporting_year !== undefined) sp.set('reporting_year', params.reporting_year.toString());
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<EmissionsResponse>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/emissions?${sp}`
    );
  }

  async getEnergyCompanyEmissionsSummary(id: string): Promise<EmissionsSummary> {
    return this.fetchJSON<EmissionsSummary>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/emissions/summary`
    );
  }

  async getEnergyCompanyContracts(
    id: string, params?: { limit?: number; offset?: number }
  ): Promise<ContractsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<ContractsResponse>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/contracts?${sp}`
    );
  }

  async getEnergyCompanyContractSummary(id: string): Promise<ContractSummary> {
    return this.fetchJSON<ContractSummary>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/contracts/summary`
    );
  }

  async getEnergyCompanyLobbying(
    id: string, params?: { filing_year?: number; limit?: number; offset?: number }
  ): Promise<LobbyingResponse> {
    const sp = new URLSearchParams();
    if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<LobbyingResponse>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/lobbying?${sp}`
    );
  }

  async getEnergyCompanyLobbySummary(id: string): Promise<LobbyingSummary> {
    return this.fetchJSON<LobbyingSummary>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/lobbying/summary`
    );
  }

  async getEnergyCompanyEnforcement(
    id: string, params?: { limit?: number; offset?: number }
  ): Promise<EnforcementResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<EnforcementResponse>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/enforcement?${sp}`
    );
  }

  async getEnergyCompanyStock(id: string): Promise<StockResponse> {
    return this.fetchJSON<StockResponse>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/stock`
    );
  }

  async getEnergyComparison(ids: string[]): Promise<EnergyComparisonResponse> {
    return this.fetchJSON<EnergyComparisonResponse>(
      `${this.baseUrl}/energy/compare?ids=${ids.join(',')}`
    );
  }

  // ── News (shared) ──

  async getNews(query: string, limit: number = 10): Promise<NewsResponse> {
    return this.fetchJSON<NewsResponse>(
      `${this.baseUrl}/news/${encodeURIComponent(query)}?limit=${limit}`
    );
  }

  // ── Votes ──

  async getPersonVotes(
    personId: string,
    params?: { position?: string; limit?: number; offset?: number }
  ): Promise<PersonVotesResponse> {
    const sp = new URLSearchParams();
    if (params?.position) sp.set('position', params.position);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<PersonVotesResponse>(
      `${this.baseUrl}/people/${encodeURIComponent(personId)}/votes?${sp}`
    );
  }

  // ── Bills ──

  async getBillDetail(billId: string): Promise<BillDetail> {
    return this.fetchJSON<BillDetail>(
      `${this.baseUrl}/bills/${encodeURIComponent(billId)}`
    );
  }

  // ── Influence ──

  async getInfluenceStats(): Promise<InfluenceStats> {
    return this.fetchJSON<InfluenceStats>(`${this.baseUrl}/influence/stats`);
  }

  async getInfluenceNetwork(
    entityType: string,
    entityId: string,
    depth?: number,
    limit?: number
  ): Promise<InfluenceNetworkResponse> {
    const sp = new URLSearchParams();
    sp.set('entity_type', entityType);
    sp.set('entity_id', entityId);
    if (depth !== undefined) sp.set('depth', depth.toString());
    if (limit !== undefined) sp.set('limit', limit.toString());
    return this.fetchJSON<InfluenceNetworkResponse>(`${this.baseUrl}/influence/network?${sp}`);
  }

  async getSpendingByState(metric: string, sector?: string): Promise<SpendingByStateResponse> {
    const sp = new URLSearchParams();
    sp.set('metric', metric);
    if (sector) sp.set('sector', sector);
    return this.fetchJSON<SpendingByStateResponse>(`${this.baseUrl}/influence/spending-by-state?${sp}`);
  }

  async getTopLobbying(limit?: number): Promise<TopLobbyingItem[]> {
    const sp = new URLSearchParams();
    if (limit !== undefined) sp.set('limit', limit.toString());
    return this.fetchJSON<TopLobbyingItem[]>(`${this.baseUrl}/influence/top-lobbying?${sp}`);
  }

  async getTopContracts(limit?: number): Promise<TopContractsItem[]> {
    const sp = new URLSearchParams();
    if (limit !== undefined) sp.set('limit', limit.toString());
    return this.fetchJSON<TopContractsItem[]>(`${this.baseUrl}/influence/top-contracts?${sp}`);
  }

  async getTradeTimeline(
    ticker: string,
    personId?: string,
    range?: string
  ): Promise<TradeTimelineResponse> {
    const sp = new URLSearchParams();
    sp.set('ticker', ticker);
    if (personId) sp.set('person_id', personId);
    if (range) sp.set('range', range);
    return this.fetchJSON<TradeTimelineResponse>(`${this.baseUrl}/influence/trade-timeline?${sp}`);
  }

  async getDataFreshness(): Promise<DataFreshnessResponse> {
    return this.fetchJSON<DataFreshnessResponse>(`${this.baseUrl}/influence/data-freshness`);
  }

  async getCongressionalTrades(params?: {
    ticker?: string;
    party?: string;
    person_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<CongressionalTradesResponse> {
    const sp = new URLSearchParams();
    if (params?.ticker) sp.set('ticker', params.ticker);
    if (params?.party) sp.set('party', params.party);
    if (params?.person_id) sp.set('person_id', params.person_id);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<CongressionalTradesResponse>(`${this.baseUrl}/congressional-trades?${sp}`);
  }

  // ── Search ──

  async globalSearch(q: string): Promise<GlobalSearchResponse> {
    const sp = new URLSearchParams();
    sp.set('q', q);
    return this.fetchJSON<GlobalSearchResponse>(`${this.baseUrl}/search?${sp}`);
  }

  // ── State ──

  async getStates(): Promise<StatesListResponse> {
    return this.fetchJSON<StatesListResponse>(`${this.baseUrl}/states`);
  }

  async getStateDashboard(code: string): Promise<StateDashboardData> {
    return this.fetchJSON<StateDashboardData>(
      `${this.baseUrl}/states/${encodeURIComponent(code)}`
    );
  }

  async getStateLegislators(
    code: string,
    params?: { party?: string; chamber?: string; limit?: number; offset?: number }
  ): Promise<StateLegislatorsResponse> {
    const sp = new URLSearchParams();
    if (params?.party) sp.set('party', params.party);
    if (params?.chamber) sp.set('chamber', params.chamber);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<StateLegislatorsResponse>(
      `${this.baseUrl}/states/${encodeURIComponent(code)}/legislators?${sp}`
    );
  }

  async getStateBills(
    code: string,
    params?: { q?: string; limit?: number; offset?: number }
  ): Promise<StateBillsResponse> {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<StateBillsResponse>(
      `${this.baseUrl}/states/${encodeURIComponent(code)}/bills?${sp}`
    );
  }

  // ── Politics (additional) ──

  async getRepresentatives(zip: string): Promise<RepresentativesResponse> {
    const sp = new URLSearchParams();
    sp.set('zip', zip);
    return this.fetchJSON<RepresentativesResponse>(`${this.baseUrl}/representatives?${sp}`);
  }

  async getPersonTrades(personId: string): Promise<CongressionalTradesResponse> {
    return this.fetchJSON<CongressionalTradesResponse>(
      `${this.baseUrl}/people/${encodeURIComponent(personId)}/trades`
    );
  }

  async getPersonIndustryDonors(personId: string): Promise<any> {
    return this.fetchJSON<any>(
      `${this.baseUrl}/people/${encodeURIComponent(personId)}/industry-donors`
    );
  }

  // ── Finance (additional political data) ──

  async getInstitutionLobbying(
    id: string,
    params?: { filing_year?: number; limit?: number; offset?: number }
  ): Promise<LobbyingResponse> {
    const sp = new URLSearchParams();
    if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<LobbyingResponse>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/lobbying?${sp}`
    );
  }

  async getInstitutionLobbySummary(id: string): Promise<LobbyingSummary> {
    return this.fetchJSON<LobbyingSummary>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/lobbying/summary`
    );
  }

  async getInstitutionContracts(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<ContractsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<ContractsResponse>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/contracts?${sp}`
    );
  }

  async getInstitutionContractSummary(id: string): Promise<ContractSummary> {
    return this.fetchJSON<ContractSummary>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/contracts/summary`
    );
  }

  async getInstitutionEnforcement(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<EnforcementResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<EnforcementResponse>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/enforcement?${sp}`
    );
  }

  async getInstitutionDonations(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<any>(
      `${this.baseUrl}/finance/institutions/${encodeURIComponent(id)}/donations?${sp}`
    );
  }

  async getAllInsiderTrades(params?: {
    ticker?: string; transaction_type?: string; limit?: number; offset?: number;
  }): Promise<InsiderTradesResponse> {
    const sp = new URLSearchParams();
    if (params?.ticker) sp.set('ticker', params.ticker);
    if (params?.transaction_type) sp.set('transaction_type', params.transaction_type);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<InsiderTradesResponse>(`${this.baseUrl}/finance/insider-trades?${sp}`);
  }

  async getMacroIndicators(): Promise<any> {
    return this.fetchJSON<any>(`${this.baseUrl}/finance/macro-indicators`);
  }

  async getAllComplaints(params?: {
    product?: string; limit?: number; offset?: number;
  }): Promise<ComplaintsResponse> {
    const sp = new URLSearchParams();
    if (params?.product) sp.set('product', params.product);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<ComplaintsResponse>(`${this.baseUrl}/finance/complaints?${sp}`);
  }

  async getGlobalComplaintSummary(): Promise<ComplaintSummary> {
    return this.fetchJSON<ComplaintSummary>(`${this.baseUrl}/finance/complaints/summary`);
  }

  async getSectorNews(): Promise<NewsResponse> {
    return this.fetchJSON<NewsResponse>(`${this.baseUrl}/finance/sector-news`);
  }

  // ── Health (additional political data) ──

  async getHealthCompanyLobbying(
    id: string,
    params?: { filing_year?: number; limit?: number; offset?: number }
  ): Promise<LobbyingResponse> {
    const sp = new URLSearchParams();
    if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<LobbyingResponse>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/lobbying?${sp}`
    );
  }

  async getHealthCompanyLobbySummary(id: string): Promise<LobbyingSummary> {
    return this.fetchJSON<LobbyingSummary>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/lobbying/summary`
    );
  }

  async getHealthCompanyContracts(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<ContractsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<ContractsResponse>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/contracts?${sp}`
    );
  }

  async getHealthCompanyContractSummary(id: string): Promise<ContractSummary> {
    return this.fetchJSON<ContractSummary>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/contracts/summary`
    );
  }

  async getHealthCompanyEnforcement(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<EnforcementResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<EnforcementResponse>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/enforcement?${sp}`
    );
  }

  async getHealthCompanyDonations(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<any>(
      `${this.baseUrl}/health/companies/${encodeURIComponent(id)}/donations?${sp}`
    );
  }

  async getHealthComparison(ids: string[]): Promise<HealthComparisonResponse> {
    return this.fetchJSON<HealthComparisonResponse>(
      `${this.baseUrl}/health/compare?ids=${ids.join(',')}`
    );
  }

  // ── Tech (additional) ──

  async getTechCompanyDonations(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<any>(
      `${this.baseUrl}/tech/companies/${encodeURIComponent(id)}/donations?${sp}`
    );
  }

  async getTechRecentActivity(): Promise<RecentActivityResponse> {
    return this.fetchJSON<RecentActivityResponse>(`${this.baseUrl}/tech/dashboard/recent-activity`);
  }

  // ── Energy (additional) ──

  async getEnergyCompanyDonations(
    id: string,
    params?: { limit?: number; offset?: number }
  ): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<any>(
      `${this.baseUrl}/energy/companies/${encodeURIComponent(id)}/donations?${sp}`
    );
  }

  async getEnergyRecentActivity(): Promise<RecentActivityResponse> {
    return this.fetchJSON<RecentActivityResponse>(`${this.baseUrl}/energy/dashboard/recent-activity`);
  }

  // ── Money Flow ──

  async getMoneyFlow(sector?: string): Promise<any> {
    const sp = new URLSearchParams();
    if (sector) sp.set('sector', sector);
    return this.fetchJSON<any>(`${this.baseUrl}/influence/money-flow?${sp}`);
  }

  // ── Closed Loops ──

  async getClosedLoops(params?: { limit?: number; offset?: number }): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<any>(`${this.baseUrl}/influence/closed-loops?${sp}`);
  }

  // ── Votes ──

  async getVotes(params?: { chamber?: string; limit?: number; offset?: number }): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.chamber) sp.set('chamber', params.chamber);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<any>(`${this.baseUrl}/politics/votes?${sp}`);
  }

  async getVoteDetail(voteId: string): Promise<any> {
    return this.fetchJSON<any>(
      `${this.baseUrl}/politics/votes/${encodeURIComponent(voteId)}`
    );
  }

  // ── Balance of Power ──

  async getBalanceOfPower(): Promise<any> {
    return this.fetchJSON<any>(`${this.baseUrl}/dashboard/stats`);
  }

  // ── Patents search (global) ──

  async searchPatents(params?: { q?: string; limit?: number; offset?: number }): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<any>(`${this.baseUrl}/tech/patents?${sp}`);
  }

  // ── FDA Approvals ──

  async getFDAApprovals(params?: { q?: string; limit?: number; offset?: number }): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<any>(`${this.baseUrl}/health/fda-approvals?${sp}`);
  }

  // ── Press / News ──

  async getPressReleases(params?: { limit?: number; offset?: number }): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<any>(`${this.baseUrl}/politics/press?${sp}`);
  }

  // ── Market Movers ──

  async getMarketMovers(): Promise<any> {
    return this.fetchJSON<any>(`${this.baseUrl}/finance/market-movers`);
  }
}

export const apiClient = new WTPClient(BASE_URL);
