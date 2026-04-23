/**
 * Sector accent palette — single source of truth, lifted verbatim from the
 * Claude-generated design handoff (`WTP Design - Sector Pages.html`).
 *
 * Each sector exposes four tokens:
 *   accent   — the saturated hex used for bars, active states, primary CTAs.
 *   text     — a slightly lighter tint used for links / eyebrow text where
 *              the saturated `accent` would be too heavy on a dark surface.
 *   dim      — 12 % alpha tint for pill backgrounds / hover tints.
 *   bg       — 18 % alpha tint used for the hero wash and filled badges.
 *
 * Usage pattern: wrap a sector page's outermost `<div>` with
 * `style={sectorCssVars('finance')}` and the whole subtree will render with
 * the correct accent via the existing `var(--color-accent*)` references.
 */
interface SectorAccent {
  name: string;
  accent: string;
  text: string;
  dim: string;
  bg: string;
}

export const SECTOR_ACCENTS: Record<string, SectorAccent> = {
  finance: {
    name: 'Finance',
    accent: '#3DB87A',
    text: '#4ECF8A',
    dim: 'rgba(61,184,122,0.12)',
    bg: 'rgba(30,100,70,0.18)',
  },
  health: {
    name: 'Health',
    accent: '#E05577',
    text: '#EF6680',
    dim: 'rgba(224,85,119,0.12)',
    bg: 'rgba(120,30,65,0.18)',
  },
  energy: {
    name: 'Oil & Energy',
    accent: '#D4831A',
    text: '#E0932A',
    dim: 'rgba(212,131,26,0.12)',
    bg: 'rgba(130,70,20,0.18)',
  },
  technology: {
    name: 'Technology',
    accent: '#8B5CF6',
    text: '#A78BFA',
    dim: 'rgba(139,92,246,0.12)',
    bg: 'rgba(65,30,140,0.18)',
  },
  defense: {
    name: 'Defense',
    accent: '#6B7FD4',
    text: '#8A9FE8',
    dim: 'rgba(107,127,212,0.12)',
    bg: 'rgba(25,30,80,0.18)',
  },
  transportation: {
    name: 'Transportation',
    accent: '#4A90D9',
    text: '#60A8F0',
    dim: 'rgba(74,144,217,0.12)',
    bg: 'rgba(25,60,100,0.18)',
  },
  chemicals: {
    name: 'Chemicals',
    accent: '#2EC4B6',
    text: '#3DD5C7',
    dim: 'rgba(46,196,182,0.12)',
    bg: 'rgba(15,80,80,0.18)',
  },
  agriculture: {
    name: 'Agriculture',
    accent: '#5C9E3A',
    text: '#72C04A',
    dim: 'rgba(92,158,58,0.12)',
    bg: 'rgba(35,85,25,0.18)',
  },
  telecom: {
    name: 'Telecom',
    accent: '#2EA8D4',
    text: '#3DBCE8',
    dim: 'rgba(46,168,212,0.12)',
    bg: 'rgba(15,55,95,0.18)',
  },
  education: {
    name: 'Education',
    accent: '#9B6FE8',
    text: '#B08AF0',
    dim: 'rgba(155,111,232,0.12)',
    bg: 'rgba(65,20,130,0.18)',
  },
  // Politics isn't on the Sector Pages mockup (it has its own design system)
  // but every politics-adjacent page still needs a resolvable accent — keep
  // it on the default site gold so the politics experience looks unchanged.
  politics: {
    name: 'Politics',
    accent: '#C5A028',
    text: '#D4AE35',
    dim: 'rgba(197,160,40,0.12)',
    bg: 'rgba(80,55,10,0.18)',
  },
};

/** Resolve a sector key to its accent tokens, falling back to Politics gold. */
function getSectorAccent(sector: string | undefined): SectorAccent {
  if (!sector) return SECTOR_ACCENTS.politics;
  return SECTOR_ACCENTS[sector.toLowerCase()] ?? SECTOR_ACCENTS.politics;
}

/**
 * Returns a `style` object that re-points the four `--color-accent*`
 * CSS variables at the given sector's palette. Apply it to any sector-
 * scoped subtree and every existing `var(--color-accent)` / `-text` /
 * `-dim` reference inside that subtree will flip to the sector color.
 */
export function sectorCssVars(sector: string | undefined): React.CSSProperties {
  const a = getSectorAccent(sector);
  return {
    // Re-point the existing accent tokens so legacy code keeps working.
    ['--color-accent' as string]: a.accent,
    ['--color-accent-text' as string]: a.text,
    ['--color-accent-dim' as string]: a.dim,
    // Extra token for hero washes / filled badges.
    ['--color-accent-bg' as string]: a.bg,
  } as React.CSSProperties;
}
