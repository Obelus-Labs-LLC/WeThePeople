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

const API_BASE = getApiBaseUrl();

// ── Shared sector config ──
// Accent hex values are aligned to design tokens from base.css:
//   green   #3DB87A → var(--color-green)
//   red     #E63946 → var(--color-red)
//   ind     #B06FD8 → var(--color-ind)
//   dem     #4A7FDE → var(--color-dem)
//   accent  #C5A028 → var(--color-accent)

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
  accent: string,
  accentToken: string,
  accentRGB: string,
  Header: React.FC,
  entityKey: 'companies' | 'institutions',
  apiSlug: string,
  profileSlug: string,
): SectorConfig {
  return {
    key,
    label,
    accent,
    accentToken,
    accentRGB,
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
  finance: build(
    'finance', 'Finance', '#3DB87A', 'var(--color-green)', '61,184,122',
    FinanceSectorHeader, 'institutions', 'finance', 'finance',
  ),
  health: build(
    'health', 'Health', '#E63946', 'var(--color-red)', '230,57,70',
    HealthSectorHeader, 'companies', 'health', 'health',
  ),
  technology: build(
    'technology', 'Technology', '#B06FD8', 'var(--color-ind)', '176,111,216',
    TechSectorHeader, 'companies', 'tech', 'technology',
  ),
  energy: build(
    'energy', 'Energy', '#C5A028', 'var(--color-accent-text)', '197,160,40',
    EnergySectorHeader, 'companies', 'energy', 'energy',
  ),
  politics: {
    key: 'politics', label: 'Politics', accent: '#4A7FDE', accentToken: 'var(--color-dem)', accentRGB: '74,127,222',
    Header: PoliticsSectorHeader, entityKey: 'companies',
    profilePath: () => '/politics',
    endpoints: { lobbying: '', contracts: '', enforcement: '' },
  },
  transportation: build(
    'transportation', 'Transportation', '#4A7FDE', 'var(--color-dem)', '74,127,222',
    TransportationSectorHeader, 'companies', 'transportation', 'transportation',
  ),
  defense: build(
    'defense', 'Defense', '#E63946', 'var(--color-red)', '230,57,70',
    DefenseSectorHeader, 'companies', 'defense', 'defense',
  ),
  chemicals: build(
    'chemicals', 'Chemicals', '#B06FD8', 'var(--color-ind)', '176,111,216',
    ChemicalsSectorHeader, 'companies', 'chemicals', 'chemicals',
  ),
  agriculture: build(
    'agriculture', 'Agriculture', '#3DB87A', 'var(--color-green)', '61,184,122',
    AgricultureSectorHeader, 'companies', 'agriculture', 'agriculture',
  ),
  telecom: build(
    'telecom', 'Telecommunications', '#4A7FDE', 'var(--color-dem)', '74,127,222',
    TelecomSectorHeader, 'companies', 'telecom', 'telecom',
  ),
  education: build(
    'education', 'Education', '#B06FD8', 'var(--color-ind)', '176,111,216',
    EducationSectorHeader, 'companies', 'education', 'education',
  ),
};

/** Extract sector key from a url pathname like `/finance/lobbying`. Falls back to 'technology'. */
export function detectSector(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] || '';
  if (seg in SECTOR_MAP) return seg;
  return 'technology';
}
