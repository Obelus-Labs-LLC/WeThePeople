const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
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
  lobbying: 'Lobbying',
  contracts: 'Contracts',
  trades: 'Trades',
  enforcement: 'Enforcement',
};

export function categoryLabel(raw: string): string {
  if (!raw) return '';
  return CATEGORY_LABELS[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
