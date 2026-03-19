/**
 * Global search API client.
 */

import { getApiBaseUrl } from './client';

const API_BASE = getApiBaseUrl();

// ── Types ──

export interface PoliticianResult {
  person_id: string;
  name: string;
  state: string | null;
  party: string | null;
  chamber: string;
  photo_url: string | null;
}

export interface CompanyResult {
  entity_id: string;
  name: string;
  ticker: string | null;
  sector: string; // 'finance' | 'health' | 'technology' | 'energy'
}

export interface SearchResults {
  politicians: PoliticianResult[];
  companies: CompanyResult[];
  query: string;
}

// ── API Function ──

export async function globalSearch(query: string): Promise<SearchResults> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
