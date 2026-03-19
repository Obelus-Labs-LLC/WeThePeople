import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { UI_COLORS, PARTY_COLORS } from '../../constants/colors';
import { LoadingSpinner, EmptyState } from '../ui';

interface Donation {
  id?: number;
  candidate_name?: string;
  party?: string;
  amount?: number;
  cycle?: string;
  committee_name?: string;
}

interface DonationsTabProps {
  donations: Donation[] | null;
  loading: boolean;
}

export function DonationsTab({ donations, loading }: DonationsTabProps) {
  if (loading) return <LoadingSpinner message="Loading donation data..." />;
  if (!donations || donations.length === 0) {
    return <EmptyState title="No donation records" message="No FEC political donation records found." />;
  }

  const totalAmount = donations.reduce((sum, d) => sum + (d.amount || 0), 0);

  return (
    <View style={styles.tabContent}>
      {/* Summary */}
      {totalAmount > 0 && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{donations.length}</Text>
            <Text style={styles.summaryLabel}>Donations</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: UI_COLORS.ACCENT }]}>
              ${totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
        </View>
      )}

      {donations.map((d, i) => {
        const letter = d.party?.charAt(0).toUpperCase() || '?';
        const partyColor = PARTY_COLORS[letter] || PARTY_COLORS[d.party || ''] || '#6B7280';
        const partyLabel = letter === 'D' ? 'Dem' : letter === 'R' ? 'Rep' : letter === 'I' ? 'Ind' : (d.party || '?');

        return (
          <View key={d.id ?? i} style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.candidateName} numberOfLines={1}>{d.candidate_name || 'Unknown'}</Text>
              <View style={[styles.partyBadge, { backgroundColor: partyColor + '12', borderColor: partyColor + '25' }]}>
                <Text style={[styles.partyBadgeText, { color: partyColor }]}>{partyLabel}</Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              {d.amount != null && (
                <Text style={styles.amount}>${d.amount.toLocaleString()}</Text>
              )}
              {d.cycle && <Text style={styles.cycle}>{d.cycle}</Text>}
            </View>
            {d.committee_name && (
              <Text style={styles.committee} numberOfLines={1}>{d.committee_name}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: { gap: 8, paddingHorizontal: 16 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  summaryItem: {
    flex: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  summaryValue: { fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  summaryLabel: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  candidateName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, flex: 1, marginRight: 8 },
  partyBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  partyBadgeText: { fontSize: 10, fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, fontVariant: ['tabular-nums'] },
  cycle: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  committee: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 4 },
});
