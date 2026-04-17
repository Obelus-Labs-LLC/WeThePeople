// Canonical human-readable labels for every claim category the backend emits.
// Keep this aligned with the `category_distribution` keys in
// /claims/dashboard/stats — unknown categories fall back to title-case.
const CATEGORY_LABELS: Record<string, string> = {
  // Real categories emitted by the extractor
  announcement: 'Announcement',
  campaign_promise: 'Campaign Promise',
  commentary: 'Commentary',
  earmark: 'Earmark',
  funding: 'Funding',
  general: 'General',
  legislative: 'Legislative',
  letter: 'Letter',
  lobbying: 'Lobbying',
  oversight: 'Oversight',
  policy_position: 'Policy Position',
  test_data: 'Test Data',
  trade: 'Trade',
  vote: 'Vote',

  // Legacy / alternate keys used by the live-verify pipeline
  lobbying_spending: 'Lobbying Spending',
  contract_value: 'Contract Value',
  trade_timing: 'Trade Timing',
  enforcement_action: 'Enforcement Action',
  donation_pattern: 'Donation Pattern',
  legislative_vote: 'Legislative Vote',
  committee_position: 'Committee Position',
  sec_filing: 'SEC Filing',
  budget_allocation: 'Budget Allocation',
  foreign_lobbying: 'Foreign Lobbying',
  regulatory: 'Regulatory',
  contracts: 'Contracts',
  trades: 'Trades',
  enforcement: 'Enforcement',
};

export function categoryLabel(raw: string): string {
  if (!raw) return '';
  return CATEGORY_LABELS[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
