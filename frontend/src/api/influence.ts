/**
 * Cross-sector influence API types and client methods.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

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
