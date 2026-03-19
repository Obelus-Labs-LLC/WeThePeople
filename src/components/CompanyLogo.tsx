import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { UI_COLORS } from '../constants/colors';

const COMPANY_DOMAINS: Record<string, string> = {
  'jpmorgan': 'jpmorganchase.com', 'bank-of-america': 'bankofamerica.com',
  'citigroup': 'citigroup.com', 'wells-fargo': 'wellsfargo.com',
  'goldman-sachs': 'goldmansachs.com', 'morgan-stanley': 'morganstanley.com',
  'blackrock': 'blackrock.com', 'vanguard': 'vanguard.com',
  'state-street': 'statestreet.com', 'charles-schwab': 'schwab.com',
  'capital-one': 'capitalone.com', 'pnc-financial': 'pnc.com',
  'pfizer': 'pfizer.com', 'johnson-johnson': 'jnj.com',
  'unitedhealth': 'unitedhealthgroup.com', 'abbvie': 'abbvie.com',
  'merck': 'merck.com', 'eli-lilly': 'lilly.com', 'amgen': 'amgen.com',
  'apple': 'apple.com', 'microsoft': 'microsoft.com', 'google': 'google.com',
  'amazon': 'amazon.com', 'meta': 'meta.com', 'nvidia': 'nvidia.com',
  'tesla': 'tesla.com', 'intel': 'intel.com', 'ibm': 'ibm.com',
  'salesforce': 'salesforce.com', 'oracle': 'oracle.com', 'adobe': 'adobe.com',
  'exxon-mobil': 'exxonmobil.com', 'chevron': 'chevron.com',
  'conocophillips': 'conocophillips.com', 'shell': 'shell.com',
  'bp': 'bp.com', 'duke-energy': 'duke-energy.com',
  'nextera': 'nexteraenergy.com', 'southern-company': 'southerncompany.com',
};

interface CompanyLogoProps {
  companyId: string;
  logoUrl?: string;
  size?: number;
  style?: object;
}

export default function CompanyLogo({ companyId, logoUrl, size = 40, style }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const [ddgFailed, setDdgFailed] = useState(false);

  const domain = COMPANY_DOMAINS[companyId];
  const ddgUrl = domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : null;

  const imageUrl = !failed && logoUrl ? logoUrl
    : !ddgFailed && ddgUrl ? ddgUrl
    : null;

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: UI_COLORS.SECONDARY_BG }, style]}
        onError={() => {
          if (!failed && logoUrl) setFailed(true);
          else setDdgFailed(true);
        }}
      />
    );
  }

  // Fallback: initials
  const initials = companyId
    .split(/[-_]/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={[styles.initials, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: UI_COLORS.CARD_BG_ELEVATED,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '700',
    color: UI_COLORS.TEXT_SECONDARY,
  },
});
