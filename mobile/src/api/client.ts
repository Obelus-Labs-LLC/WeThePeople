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
  CommitteesListResponse,
  CommitteeDetail,
  SectorCompaniesResponse,
  SectorCompanyDetail,
  SearchResponse,
  StateDetail,
  CongressionalTradesResponse,
  InfluenceTopLobbyingItem,
  InfluenceTopContractItem,
  RecentActivityItem,
} from './types';

// Production API URL loaded from app.config.ts extra.apiUrl.
// Set WTP_API_URL env var at build time — no hardcoded IPs.
const PRODUCTION_API = 'https://api.wethepeopleforus.com';

function getApiUrl(): string {
  try {
    // Prefer env-driven value from app.config.ts if available
    const fromConfig = Constants.expoConfig?.extra?.apiUrl;
    if (fromConfig && fromConfig !== PRODUCTION_API) return fromConfig;

    const manifest = Constants.manifest ?? Constants.manifest2;
    const fromManifest = (manifest as any)?.extra?.apiUrl
      ?? (manifest as any)?.extra?.expoClient?.extra?.apiUrl;
    if (fromManifest && fromManifest !== PRODUCTION_API) return fromManifest;
  } catch (_) {
    // Constants may not be available in all contexts
  }

  return PRODUCTION_API;
}

export const API_BASE: string = getApiUrl();
const BASE_URL: string = API_BASE;

// Default network timeout for every request. Hetzner's ARM box is normally
// snappy but stalls do happen; 20s gives slow connections breathing room
// without hanging the UI forever.
export const DEFAULT_FETCH_TIMEOUT_MS = 20000;

export interface FetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

/**
 * Thrown by fetchJSON when the server returns a non-2xx. The original status
 * code is preserved so screens can distinguish 404s from 500s etc.
 */
export class ApiError extends Error {
  status: number;
  body?: string;
  constructor(status: number, message: string, body?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

class WTPClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  get base(): string {
    return this.baseUrl;
  }

  /**
   * Set the JWT access token used on every subsequent request.
   * Pass `null` to clear (logout).
   *
   * Callers (AuthContext) are responsible for persisting the token in
   * AsyncStorage — apiClient stays stateless across process restarts.
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Fetch JSON with timeout, caller abort, and a structured error.
   * - Never leaks raw HTML when the server returns a 500 with an error page
   * - Always checks response.ok before parsing
   * - Honors caller's AbortSignal so screens can cancel on unmount
   */
  async fetchJSON<T>(path: string, opts: FetchOptions = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

    // Combine caller's signal (if any) with our timeout signal
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

    const onCallerAbort = () => timeoutCtrl.abort();
    if (opts.signal) {
      if (opts.signal.aborted) timeoutCtrl.abort();
      else opts.signal.addEventListener('abort', onCallerAbort);
    }

    try {
      const response = await fetch(url, {
        method: opts.method || 'GET',
        headers: {
          Accept: 'application/json',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
          ...(opts.headers || {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: timeoutCtrl.signal,
      });

      if (!response.ok) {
        let bodyText: string | undefined;
        try {
          bodyText = await response.text();
        } catch {
          /* swallow — we just need the status */
        }
        throw new ApiError(
          response.status,
          `HTTP ${response.status}${response.statusText ? ': ' + response.statusText : ''}`,
          bodyText?.slice(0, 500)
        );
      }

      return (await response.json()) as T;
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // Distinguish timeout vs caller cancel
        if (opts.signal?.aborted) throw e; // caller cancelled; propagate
        throw new ApiError(0, `Request timed out after ${timeoutMs}ms`);
      }
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, e?.message || 'Network error');
    } finally {
      clearTimeout(timeoutId);
      if (opts.signal) opts.signal.removeEventListener('abort', onCallerAbort);
    }
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

  async getTechComparison(ids: string[], opts?: FetchOptions): Promise<TechComparisonResponse> {
    const encoded = ids.map((id) => encodeURIComponent(id)).join(',');
    return this.fetchJSON<TechComparisonResponse>(
      `${this.baseUrl}/tech/compare?ids=${encoded}`,
      opts
    );
  }

  // ── News (shared) ──

  async getNews(query: string, limit: number = 10, opts?: FetchOptions): Promise<NewsResponse> {
    return this.fetchJSON<NewsResponse>(
      `${this.baseUrl}/news/${encodeURIComponent(query)}?limit=${limit}`,
      opts
    );
  }

  // ── Bills ──

  async getBillDetail(billId: string, opts?: FetchOptions): Promise<BillDetail> {
    return this.fetchJSON<BillDetail>(
      `${this.baseUrl}/bills/${encodeURIComponent(billId)}`,
      opts
    );
  }

  // ── Committees ──

  async getCommittees(
    params?: { chamber?: string; include_subcommittees?: boolean },
    opts?: FetchOptions
  ): Promise<CommitteesListResponse> {
    const sp = new URLSearchParams();
    if (params?.chamber) sp.set('chamber', params.chamber);
    if (params?.include_subcommittees) sp.set('include_subcommittees', '1');
    const qs = sp.toString();
    return this.fetchJSON<CommitteesListResponse>(
      `${this.baseUrl}/committees${qs ? `?${qs}` : ''}`,
      opts
    );
  }

  async getCommitteeDetail(thomasId: string, opts?: FetchOptions): Promise<CommitteeDetail> {
    return this.fetchJSON<CommitteeDetail>(
      `${this.baseUrl}/committees/${encodeURIComponent(thomasId)}`,
      opts
    );
  }

  // ── ZIP → representatives ──

  async getRepresentativesByZip(
    zip: string,
    opts?: FetchOptions
  ): Promise<{ zip: string; state: string; total?: number; representatives: any[] }> {
    return this.fetchJSON(
      `${this.baseUrl}/representatives?zip=${encodeURIComponent(zip)}`,
      opts
    );
  }

  // ── Search ──

  async search(
    query: string,
    type?: 'bill' | 'person' | 'company',
    opts?: FetchOptions
  ): Promise<SearchResponse> {
    const sp = new URLSearchParams();
    sp.set('q', query);
    if (type) sp.set('type', type);
    return this.fetchJSON<SearchResponse>(`${this.baseUrl}/search?${sp}`, opts);
  }

  // ── State explorer ──

  async getStateDetail(stateCode: string, opts?: FetchOptions): Promise<StateDetail> {
    return this.fetchJSON<StateDetail>(
      `${this.baseUrl}/states/${encodeURIComponent(stateCode)}`,
      opts
    );
  }

  // ── Congressional trades ──

  async getCongressionalTrades(
    params?: { person_id?: string; ticker?: string; limit?: number; offset?: number },
    opts?: FetchOptions
  ): Promise<CongressionalTradesResponse> {
    const sp = new URLSearchParams();
    if (params?.person_id) sp.set('person_id', params.person_id);
    if (params?.ticker) sp.set('ticker', params.ticker);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<CongressionalTradesResponse>(
      `${this.baseUrl}/congressional-trades?${sp}`,
      opts
    );
  }

  // ── Influence (top-lobbying / top-contracts) ──

  async getTopLobbying(
    params?: { limit?: number; sector?: string },
    opts?: FetchOptions
  ): Promise<InfluenceTopLobbyingItem[] | { companies: InfluenceTopLobbyingItem[] }> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.sector) sp.set('sector', params.sector);
    return this.fetchJSON(`${this.baseUrl}/influence/top-lobbying?${sp}`, opts);
  }

  async getTopContracts(
    params?: { limit?: number; sector?: string },
    opts?: FetchOptions
  ): Promise<InfluenceTopContractItem[] | { companies: InfluenceTopContractItem[] }> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.sector) sp.set('sector', params.sector);
    return this.fetchJSON(`${this.baseUrl}/influence/top-contracts?${sp}`, opts);
  }

  async getInfluenceNetwork(
    params: { entity_type: string; entity_id: string; depth?: number; limit?: number },
    opts?: FetchOptions,
  ): Promise<{ nodes: any[]; edges: any[] }> {
    const sp = new URLSearchParams();
    sp.set('entity_type', params.entity_type);
    sp.set('entity_id', params.entity_id);
    sp.set('depth', String(params.depth ?? 1));
    sp.set('limit', String(params.limit ?? 100));
    return this.fetchJSON(`${this.baseUrl}/influence/network?${sp}`, opts);
  }

  async getInfluenceStats(opts?: FetchOptions): Promise<any> {
    return this.fetchJSON(`${this.baseUrl}/influence/stats`, opts);
  }

  async getSpendingByState(
    params?: { metric?: 'lobbying' | 'contracts'; sector?: string; limit?: number },
    opts?: FetchOptions,
  ): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.metric) sp.set('metric', params.metric);
    if (params?.sector) sp.set('sector', params.sector);
    if (params?.limit !== undefined) sp.set('limit', String(params.limit));
    return this.fetchJSON(`${this.baseUrl}/influence/spending-by-state?${sp}`, opts);
  }

  async getMoneyFlow(
    // Backend constrains limit to 5..50 via fastapi.Query(ge=5, le=50). Anything
    // below 5 returns 422 — clamp here so mobile callers can pass a "sensible
    // default" without thinking about the boundary.
    params?: { limit?: number; sector?: string },
    opts?: FetchOptions,
  ): Promise<{ nodes: Array<{ name: string; group: string }>; links: Array<{ source: number; target: number; value: number }> }> {
    const sp = new URLSearchParams();
    const limit = Math.max(5, Math.min(50, params?.limit ?? 15));
    sp.set('limit', String(limit));
    if (params?.sector) sp.set('sector', params.sector);
    return this.fetchJSON(`${this.baseUrl}/influence/money-flow?${sp}`, opts);
  }

  async getClosedLoops(
    params?: { entity_type?: string; entity_id?: string; min_donation?: number; year_from?: number; year_to?: number; limit?: number },
    opts?: FetchOptions,
  ): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.entity_type) sp.set('entity_type', params.entity_type);
    if (params?.entity_id) sp.set('entity_id', params.entity_id);
    if (params?.min_donation !== undefined) sp.set('min_donation', String(params.min_donation));
    if (params?.year_from !== undefined) sp.set('year_from', String(params.year_from));
    if (params?.year_to !== undefined) sp.set('year_to', String(params.year_to));
    if (params?.limit !== undefined) sp.set('limit', String(params.limit));
    return this.fetchJSON(`${this.baseUrl}/influence/closed-loops?${sp}`, opts);
  }

  // ── Anomalies / Stories ──

  async getAnomalies(
    params?: { limit?: number; offset?: number; entity_type?: string; severity?: string },
    opts?: FetchOptions,
  ): Promise<{ total: number; items: any[] }> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', String(params.limit));
    if (params?.offset !== undefined) sp.set('offset', String(params.offset));
    if (params?.entity_type) sp.set('entity_type', params.entity_type);
    if (params?.severity) sp.set('severity', params.severity);
    return this.fetchJSON(`${this.baseUrl}/anomalies?${sp}`, opts);
  }

  async getStoriesLatest(
    params?: { limit?: number; offset?: number },
    opts?: FetchOptions,
  ): Promise<{ total: number; items: any[] }> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', String(params.limit));
    if (params?.offset !== undefined) sp.set('offset', String(params.offset));
    return this.fetchJSON(`${this.baseUrl}/stories/latest?${sp}`, opts);
  }

  // ── Civic verification ──

  async getVerificationStatus(opts?: FetchOptions): Promise<any> {
    return this.fetchJSON(`${this.baseUrl}/civic/verification`, opts);
  }

  async verifyResidence(zipCode: string, opts?: FetchOptions): Promise<any> {
    return this.fetchJSON(`${this.baseUrl}/civic/verify/residence`, {
      ...(opts || {}),
      method: 'POST',
      body: { zip_code: zipCode },
    });
  }

  // ── State data (extended) ──

  async getStateLegislators(
    stateCode: string, params?: { limit?: number; offset?: number; chamber?: string },
    opts?: FetchOptions,
  ): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', String(params.limit));
    if (params?.offset !== undefined) sp.set('offset', String(params.offset));
    if (params?.chamber) sp.set('chamber', params.chamber);
    return this.fetchJSON(
      `${this.baseUrl}/states/${encodeURIComponent(stateCode)}/legislators?${sp}`,
      opts,
    );
  }

  async getStateBills(
    stateCode: string, params?: { limit?: number; offset?: number; status?: string },
    opts?: FetchOptions,
  ): Promise<any> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', String(params.limit));
    if (params?.offset !== undefined) sp.set('offset', String(params.offset));
    if (params?.status) sp.set('status', params.status);
    return this.fetchJSON(
      `${this.baseUrl}/states/${encodeURIComponent(stateCode)}/bills?${sp}`,
      opts,
    );
  }

  // ── Activity feed ──

  async getRecentActivity(
    params?: { limit?: number },
    opts?: FetchOptions
  ): Promise<RecentActivityItem[] | { activity: RecentActivityItem[] }> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    return this.fetchJSON(`${this.baseUrl}/dashboard/recent-actions?${sp}`, opts);
  }

  // ── Sector-agnostic helpers (Energy / Transport / Defense / Chemicals / Agriculture / Telecom / Education) ──
  // These talk to the sector_factory endpoints. Sector slug is the URL segment
  // the backend registers each router under.

  async getSectorCompanies(
    sector: string,
    params?: { limit?: number; offset?: number; q?: string; sector_type?: string },
    opts?: FetchOptions
  ): Promise<SectorCompaniesResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.q) sp.set('q', params.q);
    if (params?.sector_type) sp.set('sector_type', params.sector_type);
    return this.fetchJSON<SectorCompaniesResponse>(
      `${this.baseUrl}/${encodeURIComponent(sector)}/companies?${sp}`,
      opts
    );
  }

  async getSectorCompanyDetail(
    sector: string,
    companyId: string,
    opts?: FetchOptions
  ): Promise<SectorCompanyDetail> {
    return this.fetchJSON<SectorCompanyDetail>(
      `${this.baseUrl}/${encodeURIComponent(sector)}/companies/${encodeURIComponent(companyId)}`,
      opts
    );
  }

  async getSectorCompanyContracts(
    sector: string,
    companyId: string,
    params?: { limit?: number; offset?: number },
    opts?: FetchOptions
  ): Promise<ContractsResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<ContractsResponse>(
      `${this.baseUrl}/${encodeURIComponent(sector)}/companies/${encodeURIComponent(companyId)}/contracts?${sp}`,
      opts
    );
  }

  async getSectorCompanyContractSummary(
    sector: string,
    companyId: string,
    opts?: FetchOptions
  ): Promise<ContractSummary> {
    return this.fetchJSON<ContractSummary>(
      `${this.baseUrl}/${encodeURIComponent(sector)}/companies/${encodeURIComponent(companyId)}/contracts/summary`,
      opts
    );
  }

  async getSectorCompanyLobbying(
    sector: string,
    companyId: string,
    params?: { filing_year?: number; limit?: number; offset?: number },
    opts?: FetchOptions
  ): Promise<LobbyingResponse> {
    const sp = new URLSearchParams();
    if (params?.filing_year !== undefined) sp.set('filing_year', params.filing_year.toString());
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<LobbyingResponse>(
      `${this.baseUrl}/${encodeURIComponent(sector)}/companies/${encodeURIComponent(companyId)}/lobbying?${sp}`,
      opts
    );
  }

  async getSectorCompanyEnforcement(
    sector: string,
    companyId: string,
    params?: { limit?: number; offset?: number },
    opts?: FetchOptions
  ): Promise<EnforcementResponse> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<EnforcementResponse>(
      `${this.baseUrl}/${encodeURIComponent(sector)}/companies/${encodeURIComponent(companyId)}/enforcement?${sp}`,
      opts
    );
  }

  async getSectorCompanyFilings(
    sector: string,
    companyId: string,
    params?: { form_type?: string; limit?: number; offset?: number },
    opts?: FetchOptions
  ): Promise<FilingsResponse> {
    const sp = new URLSearchParams();
    if (params?.form_type) sp.set('form_type', params.form_type);
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    return this.fetchJSON<FilingsResponse>(
      `${this.baseUrl}/${encodeURIComponent(sector)}/companies/${encodeURIComponent(companyId)}/filings?${sp}`,
      opts
    );
  }

  async getSectorCompanyLobbySummary(
    sector: string,
    companyId: string,
    opts?: FetchOptions
  ): Promise<LobbyingSummary> {
    return this.fetchJSON<LobbyingSummary>(
      `${this.baseUrl}/${encodeURIComponent(sector)}/companies/${encodeURIComponent(companyId)}/lobbying/summary`,
      opts
    );
  }

  async getSectorDashboardStats(sector: string, opts?: FetchOptions): Promise<any> {
    return this.fetchJSON(
      `${this.baseUrl}/${encodeURIComponent(sector)}/dashboard/stats`,
      opts
    );
  }

  // ── Ledger (claims) ──

  async getClaim(claimId: string | number, opts?: FetchOptions): Promise<any> {
    return this.fetchJSON(
      `${this.baseUrl}/ledger/claim/${encodeURIComponent(String(claimId))}`,
      opts,
    );
  }

  // ── Civic engagement ──

  async getPromises(
    params?: { limit?: number; offset?: number; status?: string; category?: string; person_id?: string },
    opts?: FetchOptions,
  ): Promise<{ total: number; items: any[] }> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.status) sp.set('status', params.status);
    if (params?.category) sp.set('category', params.category);
    if (params?.person_id) sp.set('person_id', params.person_id);
    return this.fetchJSON(`${this.baseUrl}/civic/promises?${sp}`, opts);
  }

  async getPromise(promiseId: number | string, opts?: FetchOptions): Promise<any> {
    return this.fetchJSON(
      `${this.baseUrl}/civic/promises/${encodeURIComponent(String(promiseId))}`,
      opts,
    );
  }

  async getProposals(
    params?: { limit?: number; offset?: number; category?: string; sector?: string },
    opts?: FetchOptions,
  ): Promise<{ total: number; items: any[] }> {
    const sp = new URLSearchParams();
    if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
    if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
    if (params?.category) sp.set('category', params.category);
    if (params?.sector) sp.set('sector', params.sector);
    return this.fetchJSON(`${this.baseUrl}/civic/proposals?${sp}`, opts);
  }

  async getBadges(opts?: FetchOptions): Promise<{ total: number; items: any[] }> {
    return this.fetchJSON(`${this.baseUrl}/civic/badges`, opts);
  }

  // ── Vote detail ──

  async getVoteDetail(voteId: number | string, opts?: FetchOptions): Promise<any> {
    return this.fetchJSON(
      `${this.baseUrl}/votes/${encodeURIComponent(String(voteId))}`,
      opts,
    );
  }

  // ── Cross-sector aggregates (contracts / enforcement / lobbying) ──

  async getAggregateContracts(
    sector: string, params?: { limit?: number }, opts?: FetchOptions,
  ): Promise<{ total?: number; contracts: any[] }> {
    const sp = new URLSearchParams();
    sp.set('limit', (params?.limit ?? 500).toString());
    return this.fetchJSON(
      `${this.baseUrl}/aggregate/${encodeURIComponent(sector)}/contracts?${sp}`,
      opts,
    );
  }

  async getAggregateEnforcement(
    sector: string, params?: { limit?: number }, opts?: FetchOptions,
  ): Promise<{ total?: number; actions: any[] }> {
    const sp = new URLSearchParams();
    sp.set('limit', (params?.limit ?? 500).toString());
    return this.fetchJSON(
      `${this.baseUrl}/aggregate/${encodeURIComponent(sector)}/enforcement?${sp}`,
      opts,
    );
  }

  async getAggregateLobbying(
    sector: string, params?: { limit?: number }, opts?: FetchOptions,
  ): Promise<{ total?: number; filings: any[] }> {
    const sp = new URLSearchParams();
    sp.set('limit', (params?.limit ?? 500).toString());
    return this.fetchJSON(
      `${this.baseUrl}/aggregate/${encodeURIComponent(sector)}/lobbying?${sp}`,
      opts,
    );
  }

  // ── Auth ──

  async register(
    body: {
      email: string;
      password: string;
      display_name?: string;
      zip_code?: string;
      digest_opt_in?: boolean;
      alert_opt_in?: boolean;
    },
    opts?: FetchOptions,
  ): Promise<any> {
    return this.fetchJSON(`${this.baseUrl}/auth/register`, {
      ...(opts || {}),
      method: 'POST',
      body,
    });
  }

  async login(
    body: { email: string; password: string },
    opts?: FetchOptions,
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    return this.fetchJSON(`${this.baseUrl}/auth/login`, {
      ...(opts || {}),
      method: 'POST',
      body,
    });
  }

  async getMe(opts?: FetchOptions): Promise<any> {
    return this.fetchJSON(`${this.baseUrl}/auth/me`, opts);
  }

  async getPreferences(opts?: FetchOptions): Promise<any> {
    return this.fetchJSON(`${this.baseUrl}/auth/preferences`, opts);
  }

  async setPreferences(
    body: { zip_code?: string; digest_opt_in?: boolean; alert_opt_in?: boolean },
    opts?: FetchOptions,
  ): Promise<any> {
    return this.fetchJSON(`${this.baseUrl}/auth/preferences`, {
      ...(opts || {}),
      method: 'POST',
      body,
    });
  }

  // ── Watchlist (tracked politicians/companies/bills/sectors) ──

  async getWatchlist(opts?: FetchOptions): Promise<{ total: number; items: any[] }> {
    return this.fetchJSON(`${this.baseUrl}/auth/watchlist`, opts);
  }

  async addToWatchlist(
    body: { entity_type: string; entity_id: string; entity_name?: string; sector?: string },
    opts?: FetchOptions,
  ): Promise<{ status: string; id?: number }> {
    return this.fetchJSON(`${this.baseUrl}/auth/watchlist`, {
      ...(opts || {}),
      method: 'POST',
      body,
    });
  }

  async removeFromWatchlist(itemId: number, opts?: FetchOptions): Promise<void> {
    // 204 No Content — fetchJSON will throw on attempting to parse empty JSON.
    // Build a bespoke call that tolerates 204.
    const url = `${this.baseUrl}/auth/watchlist/${itemId}`;
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        },
        signal: timeoutCtrl.signal,
      });
      if (!response.ok && response.status !== 204) {
        const bodyText = await response.text().catch(() => undefined);
        throw new ApiError(response.status, `HTTP ${response.status}`, bodyText?.slice(0, 500));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async checkWatchlist(
    entity_type: string, entity_id: string, opts?: FetchOptions,
  ): Promise<{ watching: boolean; item_id: number | null }> {
    const sp = new URLSearchParams({ entity_type, entity_id });
    return this.fetchJSON(`${this.baseUrl}/auth/watchlist/check?${sp}`, opts);
  }

  // ── Chat agent ──

  async askChat(
    question: string,
    opts?: FetchOptions
  ): Promise<{ answer: string; actions?: Array<{ label: string; url: string }>; remaining?: number }> {
    return this.fetchJSON(`${this.baseUrl}/chat/ask`, {
      ...(opts || {}),
      method: 'POST',
      body: { question },
    });
  }
}

export const apiClient = new WTPClient(BASE_URL);
