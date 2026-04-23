/**
 * State-level legislative API types and client methods.
 */

// ── Types ──

export interface StateLegislator {
  id: number;
  ocd_id: string;
  name: string;
  state: string;
  chamber: string | null;
  party: string | null;
  district: string | null;
  photo_url: string | null;
  is_active: boolean;
}

export interface StateBill {
  id: number;
  bill_id: string;
  identifier: string | null;
  title: string | null;
  session: string | null;
  subjects: string | null;
  latest_action: string | null;
  latest_action_date: string | null;
  sponsor_name: string | null;
  source_url: string | null;
}

export interface StateListEntry {
  code: string;
  name: string;
  legislators: number;
  bills: number;
}

interface StatesListResponse {
  states: StateListEntry[];
}

export interface StateDashboardData {
  code: string;
  name: string;
  total_legislators: number;
  total_bills: number;
  by_party: Record<string, number>;
  by_chamber: Record<string, number>;
  party_by_chamber: Record<string, Record<string, number>>;
  recent_bills: StateBill[];
}

interface StateLegislatorsResponse {
  total: number;
  limit: number;
  offset: number;
  legislators: StateLegislator[];
}

interface StateBillsResponse {
  total: number;
  limit: number;
  offset: number;
  bills: StateBill[];
}

// ── Client ──

import { getApiBaseUrl } from './client';
const API_BASE = getApiBaseUrl();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchStates(): Promise<StatesListResponse> {
  return fetchJSON<StatesListResponse>(`${API_BASE}/states`);
}

export async function fetchStateDashboard(code: string): Promise<StateDashboardData> {
  return fetchJSON<StateDashboardData>(`${API_BASE}/states/${encodeURIComponent(code.toUpperCase())}`);
}

export async function fetchStateLegislators(
  code: string,
  params?: {
    chamber?: string;
    party?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }
): Promise<StateLegislatorsResponse> {
  const sp = new URLSearchParams();
  if (params?.chamber) sp.set('chamber', params.chamber);
  if (params?.party) sp.set('party', params.party);
  if (params?.search) sp.set('search', params.search);
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<StateLegislatorsResponse>(
    `${API_BASE}/states/${encodeURIComponent(code.toUpperCase())}/legislators?${sp}`
  );
}

export async function fetchStateBills(
  code: string,
  params?: {
    search?: string;
    session?: string;
    limit?: number;
    offset?: number;
  }
): Promise<StateBillsResponse> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set('search', params.search);
  if (params?.session) sp.set('session', params.session);
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return fetchJSON<StateBillsResponse>(
    `${API_BASE}/states/${encodeURIComponent(code.toUpperCase())}/bills?${sp}`
  );
}
