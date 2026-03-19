import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { UI_COLORS } from '../../constants/colors';
import { LoadingSpinner, EmptyState } from '../ui';

interface Donor {
  company_name?: string;
  sector?: string;
  total_amount?: number;
  cycle?: string;
  committee_name?: string;
}

interface DonorsTabProps {
  donors: Donor[] | null;
  loading: boolean;
}

const SECTOR_COLORS: Record<string, string> = {
  finance: '#10B981',
  health: '#E11D48',
  technology: '#8B5CF6',
  energy: '#475569',
  defense: '#DC2626',
};

export function DonorsTab({ donors, loading }: DonorsTabProps) {
  if (loading) return <LoadingSpinner message="Loading donor data..." />;
  if (!donors || donors.length === 0) {
    return <EmptyState title="No industry donors" message="No industry donation data available for this member." />;
  }

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Industry Donors ({donors.length})</Text>
      {donors.map((donor, i) => {
        const sColor = SECTOR_COLORS[donor.sector?.toLowerCase() || ''] || '#6B7280';
        return (
          <View key={i} style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.companyName} numberOfLines={1}>{donor.company_name || 'Unknown'}</Text>
              {donor.total_amount != null && (
                <Text style={styles.amount}>${donor.total_amount.toLocaleString()}</Text>
              )}
            </View>
            <View style={styles.metaRow}>
              {donor.sector && (
                <View style={[styles.sectorBadge, { backgroundColor: sColor + '12', borderColor: sColor + '25' }]}>
                  <Text style={[styles.sectorBadgeText, { color: sColor }]}>{donor.sector}</Text>
                </View>
              )}
              {donor.cycle && <Text style={styles.cycle}>{donor.cycle}</Text>}
              {donor.committee_name && (
                <Text style={styles.committee} numberOfLines={1}>{donor.committee_name}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: { gap: 8, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  companyName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, flex: 1, marginRight: 8 },
  amount: { fontSize: 14, fontWeight: '700', color: UI_COLORS.ACCENT, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectorBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  sectorBadgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  cycle: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  committee: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, flex: 1 },
});
