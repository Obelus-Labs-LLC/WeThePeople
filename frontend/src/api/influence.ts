/**
 * Cross-sector influence API types and client methods.
 */

import { getApiBaseUrl } from './client';

const API_BASE = getApiBaseUrl();

// ── Types ──

export interface InfluenceStats {
  total_lobbying_spend: number;
  total_contract_value: number;
  total_enforcement_actions: number;
  politicians_connected: number;
  by_sector: Record<string, {
    lobbying: number;
    contracts: number;
    enforcement: number;
  }>;
}

export interface InfluenceLeader {
  entity_id: string;
  display_name: string;
  sector: string;
  total_lobbying?: number;
  total_contracts?: number;
}

export interface InfluenceLeadersResponse {
  leaders: InfluenceLeader[];
}

export type SpendingMetric = 'donations' | 'members' | 'lobbying';
export type SectorFilter = 'finance' | 'health' | 'tech' | 'energy';

export interface StateSpendingData {
  value: number;
  count: number;
}

export interface SpendingByStateResponse {
  metric: SpendingMetric;
  sector: SectorFilter | null;
  states: Record<string, StateSpendingData>;
}

// ── API Functions ──

export async function fetchInfluenceStats(): Promise<InfluenceStats> {
  const res = await fetch(`${API_BASE}/influence/stats`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTopLobbying(limit = 10): Promise<InfluenceLeadersResponse> {
  const res = await fetch(`${API_BASE}/influence/top-lobbying?limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTopContracts(limit = 10): Promise<InfluenceLeadersResponse> {
  const res = await fetch(`${API_BASE}/influence/top-contracts?limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSpendingByState(
  metric: SpendingMetric = 'donations',
  sector?: SectorFilter,
): Promise<SpendingByStateResponse> {
  const params = new URLSearchParams({ metric });
  if (sector) params.set('sector', sector);
  const res = await fetch(`${API_BASE}/influence/spending-by-state?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Trade Timeline Types ──

export interface TradeMarker {
  date: string | null;
  person_id: string;
  display_name: string;
  party: string | null;
  transaction_type: string;
  amount_range: string | null;
  reporting_gap: string | null;
}

export interface TradeTimelineResponse {
  ticker: string;
  trades: TradeMarker[];
}

export type TradeTimelineRange = '3m' | '6m' | '1y' | '2y';

export async function fetchTradeTimeline(
  ticker: string,
  personId?: string,
  range: TradeTimelineRange = '1y',
): Promise<TradeTimelineResponse> {
  const params = new URLSearchParams({ ticker, range });
  if (personId) params.set('person_id', personId);
  const res = await fetch(`${API_BASE}/influence/trade-timeline?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Influence Network Types ──

export interface NetworkNode {
  id: string;
  type: string;       // 'person' | 'company' | 'bill' | 'ticker' | 'lobbying_issue' | 'agency'
  label: string;
  party?: string;
  photo_url?: string;
  state?: string;
  chamber?: string;
  person_id?: string;
  sector?: string;
  ticker?: string;
  entity_type?: string;
  entity_id?: string;
  bill_id?: string;
  status?: string;
  policy_area?: string;
}

export interface NetworkEdge {
  source: string;
  target: string;
  type: string;       // 'donation' | 'trade' | 'legislation' | 'lobbying' | 'contract'
  amount?: number;
  cycle?: string;
  transaction_type?: string;
  role?: string;
  count?: number;
}

export interface InfluenceNetworkResponse {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  stats: {
    total_nodes: number;
    total_edges: number;
    persons: number;
    companies: number;
    bills: number;
    tickers: number;
    lobbying_issues: number;
  };
}

export async function fetchInfluenceNetwork(
  entityType: string,
  entityId: string,
  depth = 1,
  limit = 50,
): Promise<InfluenceNetworkResponse> {
  const params = new URLSearchParams({
    entity_type: entityType,
    entity_id: entityId,
    depth: String(depth),
    limit: String(limit),
  });
  const res = await fetch(`${API_BASE}/influence/network?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
