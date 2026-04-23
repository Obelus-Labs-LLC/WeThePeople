import React from 'react';
import {
  PoliticsSectorHeader,
  FinanceSectorHeader,
  HealthSectorHeader,
  TechSectorHeader,
  EnergySectorHeader,
  TransportationSectorHeader,
  DefenseSectorHeader,
  ChemicalsSectorHeader,
  AgricultureSectorHeader,
  TelecomSectorHeader,
  EducationSectorHeader,
} from '../SectorHeader';
import { getApiBaseUrl } from '../../api/client';
import { SECTOR_ACCENTS } from '../../lib/sectorAccents';

const API_BASE = getApiBaseUrl();

// ── Shared sector config ──
// Accent hex values are sourced from `lib/sectorAccents.ts`, which mirrors
// the per-sector palette from the Claude-generated design handoff
// (`WTP Design - Sector Pages.html`). Update `SECTOR_ACCENTS` to change
// accents globally.

/** Convert a `#rrggbb` hex to "r,g,b" for use inside `rgba(...)`. */
function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

export interface SectorConfig {
  key: string;
  label: string;
  /** Accent hex — matches a design-token value; use for inline ${hex}1F tints */
  accent: string;
  /** CSS custom property token matching the accent hex */
  accentToken: string;
  /** Comma-separated RGB for `rgba(${rgb},alpha)` usage */
  accentRGB: string;
  Header: React.FC;
  entityKey: 'companies' | 'institutions';
  profilePath: (id: string) => string;
  /** Per-tab aggregate endpoints */
  endpoints: {
    lobbying: string;
    contracts: string;
    enforcement: string;
  };
}

function build(
  key: string,
  label: string,
  Header: React.FC,
  entityKey: 'companies' | 'institutions',
  apiSlug: string,
  profileSlug: string,
): SectorConfig {
  // Pull the accent from the design-handoff palette. Every sector in this
  // map also lives in SECTOR_ACCENTS, so this lookup is always defined.
  const palette = SECTOR_ACCENTS[key] ?? SECTOR_ACCENTS.politics;
  const accent = palette.accent;
  return {
    key,
    label,
    accent,
    accentToken: accent, // literal hex; the CSS-variable indirection was redundant
    accentRGB: hexToRgbTriplet(accent),
    Header,
    entityKey,
    profilePath: (id) => `/${profileSlug}/${id}`,
    endpoints: {
      lobbying: `${API_BASE}/aggregate/${apiSlug}/lobbying?limit=500`,
      contracts: `${API_BASE}/aggregate/${apiSlug}/contracts?limit=500`,
      enforcement: `${API_BASE}/aggregate/${apiSlug}/enforcement?limit=500`,
    },
  };
}

export const SECTOR_MAP: Record<string, SectorConfig> = {
  finance:        build('finance',        'Finance',            FinanceSectorHeader,        'institutions', 'finance',        'finance'),
  health:         build('health',         'Health',             HealthSectorHeader,         'companies',    'health',         'health'),
  technology:     build('technology',     'Technology',         TechSectorHeader,           'companies',    'tech',           'technology'),
  energy:         build('energy',         'Energy',             EnergySectorHeader,         'companies',    'energy',         'energy'),
  transportation: build('transportation', 'Transportation',     TransportationSectorHeader, 'companies',    'transportation', 'transportation'),
  defense:        build('defense',        'Defense',            DefenseSectorHeader,        'companies',    'defense',        'defense'),
  chemicals:      build('chemicals',      'Chemicals',          ChemicalsSectorHeader,      'companies',    'chemicals',      'chemicals'),
  agriculture:    build('agriculture',    'Agriculture',        AgricultureSectorHeader,    'companies',    'agriculture',    'agriculture'),
  telecom:        build('telecom',        'Telecommunications', TelecomSectorHeader,        'companies',    'telecom',        'telecom'),
  education:      build('education',      'Education',          EducationSectorHeader,      'companies',    'education',      'education'),
  politics: {
    key: 'politics',
    label: 'Politics',
    accent: SECTOR_ACCENTS.politics.accent,
    accentToken: SECTOR_ACCENTS.politics.accent,
    accentRGB: hexToRgbTriplet(SECTOR_ACCENTS.politics.accent),
    Header: PoliticsSectorHeader,
    entityKey: 'companies',
    profilePath: () => '/politics',
    endpoints: { lobbying: '', contracts: '', enforcement: '' },
  },
};

/** Extract sector key from a url pathname like `/finance/lobbying`. Falls back to 'technology'. */
export function detectSector(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] || '';
  if (seg in SECTOR_MAP) return seg;
  return 'technology';
}
