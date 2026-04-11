import { getApiBaseUrl } from './client';

const BASE = getApiBaseUrl();

async function apiFetch<T>(path: string, options?: { method?: string; body?: unknown; params?: Record<string, string | number> }): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (options?.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), {
    method: options?.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('wtp_access_token') ? { Authorization: `Bearer ${localStorage.getItem('wtp_access_token')}` } : {}),
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// ── Promises ──

export interface PromiseItem {
  id: number;
  person_id: string;
  person_name: string;
  title: string;
  description: string;
  source_url: string;
  promise_date: string | null;
  category: string;
  status: string;
  retire_reason: string | null;
  progress: number;
  confidence_score: number | null;
  hot_score: number | null;
  linked_bill_ids: string[];
  linked_action_ids: number[];
  milestones: MilestoneItem[];
  created_at: string;
}

export interface MilestoneItem {
  id: number;
  title: string;
  description: string;
  evidence_url: string;
  status: string;
  achieved_date: string | null;
}

export function fetchPromises(params: Record<string, string | number> = {}) {
  return apiFetch<{ total: number; items: PromiseItem[] }>('/civic/promises', { params });
}

export function fetchPromise(id: number) {
  return apiFetch<PromiseItem>(`/civic/promises/${id}`);
}

export function createPromise(data: {
  person_id: string; person_name?: string; title: string; description?: string;
  source_url?: string; promise_date?: string; category?: string;
}) {
  return apiFetch<PromiseItem>('/civic/promises', { method: 'POST', body: data });
}

// ── Proposals ──

export interface ProposalItem {
  id: number;
  title: string;
  body: string;
  category: string;
  sector: string;
  status: string;
  upvotes: number;
  downvotes: number;
  confidence_score: number | null;
  hot_score: number | null;
  published_at: string | null;
  created_at: string;
}

export function fetchProposals(params: Record<string, string | number> = {}) {
  return apiFetch<{ total: number; items: ProposalItem[] }>('/civic/proposals', { params });
}

export function createProposal(data: { title: string; body: string; category?: string; sector?: string }) {
  return apiFetch<{ id: number }>('/civic/proposals', { method: 'POST', body: data });
}

// ── Annotations ──

export interface AnnotationItem {
  id: number;
  section_ref: string;
  text_excerpt: string;
  comment: string;
  sentiment: string;
  upvotes: number;
  downvotes: number;
  confidence_score: number | null;
  created_at: string;
}

export function fetchAnnotations(billId: string, params: Record<string, string | number> = {}) {
  return apiFetch<{ total: number; bill_id: string; items: AnnotationItem[] }>('/civic/annotations', { params: { bill_id: billId, ...params } });
}

export function createAnnotation(data: { bill_id: string; section_ref?: string; text_excerpt?: string; comment: string; sentiment?: string }) {
  return apiFetch<{ id: number }>('/civic/annotations', { method: 'POST', body: data });
}

// ── Voting ──

export function castVote(targetType: string, targetId: number, value: 1 | -1) {
  return apiFetch<{ action: string; value?: number }>('/civic/vote', { method: 'POST', body: { target_type: targetType, target_id: targetId, value } });
}

// ── Badges ──

export interface BadgeItem {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  threshold: number;
  level: number;
}

export interface UserBadgeItem {
  badge_slug: string;
  badge_name: string;
  badge_icon: string;
  badge_category: string;
  earned_at: string;
  progress_count: number;
}

export function fetchBadges() {
  return apiFetch<{ total: number; items: BadgeItem[] }>('/civic/badges');
}

export function fetchMyBadges() {
  return apiFetch<{ total: number; items: UserBadgeItem[] }>('/civic/badges/mine');
}

// ── Verification ──

export function fetchVerificationStatus() {
  return apiFetch<{ level: number; level_label: string; verified_zip: string | null; verified_state: string | null }>('/civic/verification');
}

export function verifyResidence(zipCode: string) {
  return apiFetch<{ level: number; state: string; zip: string; message: string }>('/civic/verify/residence', { method: 'POST', body: { zip_code: zipCode } });
}

// ── Leaderboard ──

export function fetchLeaderboard(contentType: string, sort: string = 'hot', limit: number = 25) {
  return apiFetch<{ content_type: string; sort: string; items: Record<string, unknown>[] }>('/civic/leaderboard', { params: { content_type: contentType, sort, limit } });
}
