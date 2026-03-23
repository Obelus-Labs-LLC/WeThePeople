/**
 * Claims Verification API client
 *
 * Wraps the /claims/* endpoints from routers/claims.py
 */

import { getApiBaseUrl } from './client';

// ── Types ──

export interface VerifyTextRequest {
  text: string;
  entity_id: string;
  entity_type: 'politician' | 'tech' | 'finance' | 'health' | 'energy';
  source_url?: string;
}

export interface VerifyUrlRequest {
  url: string;
  entity_id: string;
  entity_type: 'politician' | 'tech' | 'finance' | 'health' | 'energy';
}

export interface ClaimEvaluation {
  tier: 'strong' | 'moderate' | 'weak' | 'none';
  score: number;
  relevance?: string | number;
  progress?: string | number | null;
  timing?: string | number | null;
  matched_bill_id?: string | null;
  evidence?: EvidenceItem[] | null;
  why?: string[] | { summary: string } | null;
}

export interface EvidenceItem {
  type: string; // legislative_action, vote_record, trade_record, lobbying_record, contract_record, enforcement_record, donation_record, committee_record, sec_filing_record
  tier?: string;
  score?: number;
  // legislative_action fields
  title?: string;
  bill_type?: string;
  bill_number?: string;
  source_url?: string;
  // vote_record fields
  question?: string;
  position?: string;
  result?: string;
  vote_date?: string;
  // trade_record fields
  ticker?: string;
  transaction_type?: string;
  transaction_date?: string;
  amount_range?: string;
  // lobbying_record fields
  client_name?: string;
  registrant_name?: string;
  filing_year?: string;
  specific_issues?: string;
  // contract_record fields
  award_amount?: number;
  awarding_agency?: string;
  start_date?: string;
  // enforcement_record fields
  case_title?: string;
  enforcement_type?: string;
  penalty_amount?: number;
  case_date?: string;
  case_url?: string;
  // donation_record fields
  committee_name?: string;
  amount?: number;
  cycle?: string;
  donation_date?: string;
  // committee_record fields
  committee_name_display?: string;
  role?: string;
  chamber?: string;
  // sec_filing_record fields
  // uses description, date, source_url above
  // shared fields
  description?: string;
  date?: string;
  overlap?: string[];
  // legacy compat
  url?: string;
  bill_id?: string;
  vote_id?: string;
  match_score?: number;
}

export interface VerificationItem {
  id: number;
  person_id: string;
  text: string;
  category?: string;
  intent?: string;
  claim_date?: string;
  source_url?: string;
  created_at?: string;
  entity_name?: string;
  bill_refs?: any;
  evaluation: ClaimEvaluation | null;
}

export interface VerificationsResponse {
  total: number;
  limit: number;
  offset: number;
  items: VerificationItem[];
}

export interface VerificationDetailResponse extends VerificationItem {
  entity_name: string;
  bill_refs?: any;
}

export interface DashboardStatsResponse {
  total_claims: number;
  total_evaluated: number;
  tier_distribution: Record<string, number>;
  category_distribution: Record<string, number>;
  unique_entities: number;
  recent: Array<{
    id: number;
    person_id: string;
    text: string;
    tier: string | null;
    created_at: string | null;
  }>;
}

export interface EntityVerificationsResponse {
  entity_id: string;
  entity_type: string;
  total: number;
  tier_summary: Record<string, number>;
  limit: number;
  offset: number;
  items: VerificationItem[];
}

export interface VerificationResult {
  verifications: VerificationItem[];
  entity_id: string;
  entity_type: string;
  entity_name?: string;
  auth_tier: string;
  claims_extracted: number;
  tier_counts?: Record<string, number>;
  summary?: string;
  source_url?: string;
}

// ── API Functions ──

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return res.json();
}

/** POST /claims/verify — submit text for claim verification */
export async function verifyText(req: VerifyTextRequest): Promise<VerificationResult> {
  return apiFetch<VerificationResult>('/claims/verify', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** POST /claims/verify-url — submit URL for claim verification */
export async function verifyUrl(req: VerifyUrlRequest): Promise<VerificationResult> {
  return apiFetch<VerificationResult>('/claims/verify-url', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** GET /claims/verifications — paginated list */
export async function getVerifications(params?: {
  limit?: number;
  offset?: number;
  entity_id?: string;
  tier?: string;
}): Promise<VerificationsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  if (params?.entity_id) sp.set('entity_id', params.entity_id);
  if (params?.tier) sp.set('tier', params.tier);
  return apiFetch<VerificationsResponse>(`/claims/verifications?${sp}`);
}

/** GET /claims/verifications/:id — single detail */
export async function getVerificationDetail(id: number): Promise<VerificationDetailResponse> {
  return apiFetch<VerificationDetailResponse>(`/claims/verifications/${id}`);
}

/** GET /claims/dashboard/stats — aggregate stats */
export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  return apiFetch<DashboardStatsResponse>('/claims/dashboard/stats');
}

/** GET /claims/entity/:entity_type/:entity_id — per-entity verifications */
export async function getEntityVerifications(
  entityType: string,
  entityId: string,
  params?: { limit?: number; offset?: number },
): Promise<EntityVerificationsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit !== undefined) sp.set('limit', params.limit.toString());
  if (params?.offset !== undefined) sp.set('offset', params.offset.toString());
  return apiFetch<EntityVerificationsResponse>(`/claims/entity/${entityType}/${entityId}?${sp}`);
}
