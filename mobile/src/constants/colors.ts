// WeThePeople - Design System v2
// Dark theme: deep navy/charcoal backgrounds, gold + emerald accents
// Inspired by Washington Post dark mode + web frontend

export const UI_COLORS = {
  // Backgrounds - deep dark hierarchy
  PRIMARY_BG: '#0A0F1A',        // deepest - main screen bg
  SECONDARY_BG: '#0F1520',      // slightly lighter - scrollable content bg
  CARD_BG: '#151C2A',           // card surfaces
  CARD_BG_ELEVATED: '#1A2236',  // elevated cards, modals

  // Borders - subtle separation
  BORDER: '#1E293B',            // standard border
  BORDER_LIGHT: '#252F3F',      // lighter border for nested elements

  // Text - high contrast on dark
  TEXT_PRIMARY: '#F1F5F9',      // primary text (near white)
  TEXT_SECONDARY: '#94A3B8',    // secondary text (slate)
  TEXT_MUTED: '#64748B',        // muted/label text

  // Accents - gold primary, emerald secondary
  ACCENT: '#C5A044',            // gold (primary actions, highlights)
  ACCENT_LIGHT: '#C5A04420',   // gold with alpha for backgrounds
  GOLD: '#C5A044',              // gold accent
  GOLD_LIGHT: '#C5A04415',     // subtle gold bg
  EMERALD: '#10B981',           // emerald (success, positive data)
  EMERALD_LIGHT: '#10B98120',  // emerald bg

  // Tab bar
  TAB_ACTIVE: '#C5A044',       // gold active tab
  TAB_INACTIVE: '#475569',     // slate inactive

  // Status
  SUCCESS: '#10B981',
  WARNING: '#F59E0B',
  DANGER: '#EF4444',

  // Hero / header
  HERO_BG: '#0D1117',          // GitHub-dark style hero

  // Surface overlays
  OVERLAY: 'rgba(0, 0, 0, 0.6)',
  GLASS: 'rgba(255, 255, 255, 0.05)',
} as const;

export const TIER_COLORS: Record<string, string> = {
  strong: '#10B981',
  moderate: '#F59E0B',
  weak: '#F97316',
  none: '#475569',
};

export const PARTY_COLORS: Record<string, string> = {
  D: '#3B82F6',
  R: '#EF4444',
  I: '#A855F7',
  Democrat: '#3B82F6',
  Republican: '#EF4444',
  Independent: '#A855F7',
};

export const SECTOR_GRADIENTS: Record<string, [string, string]> = {
  politics: ['#1E40AF', '#1D4ED8'],
  finance: ['#047857', '#059669'],
  health: ['#9F1239', '#BE185D'],
  chemicals: ['#92400E', '#B45309'],
  energy: ['#1E293B', '#334155'],
  technology: ['#5B21B6', '#7C3AED'],
  transportation: ['#1E3A5F', '#2563EB'],
  defense: ['#7F1D1D', '#DC2626'],
  agriculture: ['#166534', '#15803D'],
  telecom: ['#BE185D', '#DB2777'],
  telecommunications: ['#BE185D', '#DB2777'],
  education: ['#A16207', '#CA8A04'],
};

export const ACCENT_COLORS: Record<string, string> = {
  blue: '#3B82F6',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
  red: '#EF4444',
  slate: '#64748B',
  green: '#059669',
  gold: '#C5A044',
  purple: '#A855F7',
  teal: '#14B8A6',
};
