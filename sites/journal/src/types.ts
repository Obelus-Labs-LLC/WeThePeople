/**
 * Story types for the Influence Journal
 */

export type StoryCategory = 'lobbying' | 'contracts' | 'enforcement' | 'trades' | 'regulatory';

export interface StoryCitation {
  index: number;
  label: string;
  url?: string;
  source_type: string; // e.g. "Senate LDA", "USASpending", "SEC EDGAR"
  accessed_at?: string;
}

export interface Story {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  category: StoryCategory;
  sector: string; // e.g. "finance", "health", "defense"
  published_at: string;
  updated_at?: string;
  read_time_minutes: number;
  citations: StoryCitation[];
  featured?: boolean;
  hero_image_url?: string;
  tags?: string[];
  entities?: string[]; // entity names mentioned
}

export interface StoriesResponse {
  stories: Story[];
  total: number;
}

/**
 * Category metadata for display
 */
export const CATEGORY_META: Record<StoryCategory, { label: string; color: string; bgColor: string }> = {
  lobbying: { label: 'Lobbying', color: 'text-amber-400', bgColor: 'bg-amber-400/15' },
  contracts: { label: 'Contracts', color: 'text-blue-400', bgColor: 'bg-blue-400/15' },
  enforcement: { label: 'Enforcement', color: 'text-red-400', bgColor: 'bg-red-400/15' },
  trades: { label: 'Trades', color: 'text-emerald-400', bgColor: 'bg-emerald-400/15' },
  regulatory: { label: 'Regulatory', color: 'text-violet-400', bgColor: 'bg-violet-400/15' },
};

export const SECTOR_LABELS: Record<string, string> = {
  finance: 'Finance',
  health: 'Health',
  technology: 'Technology',
  energy: 'Energy',
  transportation: 'Transportation',
  defense: 'Defense',
  politics: 'Politics',
};
