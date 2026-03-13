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

// /ledger/claim/{claim_id} response (LedgerEntry + embedded action and display_name)
export interface LedgerClaimResponse extends LedgerEntry {
  display_name: string;
  matched_action: {
    id: number;
    title: string;
    summary: string | null;
    date: string | null;
    source_url: string | null;
    bill_congress: number | null;
    bill_type: string | null;
    bill_number: string | null;
    policy_area: string | null;
    latest_action_text: string | null;
  } | null;
}

// /bills/{bill_id} response
export interface BillResponse {
  bill_id: string;
  congress: number;
  bill_type: string;
  bill_number: number;
  title: string;
  policy_area: string | null;
  subjects_json: string[] | null;
  summary_text: string | null;
  status_bucket: string | null;
  latest_action_text: string | null;
  latest_action_date: string | null;
  introduced_date: string | null;
  congress_url: string;
  timeline: Array<{
    action_date: string | null;
    action_text: string;
    action_type: string | null;
  }>;
  sponsors: BillSponsor[];
}

export interface BillSponsor {
  bioguide_id: string;
  role: string;
  person_id: string | null;
  display_name: string;
  party: string | null;
  state: string | null;
  photo_url: string | null;
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

// /votes response
export interface Vote {
  id: number;
  congress: number;
  chamber: string;
  session: number;
  roll_number: number;
  vote_date: string | null;
  question: string;
  result: string;
  related_bill_congress: number | null;
  related_bill_type: string | null;
  related_bill_number: number | null;
  yea_count: number;
  nay_count: number;
  not_voting_count: number;
  present_count: number;
}

export interface VotesResponse {
  total: number;
  limit: number;
  offset: number;
  votes: Vote[];
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

// ── New types for Person Profile, Vote Detail, etc. ──

// /people/{id}/activity response
export interface PersonActivityEntry {
  bill_id: string;
  role: string;
  congress: number;
  bill_type: string;
  bill_number: number;
  title: string;
  policy_area: string | null;
  status: string | null;
  latest_action: string | null;
  latest_action_date: string | null;
  summary: string | null;
  congress_url: string | null;
}

export interface PersonActivityResponse {
  person_id: string;
  display_name: string;
  total: number;
  sponsored_count: number;
  cosponsored_count: number;
  policy_areas: Record<string, number>;
  limit: number;
  offset: number;
  entries: PersonActivityEntry[];
}

// /people/{id}/votes response
export interface PersonVoteEntry {
  vote_id: number;
  congress: number;
  chamber: string;
  roll_number: number;
  vote_date: string | null;
  question: string;
  result: string;
  position: string;
  related_bill_congress: number | null;
  related_bill_type: string | null;
  related_bill_number: number | null;
}

export interface PersonVotesResponse {
  person_id: string;
  display_name: string;
  total: number;
  position_summary: Record<string, number>;
  limit: number;
  offset: number;
  votes: PersonVoteEntry[];
}

// /graph/person/{id} response
export interface GraphConnection {
  person_id: string;
  display_name: string;
  party: string;
  chamber: string;
  state: string;
  shared_bills: number;
}

export interface PersonGraphResponse {
  person_id: string;
  display_name: string;
  connections: GraphConnection[];
}

// /votes/{vote_id} response (full detail with member positions)
export interface MemberVoteEntry {
  bioguide_id: string;
  member_name: string;
  position: string;
  party: string;
  state: string;
  person_id: string | null;
}

export interface VoteDetailResponse extends Vote {
  source_url: string | null;
  member_votes: MemberVoteEntry[];
}

// /actions/search response
export interface ActionSearchResult {
  id: number;
  person_id: string;
  title: string;
  summary: string | null;
  date: string | null;
  source_url: string | null;
  bill_congress: number | null;
  bill_type: string | null;
  bill_number: string | null;
  policy_area?: string | null;
  latest_action_text?: string | null;
  introduced_date?: string | null;
}

export interface ActionSearchResponse {
  total: number;
  limit: number;
  offset: number;
  actions: ActionSearchResult[];
}
