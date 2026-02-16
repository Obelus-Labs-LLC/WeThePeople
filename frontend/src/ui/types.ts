export type PersonDirectoryEntry = {
  person_id: string
  display_name: string
  chamber: string | null
  state: string | null
  party: string | null
  is_active: boolean
}

export type LedgerEntry = {
  id: number
  claim_id: number
  evaluation_id: number
  person_id: string
  claim_date: string | null
  source_url: string | null
  normalized_text: string
  intent_type: string | null
  policy_area: string | null
  matched_bill_id: string | null
  best_action_id: number | null
  score: number | null
  tier: 'strong' | 'moderate' | 'weak' | 'none'
  relevance: string | null
  progress: string | null
  timing: string | null
  evidence: unknown
  why: unknown
  created_at: string | null
}

export type PersonLedgerResponse = {
  person_id: string
  total: number
  limit: number
  offset: number
  entries: LedgerEntry[]
}

export type ClaimResponse = {
  id: number
  person_id: string
  text: string
  category: string
  intent: string | null
  claim_date: string | null
  claim_source_url: string | null
}

export type ClaimEvaluationResponse = {
  id: number
  claim_id: number
  person_id: string
  best_action_id: number | null
  score: number | null
  tier: string
  relevance: string | null
  progress: string | null
  timing: string | null
  matched_bill_id: string | null
  evidence_json: string | null
  why_json: string | null
}

export type BillTimelineItem = {
  id: number
  bill_id: string
  action_date: string
  action_type: string | null
  chamber: string | null
  canonical_status: string | null
  description: string
}

export type BillTimelineResponse = {
  bill_id: string
  total: number
  limit: number
  offset: number
  actions: BillTimelineItem[]
}
