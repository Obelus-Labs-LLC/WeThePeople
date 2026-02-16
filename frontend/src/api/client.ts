/**
 * WTP API Client - Type-safe wrapper with runtime validation
 *
 * Usage:
 *   const client = new WTPClient('http://localhost:8002');
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
  DashboardStats,
  RecentAction,
  LedgerSummary,
  CompareResponse,
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
    if (apiOverride) return apiOverride.replace(/\/$/, '');
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8004';
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

export class WTPClient {
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

  /** Fetch with X-WTP-API-KEY header for press-tier endpoints */
  private async fetchPressJSON<T>(url: string): Promise<T> {
    const headers: Record<string, string> = {};
    const key = getPressApiKey();
    if (key) headers['X-WTP-API-KEY'] = key;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
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

  /** GET /compare?person_id=...&person_id=... */
  async comparePeople(personIds: string[]): Promise<CompareResponse> {
    const searchParams = new URLSearchParams();
    personIds.forEach((id) => searchParams.append('person_id', id));
    const url = `${this.baseUrl}/compare?${searchParams}`;
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
