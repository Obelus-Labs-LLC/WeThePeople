// WeThePeople — Design System
// Light civic theme: white background, green & gold accents

export const UI_COLORS = {
  // Backgrounds
  PRIMARY_BG: '#FFFFFF',
  SECONDARY_BG: '#F8FAF8',
  CARD_BG: '#FFFFFF',
  CARD_BG_ELEVATED: '#F0F5F0',

  // Borders
  BORDER: '#E2E8E0',
  BORDER_LIGHT: '#F0F2EF',

  // Text
  TEXT_PRIMARY: '#1A2E1A',
  TEXT_SECONDARY: '#4A5E4A',
  TEXT_MUTED: '#8A978A',

  // Accents — civic green + gold
  ACCENT: '#1B7A3D',          // deep civic green (primary actions)
  ACCENT_LIGHT: '#E8F5EC',    // soft green bg for badges/highlights
  GOLD: '#C5960C',            // gold accent (secondary emphasis)
  GOLD_LIGHT: '#FDF8E8',      // soft gold bg

  // Tab bar
  TAB_ACTIVE: '#1B7A3D',
  TAB_INACTIVE: '#9CA89C',

  // Status
  SUCCESS: '#10B981',
  WARNING: '#D4A017',
  DANGER: '#DC2626',

  // Hero / header gradient overlay
  HERO_BG: '#F0F7F2',
} as const;

export const TIER_COLORS: Record<string, string> = {
  strong: '#10B981',
  moderate: '#D4A017',
  weak: '#E67E22',
  none: '#9CA3AF',
};

export const PARTY_COLORS: Record<string, string> = {
  D: '#2563EB',
  R: '#DC2626',
  I: '#7C3AED',
  Democrat: '#2563EB',
  Republican: '#DC2626',
  Independent: '#7C3AED',
};

export const SECTOR_GRADIENTS: Record<string, [string, string]> = {
  politics: ['#2563EB', '#4338CA'],
  finance: ['#10B981', '#0F766E'],
  health: ['#F43F5E', '#BE185D'],
  chemicals: ['#F59E0B', '#C2410C'],
  energy: ['#475569', '#3F3F46'],
  technology: ['#8B5CF6', '#7C3AED'],
  defense: ['#DC2626', '#9F1239'],
  agriculture: ['#84CC16', '#15803D'],
};

export const ACCENT_COLORS: Record<string, string> = {
  blue: '#2563EB',
  emerald: '#10B981',
  amber: '#D4A017',
  rose: '#E11D48',
  red: '#DC2626',
  slate: '#64748B',
  green: '#1B7A3D',
  gold: '#C5960C',
  purple: '#8B5CF6',
};

// Centralized status/sector colors used across detail screens
export const STATUS_COLORS = {
  ERROR: '#DC2626',
  WARNING: '#F59E0B',
  INFO: '#2563EB',
  SUCCESS: '#10B981',
  MUTED: '#6B7280',
  PURPLE: '#8B5CF6',
  PINK: '#EC4899',
  ORANGE: '#EA580C',
} as const;

export const TECH_SECTOR_COLORS: Record<string, string> = {
  platform: '#8B5CF6',
  enterprise: '#2563EB',
  semiconductor: '#F59E0B',
  automotive: '#10B981',
  media: '#EC4899',
};

export const HEALTH_SECTOR_COLORS: Record<string, string> = {
  pharma: '#2563EB',
  biotech: '#8B5CF6',
  insurer: '#F59E0B',
  pharmacy: '#10B981',
  distributor: '#64748B',
};

export const FINANCE_SECTOR_COLORS: Record<string, string> = {
  bank: '#2563EB',
  investment: '#8B5CF6',
  insurance: '#F59E0B',
  fintech: '#10B981',
  central_bank: '#DC2626',
};

export const ENERGY_SECTOR_COLORS: Record<string, string> = {
  oil_gas: '#475569',
  utility: '#2563EB',
  renewable: '#10B981',
  pipeline: '#F59E0B',
  services: '#8B5CF6',
};

export const ENERGY_ENFORCEMENT_COLORS: Record<string, string> = {
  EPA: '#10B981',
  FERC: '#2563EB',
  DOJ: '#7C3AED',
  'State AG': '#EA580C',
};

export const ENFORCEMENT_SOURCE_COLORS: Record<string, string> = {
  FTC: '#DC2626',
  DOJ: '#7C3AED',
  'FTC/State AGs': '#EA580C',
  'Private/Court': '#6B7280',
};
