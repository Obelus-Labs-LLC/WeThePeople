/**
 * Single source of truth for verification-tier display labels and colors.
 *
 * The Veritas backend stores four tier values: 'strong' | 'moderate' |
 * 'weak' | 'none'. Every place in the verify site that renders a tier
 * (HomePage Recent, VaultPage list, ResultsPage verdict banner) must
 * pull from here so a reader sees the same vocabulary throughout.
 *
 * Previously each page defined its own labels which drifted apart:
 *   HomePage:   Supported / Mostly True / Mixed Evidence / Unverified
 *   VaultPage:  STRONG / MODERATE / WEAK / NONE
 *   ResultsPage:SUPPORTED / PARTIAL / UNKNOWN
 *
 * Reading the same item across all three told the user three different
 * things. We standardize on the editorial labels (Supported / Mostly
 * True / Mixed Evidence / Unverified) for body copy, with the "verdict"
 * status (supported / partial / unknown) reserved for ResultsPage's
 * banner styling.
 */

export type Tier = 'strong' | 'moderate' | 'weak' | 'none';
export type Verdict = 'supported' | 'partial' | 'unknown';

/** Editorial label, sentence case. Used in cards and lists. */
export const TIER_LABEL: Record<Tier, string> = {
  strong: 'Supported',
  moderate: 'Mostly True',
  weak: 'Mixed Evidence',
  none: 'Unverified',
};

/** Editorial-uppercase label for verdict banners. */
export const TIER_LABEL_UPPER: Record<Tier, string> = {
  strong: 'SUPPORTED',
  moderate: 'MOSTLY TRUE',
  weak: 'MIXED EVIDENCE',
  none: 'UNVERIFIED',
};

/** CSS color value (CSS variable preferred — falls through to baked hex). */
export const TIER_COLOR: Record<Tier, string> = {
  strong: '#10B981',
  moderate: '#3DB87A',
  weak: '#C5A028',
  none: 'rgba(235,229,213,0.4)',
};

/** Tailwind class triplet for VaultPage / banner backgrounds. */
export const TIER_TAILWIND: Record<Tier, { bg: string; text: string; border: string }> = {
  strong:   { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  moderate: { bg: 'bg-emerald-700/10', text: 'text-emerald-300', border: 'border-emerald-700/30' },
  weak:     { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30' },
  none:     { bg: 'bg-zinc-500/10',    text: 'text-zinc-400',    border: 'border-zinc-700/30' },
};

/** Map a backend tier to a 3-bucket verdict (used by ResultsPage banners). */
export function tierToVerdict(tier?: string | null): Verdict {
  switch (tier) {
    case 'strong': return 'supported';
    case 'moderate': return 'partial';
    case 'weak': return 'partial';
    default: return 'unknown';
  }
}

/** Coerce an unknown string from the backend into a valid Tier value. */
export function asTier(raw: string | null | undefined): Tier {
  const v = String(raw || '').toLowerCase() as Tier;
  if (v === 'strong' || v === 'moderate' || v === 'weak' || v === 'none') return v;
  return 'none';
}
