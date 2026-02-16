/**
 * API Contract Types - LOCKED TO BACKEND CONTRACTS
 *
 * These types must match the backend contract tests exactly.
 * Any mismatch will throw at runtime to prevent silent bugs.
 */

// /people response
export interface PeopleResponse {
  total: number;
  people: Person[];
  limit: number;
  offset: number;
}

export interface Person {
  person_id: string;
  display_name: string;
  chamber: string;
  state: string;
  party: string;
  is_active: boolean;
  photo_url: string | null;
}

// /ledger/person/{person_id} response
export interface LedgerPersonResponse {
  person_id: string;
  total: number;
  limit: number;
  offset: number;
  entries: LedgerEntry[];
}

export interface LedgerEntry {
  id: number;
  claim_id: number;
  evaluation_id: number | null;
  person_id: string;
  claim_date: string | null;
  source_url: string;
  normalized_text: string;
  intent_type: string | null;
  policy_area: string | null;
  matched_bill_id: string | null;
  best_action_id: number | null;
  score: number | null;
  tier: string;
  relevance: string | null;
  progress: string | null;
  timing: string | null;
  evidence: Record<string, any> | null;
  why: string[];
  created_at: string | null;
}

// /ledger/claim/{claim_id} response (same shape as a single LedgerEntry)
export type LedgerClaimResponse = LedgerEntry;

// /bills/{bill_id} response
export interface BillResponse {
  bill_id: string;
  title: string;
  status_bucket: string | null;
  latest_action_date: string | null;
  introduced_date: string | null;
  sponsor_person_id: string | null;
  policy_area: string | null;
  source_urls: string[];
}

// /bills/{bill_id}/timeline response
export interface BillTimelineResponse {
  bill_id: string;
  total: number;
  limit: number;
  offset: number;
  actions: BillTimelineAction[];
}

export interface BillTimelineAction {
  id: number;
  bill_id: string;
  action_date: string | null;
  action_type: string | null;
  canonical_status: string | null;
  description: string | null;
  chamber: string | null;
  source_url: string | null;
}

// /people/{id}/profile response (Wikipedia)
export interface PersonProfile {
  person_id: string;
  display_name: string;
  summary: string | null;
  thumbnail: string | null;
  wikidata_id: string | null;
  infobox: Record<string, string>;
  sections: Record<string, string>;
  url: string | null;
}

// /people/{id}/finance response (FEC)
export interface PersonFinance {
  person_id: string;
  display_name: string;
  candidate_id: string | null;
  totals: {
    receipts: number;
    disbursements: number;
    cash_on_hand: number;
    debt: number;
  } | null;
  committees: Array<{
    id: string;
    name: string;
    designation: string;
  }>;
  top_donors: Array<{
    name: string;
    employer: string;
    amount: number;
  }>;
}

// /people/{id}/performance response
export interface PersonPerformance {
  person_id: string;
  total_claims: number;
  total_scored: number;
  by_tier: Record<string, number>;
  by_category: Record<string, number>;
  by_timing: Record<string, number>;
  by_progress: Record<string, number>;
  top_receipts: Array<{
    claim_id: number;
    claim_text: string;
    category: string;
    tier: string;
    relevance: string | null;
    progress: string | null;
    timing: string | null;
    score: number | null;
    action: {
      id: number;
      title: string;
      date: string | null;
      source_url: string | null;
      bill_congress: number | null;
      bill_type: string | null;
      bill_number: string | null;
      policy_area: string | null;
      latest_action_text: string | null;
      latest_action_date: string | null;
    } | null;
  }>;
}

// /people/{id}/stats response
export interface PersonStats {
  id: string;
  actions_count: number;
  last_action_date: string | null;
  top_tags: string[];
}

// /dashboard/stats response
export interface DashboardStats {
  total_people: number;
  total_claims: number;
  total_actions: number;
  total_bills: number;
  by_tier: Record<string, number>;
  match_rate: number;
}

// /actions/recent response
export interface RecentAction {
  id: number;
  person_id: string;
  title: string;
  summary: string | null;
  date: string | null;
  source_url: string | null;
  bill_congress: number | null;
  bill_type: string | null;
  bill_number: string | null;
}

// /ledger/summary response
export interface LedgerSummary {
  total: number;
  by_tier: Record<string, number>;
}

// /compare response
export interface ComparePersonData {
  person_id: string;
  total_claims: number;
  total_scored: number;
  by_tier: {
    raw: Record<string, number>;
    percent: Record<string, number>;
  };
  by_category: Record<string, number>;
  by_timing: {
    raw: Record<string, number>;
    percent: Record<string, number>;
  };
  by_progress: {
    raw: Record<string, number>;
    percent: Record<string, number>;
  };
}

export interface CompareResponse {
  people: ComparePersonData[];
  comparison_count: number;
}

// /ops/runtime response (debug endpoint)
export interface RuntimeInfo {
  db_url: string;
  db_file: string | null;
  git_sha: string | null;
  disable_startup_fetch: boolean;
  no_network: boolean;
  cors_origins: string[];
}
