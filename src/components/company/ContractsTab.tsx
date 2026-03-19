import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../../constants/colors';
import { LoadingSpinner, EmptyState } from '../ui';

interface ContractItem {
  id?: number;
  description?: string;
  award_amount?: number | null;
  awarding_agency?: string;
  start_date?: string;
  end_date?: string;
  award_id?: string;
}

interface ContractSummary {
  total_contracts?: number;
  total_amount?: number;
}

interface ContractsTabProps {
  contracts: ContractItem[] | null;
  summary: ContractSummary | null;
  loading: boolean;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '--';
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function ContractsTab({ contracts, summary, loading }: ContractsTabProps) {
  if (loading) return <LoadingSpinner message="Loading contracts..." />;
  if (!contracts || contracts.length === 0) {
    return <EmptyState title="No government contracts" message="No USASpending.gov contract records found." />;
  }

  return (
    <View style={styles.tabContent}>
      {/* Summary stats */}
      {summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.total_contracts ?? contracts.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>{fmt(summary.total_amount)}</Text>
            <Text style={styles.summaryLabel}>Value</Text>
          </View>
        </View>
      )}

      {contracts.map((ct, i) => (
        <TouchableOpacity
          key={ct.id ?? i}
          style={styles.card}
          onPress={() => ct.award_id ? Linking.openURL(`https://www.usaspending.gov/award/${ct.award_id}`) : null}
          disabled={!ct.award_id}
          accessibilityRole="link"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>{ct.description || 'Government Contract'}</Text>
            <Text style={styles.cardMeta}>
              {ct.awarding_agency || '--'} {ct.start_date ? `· ${ct.start_date}` : ''}
            </Text>
            {ct.award_amount != null && (
              <Text style={styles.amountText}>{fmt(ct.award_amount)}</Text>
            )}
          </View>
          {ct.award_id && <Ionicons name="open-outline" size={14} color={UI_COLORS.TEXT_MUTED} />}
        </TouchableOpacity>
      ))}
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
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 19 },
  cardMeta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  amountText: { fontSize: 13, fontWeight: '700', color: '#10B981', marginTop: 3 },
});
