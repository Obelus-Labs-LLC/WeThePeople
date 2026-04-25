/**
 * WTP Verify API Client
 *
 * In production: api.wethepeopleforus.com (via Vercel rewrite)
 * In dev: proxied through Vite at /api
 */

// Default to '/api' so that production requests are routed through the
// Vercel rewrite to api.wethepeopleforus.com. With an empty default the
// browser hits the SPA host directly and the catch-all rewrite returns
// index.html — JSON.parse then fails. Aligned with journal/research.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export function getApiBase(): string {
  return API_BASE.replace(/\/$/, '');
}

export interface FetchOptions {
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, message: string, body: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Translate raw error messages into something a human can act on.
 * Used by pages that show errors inline.
 */
export function humanizeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many requests. Wait a minute and try again.';
    if (err.status === 404) return 'That verification could not be found — it may have been removed.';
    if (err.status >= 500) return 'The verification service is having trouble. Please retry in a moment.';
    return `Request failed (${err.status}). ${err.message || 'Try again.'}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/abort/i.test(msg)) return '';
  if (/fetch|network|failed/i.test(msg)) {
    return 'Could not reach the verification server. Check your connection and try again.';
  }
  return msg || 'Something went wrong.';
}

/**
 * Typed GET fetch wrapper. Builds URL with query params, returns parsed JSON.
 * Throws ApiError on non-2xx responses so callers can inspect status.
 */
export async function apiFetch<T>(path: string, opts?: FetchOptions): Promise<T> {
  const base = getApiBase();
  const url = new URL(`${base}${path}`, window.location.origin);

  if (opts?.params) {
    for (const [key, value] of Object.entries(opts.params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    signal: opts?.signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, res.statusText || `HTTP ${res.status}`, body);
  }

  return res.json();
}

/**
 * Typed POST fetch wrapper. Sends JSON body, returns parsed JSON.
 * Throws ApiError on non-2xx responses.
 */
export async function apiPost<T>(path: string, body: unknown, opts?: FetchOptions): Promise<T> {
  const base = getApiBase();
  const url = new URL(`${base}${path}`, window.location.origin);

  if (opts?.params) {
    for (const [key, value] of Object.entries(opts.params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    signal: opts?.signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, res.statusText || `HTTP ${res.status}`, text);
  }

  return res.json();
}

/**
 * Build a link to the main WTP site for a given path.
 */
export function mainSiteUrl(path: string): string {
  return `https://wethepeopleforus.com${path}`;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------
//
// The two "verification" endpoints return different shapes:
//
//   POST /claims/verify             -> { claims: [{status, score, evidence, …}], engine, summary }
//   GET  /claims/verifications/{id} -> { id, text, category, evaluation: {tier, score 0-1, evidence: [{type, …}]} }
//
// ResultsPage historically only handled the POST shape, so clicking any vault
// entry white-screened. This helper collapses the vault shape into the POST
// shape so a single renderer works for both.

type VerdictStatus = 'supported' | 'partial' | 'unknown';

export interface NormalizedEvidence {
  source: string;
  source_url?: string;
  title: string;
  snippet: string;
  evidence_type?: string;
}

export interface NormalizedClaim {
  claim_id: string;
  claim_text: string;
  category: string;
  signals?: string;
  score: number;           // 0-100
  status: VerdictStatus;
  confidence: number;      // 0-1
  evidence_count: number;
  evidence: NormalizedEvidence[];
}

export interface NormalizedVerification {
  claims_extracted: number;
  claims: NormalizedClaim[];
  source_url?: string;
  engine: string;
  summary: string;
}

function tierToStatus(tier?: string | null): VerdictStatus {
  switch (tier) {
    case 'strong': return 'supported';
    case 'moderate':
    case 'weak': return 'partial';
    default: return 'unknown';
  }
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/** Turn a raw evaluation.evidence[] item into the display shape. */
function normalizeEvidenceItem(raw: any): NormalizedEvidence {
  const type = String(raw?.type || '').toLowerCase();

  if (type === 'lobbying_record') {
    const client = raw.client_name || 'Unknown client';
    const registrant = raw.registrant_name || 'Unknown registrant';
    const year = raw.filing_year || '';
    const issues = raw.specific_issues || 'Lobbying disclosure filed.';
    return {
      source: 'Senate LDA Database',
      title: `${client} ↔ ${registrant}${year ? ` (${year})` : ''}`,
      snippet: typeof issues === 'string' ? issues.slice(0, 320) : 'Lobbying disclosure filed.',
      evidence_type: 'lobbying record',
    };
  }

  if (type === 'contract_record') {
    const amt = typeof raw.award_amount === 'number' ? fmtMoney(raw.award_amount) : 'Undisclosed amount';
    const agency = raw.awarding_agency || raw.agency || 'a federal agency';
    const desc = raw.description || raw.award_description || '';
    return {
      source: 'USASpending.gov',
      title: `${amt} contract from ${agency}`,
      snippet: desc ? String(desc).slice(0, 320) : `Federal contract recorded in USASpending.gov.`,
      evidence_type: 'contract record',
    };
  }

  if (type === 'trade_record') {
    const ticker = raw.ticker || '';
    const action = raw.transaction_type || raw.action || 'trade';
    const date = raw.transaction_date || '';
    return {
      source: 'STOCK Act Disclosures',
      title: `${ticker ? ticker + ' ' : ''}${action}${date ? ' on ' + date : ''}`,
      snippet: raw.notes || 'Congressional stock trade filed via STOCK Act.',
      evidence_type: 'trade record',
    };
  }

  if (type === 'donation_record' || type === 'pac_record') {
    const donor = raw.donor_name || raw.committee_name || 'Donor';
    const recipient = raw.recipient_name || 'Recipient';
    const amt = typeof raw.amount === 'number' ? fmtMoney(raw.amount) : 'Undisclosed';
    return {
      source: 'FEC',
      title: `${donor} → ${recipient}: ${amt}`,
      snippet: raw.notes || 'Campaign finance contribution filed with FEC.',
      evidence_type: 'donation record',
    };
  }

  if (type === 'enforcement_record') {
    const agency = raw.agency || 'Regulator';
    const penalty = typeof raw.penalty_amount === 'number' ? fmtMoney(raw.penalty_amount) : 'Undisclosed penalty';
    return {
      source: agency,
      title: `${agency} enforcement — ${penalty}`,
      snippet: raw.description || 'Enforcement action on public record.',
      evidence_type: 'enforcement record',
    };
  }

  // Fallback: stringify the interesting bits so nothing disappears silently.
  const fallbackTitle = raw?.title || raw?.name || raw?.type || 'Evidence record';
  const fallbackSnippet = JSON.stringify(raw).slice(0, 320);
  return {
    source: raw?.source || 'Evidence',
    title: String(fallbackTitle),
    snippet: fallbackSnippet,
    evidence_type: type || 'record',
  };
}

/**
 * Adapt GET /claims/verifications/{id} into the NormalizedVerification shape.
 * Safe to call with the POST-verify shape too — it detects and passes through.
 */
export function normalizeVerification(raw: any): NormalizedVerification {
  // If it already looks like a POST-verify response, return it as-is.
  if (raw && Array.isArray(raw.claims)) {
    return raw as NormalizedVerification;
  }

  // Vault shape: single claim wrapped in evaluation
  const evaluation = raw?.evaluation || {};
  const rawEvidence: any[] = Array.isArray(evaluation.evidence) ? evaluation.evidence : [];
  const evidence = rawEvidence.map(normalizeEvidenceItem);

  const rawScore = typeof evaluation.score === 'number' ? evaluation.score : 0;
  // Backend scale is 0–1 for stored evals; our display wants 0–100.
  const score100 = rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore);

  const status = tierToStatus(evaluation.tier);

  const claim: NormalizedClaim = {
    claim_id: String(raw?.id ?? ''),
    claim_text: String(raw?.text ?? ''),
    category: raw?.category || 'general',
    signals: evaluation.relevance ? `relevance: ${evaluation.relevance}` : undefined,
    score: score100,
    status,
    confidence: typeof evaluation.score === 'number' ? evaluation.score : 0,
    evidence_count: evidence.length,
    evidence,
  };

  const entity = raw?.entity_name || raw?.person_id || 'the subject';
  const summary = evidence.length
    ? `Retrieved ${evidence.length} evidence record${evidence.length === 1 ? '' : 's'} for ${entity}.`
    : `No evidence is currently linked to this saved verification.`;

  return {
    claims_extracted: 1,
    claims: [claim],
    source_url: raw?.source_url || undefined,
    engine: 'veritas',
    summary,
  };
}
