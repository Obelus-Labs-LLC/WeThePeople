import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../../constants/colors';
import { LoadingSpinner, EmptyState, StatCard } from '../ui';
import type { PersonFinance } from '../../api/types';

interface FinanceTabProps {
  finance: PersonFinance | null;
  loading: boolean;
}

export function FinanceTab({ finance, loading }: FinanceTabProps) {
  if (loading) return <LoadingSpinner message="Loading finance data..." />;
  if (!finance || !finance.totals) {
    return <EmptyState title="No finance data" message="FEC data is not available for this member." />;
  }

  return (
    <View style={styles.tabContent}>
      <View style={styles.statsGrid}>
        <StatCard
          label="Total Raised"
          value={`$${((finance.totals.receipts || 0) / 1_000_000).toFixed(1)}M`}
          accent="emerald"
        />
        <StatCard
          label="Total Spent"
          value={`$${((finance.totals.disbursements || 0) / 1_000_000).toFixed(1)}M`}
          accent="amber"
        />
        <StatCard
          label="Cash on Hand"
          value={`$${((finance.totals.cash_on_hand || 0) / 1_000_000).toFixed(1)}M`}
          accent="green"
        />
      </View>

      {finance.top_donors.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Donors</Text>
          <View style={styles.donorHeaderRow}>
            <Text style={[styles.donorHeaderText, { flex: 1.2 }]}>Name</Text>
            <Text style={[styles.donorHeaderText, { flex: 1 }]}>Employer</Text>
            <Text style={[styles.donorHeaderText, { flex: 0.6, textAlign: 'right' }]}>Amount</Text>
          </View>
          {finance.top_donors.map((donor, i) => (
            <View key={i} style={[styles.donorRow, i < finance.top_donors.length - 1 && styles.donorBorder]}>
              <Text style={[styles.donorName, { flex: 1.2 }]} numberOfLines={1}>{donor.name || 'Unknown'}</Text>
              <Text style={[styles.donorEmployer, { flex: 1 }]} numberOfLines={1}>{donor.employer || '—'}</Text>
              <Text style={[styles.donorAmount, { flex: 0.6 }]}>${(donor.amount || 0).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      )}

      {/* FEC source link */}
      {finance.candidate_id && (
        <TouchableOpacity
          style={styles.sourceCard}
          onPress={() => Linking.openURL(`https://www.fec.gov/data/candidate/${finance.candidate_id}/`)}
        >
          <Ionicons name="open-outline" size={14} color={UI_COLORS.ACCENT} />
          <Text style={styles.sourceLinkText}>View full FEC filings on FEC.gov</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: { gap: 12, paddingHorizontal: 16 },
  statsGrid: { gap: 8 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  donorHeaderRow: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER },
  donorHeaderText: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, fontWeight: '600' },
  donorRow: { flexDirection: 'row', paddingVertical: 10, alignItems: 'center' },
  donorBorder: { borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER },
  donorName: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 12 },
  donorEmployer: { color: UI_COLORS.TEXT_MUTED, fontSize: 12 },
  donorAmount: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'right' },
  sourceCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  sourceLinkText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.ACCENT },
});
