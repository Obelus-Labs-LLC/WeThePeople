/**
 * Story types for the Influence Journal
 */

export type StoryCategory =
  | 'lobbying'
  | 'contracts'
  | 'enforcement'
  | 'trades'
  | 'regulatory'
  | 'lobbying_spike'
  | 'contract_windfall'
  | 'enforcement_gap'
  | 'trade_cluster'
  | 'revolving_door'
  | 'regulatory_arbitrage'
  | 'bipartisan_buying'
  | 'trade_timing'
  | 'full_influence_loop'
  | 'stock_act_violation'
  | 'committee_stock_trade'
  | 'penalty_contract_ratio'
  | 'prolific_trader'
  | 'enforcement_immunity'
  | 'foreign_lobbying'
  | 'regulatory_capture'
  | 'lobbying_breakdown'
  | 'cross_sector'
  | 'fara_lobbying_spike';

export interface StoryCitation {
  index: number;
  label: string;
  url?: string;
  source_type: string;
  accessed_at?: string;
}

export interface Story {
  id: string | number;
  slug: string;
  title: string;
  summary: string;
  content?: string;  // journal-native format
  body?: string;     // API format (detect_stories.py output)
  category: StoryCategory;
  sector: string;
  published_at: string;
  updated_at?: string;
  created_at?: string;
  read_time_minutes?: number;
  citations?: StoryCitation[];
  data_sources?: string[];
  entity_ids?: string[];
  evidence?: Record<string, unknown>;
  verification_score?: number | null;
  verification_tier?: string | null;
  verification_data?: Record<string, unknown> | null;
  featured?: boolean;
  hero_image_url?: string;
  tags?: string[];
  entities?: string[];
}

export interface StoriesResponse {
  stories: Story[];
  total: number;
}

/**
 * Category metadata for display
 */
export const CATEGORY_META: Record<string, { label: string; color: string; bgColor: string }> = {
  lobbying: { label: 'Lobbying', color: 'text-amber-400', bgColor: 'bg-amber-400/15' },
  lobbying_spike: { label: 'Lobbying Spike', color: 'text-amber-400', bgColor: 'bg-amber-400/15' },
  contracts: { label: 'Contracts', color: 'text-blue-400', bgColor: 'bg-blue-400/15' },
  contract_windfall: { label: 'Contract Windfall', color: 'text-blue-400', bgColor: 'bg-blue-400/15' },
  enforcement: { label: 'Enforcement', color: 'text-red-400', bgColor: 'bg-red-400/15' },
  enforcement_gap: { label: 'Enforcement Gap', color: 'text-red-400', bgColor: 'bg-red-400/15' },
  trades: { label: 'Trades', color: 'text-emerald-400', bgColor: 'bg-emerald-400/15' },
  trade_cluster: { label: 'Trade Cluster', color: 'text-emerald-400', bgColor: 'bg-emerald-400/15' },
  trade_timing: { label: 'Trade Timing', color: 'text-emerald-400', bgColor: 'bg-emerald-400/15' },
  regulatory: { label: 'Regulatory', color: 'text-violet-400', bgColor: 'bg-violet-400/15' },
  regulatory_arbitrage: { label: 'Regulatory Arbitrage', color: 'text-violet-400', bgColor: 'bg-violet-400/15' },
  revolving_door: { label: 'Revolving Door', color: 'text-orange-400', bgColor: 'bg-orange-400/15' },
  bipartisan_buying: { label: 'Bipartisan Buying', color: 'text-cyan-400', bgColor: 'bg-cyan-400/15' },
  full_influence_loop: { label: 'Influence Loop', color: 'text-rose-400', bgColor: 'bg-rose-400/15' },
  stock_act_violation: { label: 'STOCK Act Violation', color: 'text-red-500', bgColor: 'bg-red-500/15' },
  committee_stock_trade: { label: 'Committee Trading', color: 'text-orange-400', bgColor: 'bg-orange-400/15' },
  penalty_contract_ratio: { label: 'Penalty Gap', color: 'text-red-400', bgColor: 'bg-red-400/15' },
  prolific_trader: { label: 'Prolific Trader', color: 'text-emerald-400', bgColor: 'bg-emerald-400/15' },
  enforcement_immunity: { label: 'Zero Enforcement', color: 'text-yellow-400', bgColor: 'bg-yellow-400/15' },
  foreign_lobbying: { label: 'Foreign Lobbying', color: 'text-blue-400', bgColor: 'bg-blue-400/15' },
  regulatory_capture: { label: 'Regulatory Capture', color: 'text-teal-400', bgColor: 'bg-teal-400/15' },
  lobbying_breakdown: { label: 'Lobbying Breakdown', color: 'text-amber-400', bgColor: 'bg-amber-400/15' },
  cross_sector: { label: 'Cross-Sector', color: 'text-indigo-400', bgColor: 'bg-indigo-400/15' },
  fara_lobbying_spike: { label: 'FARA Lobbying', color: 'text-blue-400', bgColor: 'bg-blue-400/15' },
};

export const SECTOR_LABELS: Record<string, string> = {
  finance: 'Finance',
  health: 'Health',
  technology: 'Technology',
  tech: 'Technology',
  energy: 'Energy',
  transportation: 'Transportation',
  defense: 'Defense',
  politics: 'Politics',
  chemicals: 'Chemicals',
  agriculture: 'Agriculture',
  telecom: 'Telecommunications',
  education: 'Education',
};
