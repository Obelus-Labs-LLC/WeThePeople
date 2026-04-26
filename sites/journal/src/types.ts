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
  | 'fara_lobbying_spike'
  | 'tax_lobbying'
  | 'budget_influence'
  | 'regulatory_loop'
  | 'education_pipeline';

export interface StoryCitation {
  index: number;
  label: string;
  url?: string;
  source_type: string;
  accessed_at?: string;
}

export interface StoryCorrection {
  type: string;
  description: string;
  date: string;
}

export interface Story {
  /**
   * Story primary key. Backend serialises both numeric IDs (legacy
   * SQLite autoincrement) and string IDs (slugged, post-2026 schema)
   * — keep the union so neither path needs a runtime cast at the
   * call-site, and treat the value as opaque (don't math it).
   */
  id: string | number;
  slug: string;
  title: string;
  summary: string;
  content?: string;  // journal-native format
  body?: string;     // API format (detect_stories.py output)
  category: StoryCategory;
  sector: string;
  status?: string;
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
  // Editorial metadata
  ai_generated?: string;
  data_date_range?: string;
  data_freshness_at?: string;
  retraction_reason?: string;
  corrections?: StoryCorrection[];
}

export interface StoriesResponse {
  stories: Story[];
  total: number;
}

/**
 * Category metadata for display.
 *
 * `color` is the full opaque token (used for text, icons).
 * `bg` is a low-alpha fill (used for pill backgrounds — always ~10% alpha).
 * Tokens mirror the shared design system used across WTP sites.
 */
export interface CategoryMeta {
  label: string;
  color: string;
  bg: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  lobbying:               { label: 'Lobbying',            color: 'var(--color-accent-text)', bg: 'rgba(197,160,40,0.12)' },
  lobbying_spike:         { label: 'Lobbying Spike',      color: 'var(--color-accent-text)', bg: 'rgba(197,160,40,0.12)' },
  lobbying_breakdown:     { label: 'Lobbying Breakdown',  color: 'var(--color-accent-text)', bg: 'rgba(197,160,40,0.12)' },
  tax_lobbying:           { label: 'Tax Lobbying',        color: 'var(--color-accent-text)', bg: 'rgba(197,160,40,0.12)' },
  fara_lobbying_spike:    { label: 'FARA Lobbying',       color: 'var(--color-dem)',         bg: 'rgba(74,127,222,0.12)' },
  foreign_lobbying:       { label: 'Foreign Lobbying',    color: 'var(--color-dem)',         bg: 'rgba(74,127,222,0.12)' },
  contracts:              { label: 'Contracts',           color: 'var(--color-dem)',         bg: 'rgba(74,127,222,0.12)' },
  contract_windfall:      { label: 'Contract Windfall',   color: 'var(--color-dem)',         bg: 'rgba(74,127,222,0.12)' },
  enforcement:            { label: 'Enforcement',         color: 'var(--color-red)',         bg: 'rgba(230,57,70,0.12)' },
  enforcement_gap:        { label: 'Enforcement Gap',     color: 'var(--color-red)',         bg: 'rgba(230,57,70,0.12)' },
  stock_act_violation:    { label: 'STOCK Act Violation', color: 'var(--color-red)',         bg: 'rgba(230,57,70,0.12)' },
  penalty_contract_ratio: { label: 'Penalty Gap',         color: 'var(--color-red)',         bg: 'rgba(230,57,70,0.12)' },
  enforcement_immunity:   { label: 'Zero Enforcement',    color: 'var(--color-red)',         bg: 'rgba(230,57,70,0.12)' },
  trades:                 { label: 'Trades',              color: 'var(--color-green)',       bg: 'rgba(61,184,122,0.12)' },
  trade_cluster:          { label: 'Trade Cluster',       color: 'var(--color-green)',       bg: 'rgba(61,184,122,0.12)' },
  trade_timing:           { label: 'Trade Timing',        color: 'var(--color-green)',       bg: 'rgba(61,184,122,0.12)' },
  prolific_trader:        { label: 'Prolific Trader',     color: 'var(--color-green)',       bg: 'rgba(61,184,122,0.12)' },
  committee_stock_trade:  { label: 'Committee Trading',   color: 'var(--color-green)',       bg: 'rgba(61,184,122,0.12)' },
  regulatory:             { label: 'Regulatory',          color: 'var(--color-research)',    bg: 'rgba(139,92,246,0.12)' },
  regulatory_arbitrage:   { label: 'Regulatory Arbitrage',color: 'var(--color-research)',    bg: 'rgba(139,92,246,0.12)' },
  regulatory_capture:     { label: 'Regulatory Capture',  color: 'var(--color-research)',    bg: 'rgba(139,92,246,0.12)' },
  regulatory_loop:        { label: 'Regulatory Loop',     color: 'var(--color-research)',    bg: 'rgba(139,92,246,0.12)' },
  revolving_door:         { label: 'Revolving Door',      color: 'var(--color-ind)',         bg: 'rgba(176,111,216,0.12)' },
  bipartisan_buying:      { label: 'Bipartisan Buying',   color: 'var(--color-verify)',      bg: 'rgba(16,185,129,0.12)' },
  full_influence_loop:    { label: 'Influence Loop',      color: 'var(--color-journal)',     bg: 'rgba(230,57,70,0.12)' },
  cross_sector:           { label: 'Cross-Sector',        color: 'var(--color-ind)',         bg: 'rgba(176,111,216,0.12)' },
  budget_influence:       { label: 'Budget Influence',    color: 'var(--color-dem)',         bg: 'rgba(74,127,222,0.12)' },
  education_pipeline:     { label: 'Education Pipeline',  color: 'var(--color-research)',    bg: 'rgba(139,92,246,0.12)' },
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
