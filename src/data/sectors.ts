export interface Sector {
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  gradientStart: string;
  gradientEnd: string;
  route: string;
  available: boolean;
}

export const SECTORS: Sector[] = [
  {
    slug: 'politics',
    name: 'Politics',
    tagline: 'Track what politicians say vs. what they do',
    icon: '\u{1F3DB}\uFE0F',
    gradientStart: '#2563EB',
    gradientEnd: '#4338CA',
    route: 'PoliticsDashboard',
    available: true,
  },
  {
    slug: 'finance',
    name: 'Finance',
    tagline: 'Audit Wall Street, crypto, and financial disclosures',
    icon: '\u{1F4B0}',
    gradientStart: '#10B981',
    gradientEnd: '#0F766E',
    route: 'FinanceDashboard',
    available: true,
  },
  {
    slug: 'health',
    name: 'Health',
    tagline: 'Track pharmaceutical and healthcare activity',
    icon: '\u{1F3E5}',
    gradientStart: '#F43F5E',
    gradientEnd: '#BE185D',
    route: 'HealthDashboard',
    available: true,
  },
  {
    slug: 'chemicals',
    name: 'Chemicals',
    tagline: 'Monitor chemical industry safety actions',
    icon: '\u2697\uFE0F',
    gradientStart: '#F59E0B',
    gradientEnd: '#C2410C',
    route: 'ComingSoon',
    available: false,
  },
  {
    slug: 'energy',
    name: 'Oil, Gas & Energy',
    tagline: 'Track energy sector environmental commitments',
    icon: '\u{1F6E2}\uFE0F',
    gradientStart: '#475569',
    gradientEnd: '#3F3F46',
    route: 'ComingSoon',
    available: false,
  },
  {
    slug: 'technology',
    name: 'Technology',
    tagline: 'Audit Big Tech privacy and safety promises',
    icon: '\u{1F4BB}',
    gradientStart: '#8B5CF6',
    gradientEnd: '#7C3AED',
    route: 'TechDashboard',
    available: true,
  },
  {
    slug: 'defense',
    name: 'Defense',
    tagline: 'Scrutinize military contractor accountability',
    icon: '\u{1F6E1}\uFE0F',
    gradientStart: '#DC2626',
    gradientEnd: '#9F1239',
    route: 'ComingSoon',
    available: false,
  },
  {
    slug: 'agriculture',
    name: 'Agriculture',
    tagline: 'Track food safety and farming activity',
    icon: '\u{1F33E}',
    gradientStart: '#84CC16',
    gradientEnd: '#15803D',
    route: 'ComingSoon',
    available: false,
  },
];
