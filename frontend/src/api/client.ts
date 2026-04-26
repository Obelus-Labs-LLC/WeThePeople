/**
 * WTP API Client - Type-safe wrapper with runtime validation
 *
 * Usage:
 *   const client = new WTPClient(getApiBaseUrl());
 *   const people = await client.getPeople({ has_ledger: true, limit: 10 });
 *
 * If the backend contract is violated, this throws ContractViolationError
 * immediately rather than silently passing bad data to the UI.
 */

import type {
  PeopleResponse,
  LedgerPersonResponse,
  LedgerClaimResponse,
  BillResponse,
  BillTimelineResponse,
  PersonProfile,
  PersonFinance,
  PersonPerformance,
  PersonStats,
  PersonActivityResponse,
  PersonVotesResponse,
  PersonGraphResponse,
  VoteDetailResponse,
  ActionSearchResponse,
  DashboardStats,
  BalanceOfPower,
  ChamberPartyBreakdown,
  PersonCommitteesResponse,
  RecentAction,
  LedgerSummary,
  CompareResponse,
  VotesResponse,
  RuntimeInfo,
} from './types';

import {
  validatePeopleResponse,
  validateLedgerPersonResponse,
  validateLedgerClaimResponse,
  validateBillResponse,
  validateBillTimelineResponse,
  validateRuntimeInfo,
} from './validators';

// Helper to resolve API base URL, supporting ?api= override in dev
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    const apiOverride = url.searchParams.get('api');
    if (apiOverride) {
      try {
        const parsed = new URL(apiOverride);
        const allowed = ['localhost', '127.0.0.1', 'api.wethepeopleforus.com'];
        // Reject URLs that include a userinfo segment. `URL` resolves
        // hostname correctly for `https://attacker@victim/...` (hostname
        // is "victim", which would pass the allowlist), but the userinfo
        // can still cause the browser to send credentials to the host
        // and is a common phishing/exfil vector. Reject any url that
        // tries to use it.
        if (parsed.username || parsed.password) {
          return import.meta.env.VITE_API_BASE_URL || '/api';
        }
        if (!allowed.includes(parsed.hostname)) {
          return import.meta.env.VITE_API_BASE_URL || '/api';
        }
        // Use the parsed URL's origin + pathname rather than the raw
        // override string. This drops any trailing query/fragment a
        // caller stuffed in there, and normalises away weirdness like
        // multiple consecutive slashes.
        const normalised = parsed.origin + parsed.pathname.replace(/\/$/, '');
        return normalised;
      } catch { /* ignore invalid URLs */ }
    }
  }
  return import.meta.env.VITE_API_BASE_URL || '/api';
}

// Press API key management (localStorage)
const PRESS_KEY_STORAGE = 'wtp_press_api_key';

export function getPressApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PRESS_KEY_STORAGE) || '';
}

export function setPressApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (key) {
    localStorage.setItem(PRESS_KEY_STORAGE, key);
  } else {
    localStorage.removeItem(PRESS_KEY_STORAGE);
  }
}

export function hasPressApiKey(): boolean {
  return getPressApiKey().length > 0;
}

/**
 * Build a richer error from a non-2xx Response. We try to surface the
 * server-provided detail string (FastAPI's `{detail: "..."}` shape)
 * before falling back to status text, so callers can render an
 * actionable message instead of "HTTP 500".
 */
async function buildApiError(response: Response): Promise<Error> {
  let detail = '';
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body: unknown = await response.json();
      if (body && typeof body === 'object') {
        const d = (body as { detail?: unknown }).detail;
        if (typeof d === 'string') detail = d;
        else if (d != null) detail = JSON.stringify(d);
      }
    } else {
      const text = await response.text();
      if (text && text.length < 200) detail = text;
    }
  } catch {
    // ignore body parse errors — fall through to status-only message
  }
  const base = `HTTP ${response.status}${response.statusText ? ': ' + response.statusText : ''}`;
  const err = new Error(detail ? `${base} — ${detail}` : base);
  (err as Error & { status?: number }).status = response.status;
  return err;
}

export class WTPClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async fetchJSON<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw await buildApiError(response);
      }
      return response.json();
    } catch (e: unknown) {
      // AbortError on timeout becomes a clearer message; otherwise re-throw.
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new Error('Request timed out after 30 seconds. The API may be slow or unreachable.');
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Fetch with X-WTP-API-KEY header for press-tier endpoints */
  private async fetchPressJSON<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const headers: Record<string, string> = {};
      const key = getPressApiKey();
      if (key) headers['X-WTP-API-KEY'] = key;
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        throw await buildApiError(response);
      }
      return response.json();
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new Error('Request timed out after 30 seconds. The API may be slow or unreachable.');
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** GET /people */
  async getPeople(params?: {
    active_only?: boolean;
    has_ledger?: boolean;
    limit?: number;
    offset?: number;
    q?: string;
  }): Promise<PeopleResponse> {
    const searchParams = new URLSearchParams();
    if (params?.active_only !== undefined) searchParams.set('active_only', params.active_only ? '1' : '0');
    if (params?.has_ledger !== undefined) searchParams.set('has_ledger', params.has_ledger ? '1' : '0');
    if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params?.offset !== undefined) searchParams.set('offset', params.offset.toString());
    if (params?.q) searchParams.set('q', params.q);

    const url = `${this.baseUrl}/people?${searchParams}`;
    const data = await this.fetchJSON(url);
    validatePeopleResponse(data);
    return data;
  }

  /** GET /ledger/person/{person_id} */
  async getLedgerForPerson(
    personId: string,
    params?: { limit?: number; offset?: number; tier?: string }
  ): Promise<LedgerPersonResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params?.offset !== undefined) searchParams.set('offset', params.offset.toString());
    if (params?.tier) searchParams.set('tier', params.tier);

    const url = `${this.baseUrl}/ledger/person/${encodeURIComponent(personId)}?${searchParams}`;
    const data = await this.fetchJSON(url);
    validateLedgerPersonResponse(data);
    return data;
  }

  /** GET /ledger/claim/{claim_id} */
  async getClaim(claimId: string | number): Promise<LedgerClaimResponse> {
    const url = `${this.baseUrl}/ledger/claim/${claimId}`;
    const data = await this.fetchJSON(url);
    validateLedgerClaimResponse(data);
    return data;
  }

  /** GET /bills/{bill_id} */
  async getBill(billId: string): Promise<BillResponse> {
    const url = `${this.baseUrl}/bills/${encodeURIComponent(billId)}`;
    const data = await this.fetchJSON(url);
    validateBillResponse(data);
    return data;
  }

  /** GET /bills/{bill_id}/timeline */
  async getBillTimeline(billId: string): Promise<BillTimelineResponse> {
    const url = `${this.baseUrl}/bills/${encodeURIComponent(billId)}/timeline`;
    const data = await this.fetchJSON(url);
    validateBillTimelineResponse(data);
    return data;
  }

  /** GET /people/{id}/profile — Wikipedia data */
  async getPersonProfile(personId: string): Promise<PersonProfile> {
    const url = `${this.baseUrl}/people/${encodeURIComponent(personId)}/profile`;
    return this.fetchJSON<PersonProfile>(url);
  }

  /** GET /people/{id}/finance — FEC data */
  async getPersonFinance(personId: string): Promise<PersonFinance> {
    const url = `${this.baseUrl}/people/${encodeURIComponent(personId)}/finance`;
    return this.fetchJSON<PersonFinance>(url);
  }

  /** GET /people/{id}/performance (PRESS tier) */
  async getPersonPerformance(personId: string): Promise<PersonPerformance> {
    const url = `${this.baseUrl}/people/${encodeURIComponent(personId)}/performance`;
    return this.fetchPressJSON<PersonPerformance>(url);
  }

  /** GET /people/{id}/stats */
  async getPersonStats(personId: string): Promise<PersonStats> {
    const url = `${this.baseUrl}/people/${encodeURIComponent(personId)}/stats`;
    return this.fetchJSON<PersonStats>(url);
  }

  /** GET /dashboard/stats */
  async getDashboardStats(): Promise<DashboardStats> {
    const url = `${this.baseUrl}/dashboard/stats`;
    return this.fetchJSON<DashboardStats>(url);
  }

  /** GET /balance-of-power */
  async getBalanceOfPower(): Promise<BalanceOfPower> {
    const url = `${this.baseUrl}/balance-of-power`;
    return this.fetchJSON<BalanceOfPower>(url);
  }

  /**
   * GET /people/aggregate/chamber-party
   *
   * Returns House/Senate party counts without fetching hundreds of individual
   * member rows. Used by the Politics dashboard's Balance of Power panel.
   */
  async getChamberPartyBreakdown(activeOnly: boolean = true): Promise<ChamberPartyBreakdown> {
    const url = `${this.baseUrl}/people/aggregate/chamber-party?active_only=${activeOnly ? 'true' : 'false'}`;
    return this.fetchJSON<ChamberPartyBreakdown>(url);
  }

  /** GET /actions/recent */
  async getRecentActions(limit: number = 10): Promise<RecentAction[]> {
    const url = `${this.baseUrl}/actions/recent?limit=${limit}`;
    return this.fetchJSON<RecentAction[]>(url);
  }

  /** GET /ledger/summary */
  async getLedgerSummary(): Promise<LedgerSummary> {
    const url = `${this.baseUrl}/ledger/summary`;
    return this.fetchJSON<LedgerSummary>(url);
  }

  /** GET /votes */
  async getVotes(params?: {
    congress?: number;
    chamber?: string;
    limit?: number;
    offset?: number;
  }): Promise<VotesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.congress !== undefined) searchParams.set('congress', params.congress.toString());
    if (params?.chamber) searchParams.set('chamber', params.chamber);
    if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params?.offset !== undefined) searchParams.set('offset', params.offset.toString());
    const url = `${this.baseUrl}/votes?${searchParams}`;
    return this.fetchJSON<VotesResponse>(url);
  }

  /** GET /people/{id}/activity — Bills sponsored/cosponsored */
  async getPersonActivity(
    personId: string,
    params?: { role?: string; congress?: number; policy_area?: string; limit?: number; offset?: number }
  ): Promise<PersonActivityResponse> {
    const searchParams = new URLSearchParams();
    if (params?.role) searchParams.set('role', params.role);
    if (params?.congress !== undefined) searchParams.set('congress', params.congress.toString());
    if (params?.policy_area) searchParams.set('policy_area', params.policy_area);
    if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params?.offset !== undefined) searchParams.set('offset', params.offset.toString());
    const url = `${this.baseUrl}/people/${encodeURIComponent(personId)}/activity?${searchParams}`;
    return this.fetchJSON<PersonActivityResponse>(url);
  }

  /** GET /people/{id}/votes — Roll call vote positions */
  async getPersonVotes(
    personId: string,
    params?: { position?: string; limit?: number; offset?: number }
  ): Promise<PersonVotesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.position) searchParams.set('position', params.position);
    if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params?.offset !== undefined) searchParams.set('offset', params.offset.toString());
    const url = `${this.baseUrl}/people/${encodeURIComponent(personId)}/votes?${searchParams}`;
    return this.fetchJSON<PersonVotesResponse>(url);
  }

  /** GET /graph/person/{id} — Co-sponsorship connections */
  async getPersonGraph(personId: string, limit: number = 50): Promise<PersonGraphResponse> {
    const url = `${this.baseUrl}/graph/person/${encodeURIComponent(personId)}?limit=${limit}`;
    return this.fetchJSON<PersonGraphResponse>(url);
  }

  /** GET /votes/{vote_id} — Single vote detail with all member positions */
  async getVoteDetail(voteId: number): Promise<VoteDetailResponse> {
    const url = `${this.baseUrl}/votes/${voteId}`;
    return this.fetchJSON<VoteDetailResponse>(url);
  }

  /** GET /people/{id}/committees — Committees a politician sits on */
  async getPersonCommittees(personId: string): Promise<PersonCommitteesResponse> {
    const url = `${this.baseUrl}/people/${encodeURIComponent(personId)}/committees`;
    return this.fetchJSON<PersonCommitteesResponse>(url);
  }

  /** GET /actions/search — Search actions with filters */
  async searchActions(params?: {
    person_id?: string;
    bill_congress?: number;
    bill_type?: string;
    bill_number?: number;
    q?: string;
    simple?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ActionSearchResponse> {
    const searchParams = new URLSearchParams();
    if (params?.person_id) searchParams.set('person_id', params.person_id);
    if (params?.bill_congress !== undefined) searchParams.set('bill_congress', params.bill_congress.toString());
    if (params?.bill_type) searchParams.set('bill_type', params.bill_type);
    if (params?.bill_number !== undefined) searchParams.set('bill_number', params.bill_number.toString());
    if (params?.q) searchParams.set('q', params.q);
    if (params?.simple !== undefined) searchParams.set('simple', params.simple ? '1' : '0');
    if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params?.offset !== undefined) searchParams.set('offset', params.offset.toString());
    const url = `${this.baseUrl}/actions/search?${searchParams}`;
    return this.fetchJSON<ActionSearchResponse>(url);
  }

  /** GET /compare?ids=id1,id2 */
  async comparePeople(personIds: string[]): Promise<CompareResponse> {
    const url = `${this.baseUrl}/compare?ids=${personIds.join(',')}`;
    return this.fetchJSON<CompareResponse>(url);
  }

  /** GET /ops/runtime (PRESS tier) */
  async getRuntimeInfo(): Promise<RuntimeInfo> {
    const url = `${this.baseUrl}/ops/runtime`;
    const data = await this.fetchPressJSON(url);
    validateRuntimeInfo(data);
    return data;
  }
}

// Default client instance
export const apiClient = new WTPClient(getApiBaseUrl());
