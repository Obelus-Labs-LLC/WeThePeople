import React from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../../constants/colors';
import { LoadingSpinner, EmptyState } from '../ui';

interface Trade {
  id?: number;
  ticker?: string;
  transaction_type?: string;
  amount_range?: string;
  transaction_date?: string;
  reporting_gap_days?: number;
  asset_description?: string;
  politician_name?: string;
}

interface TradesTabProps {
  trades: Trade[] | null;
  loading: boolean;
}

export function TradesTab({ trades, loading }: TradesTabProps) {
  if (loading) return <LoadingSpinner message="Loading trades..." />;
  if (!trades || trades.length === 0) {
    return <EmptyState title="No stock trades" message="No congressional stock trade disclosures found for this member." />;
  }

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Congressional Trades ({trades.length})</Text>
      {trades.map((trade, i) => {
        const isBuy = trade.transaction_type?.toLowerCase().includes('purchase');
        const isSell = trade.transaction_type?.toLowerCase().includes('sale');
        const badgeColor = isBuy ? '#10B981' : isSell ? '#DC2626' : '#F59E0B';
        const badgeLabel = isBuy ? 'Buy' : isSell ? 'Sell' : (trade.transaction_type || '?');

        return (
          <View key={trade.id ?? i} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.typeBadge, { backgroundColor: badgeColor + '15' }]}>
                <Text style={[styles.typeBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
              </View>
              {trade.ticker && (
                <Text style={styles.ticker}>{trade.ticker}</Text>
              )}
              {trade.transaction_date && (
                <Text style={styles.date}>{trade.transaction_date}</Text>
              )}
            </View>
            {trade.asset_description && (
              <Text style={styles.description} numberOfLines={2}>{trade.asset_description}</Text>
            )}
            <View style={styles.detailRow}>
              {trade.amount_range && (
                <Text style={styles.amount}>{trade.amount_range}</Text>
              )}
              {trade.reporting_gap_days != null && (
                <Text style={[
                  styles.reportingGap,
                  trade.reporting_gap_days > 45 && { color: '#DC2626' },
                ]}>
                  {trade.reporting_gap_days}d reporting gap
                </Text>
              )}
            </View>
          </View>
        );
      })}

      {/* Capitol Trades link */}
      <TouchableOpacity
        style={styles.sourceCard}
        onPress={() => Linking.openURL('https://www.capitoltrades.com/')}
      >
        <Ionicons name="open-outline" size={14} color={UI_COLORS.ACCENT} />
        <Text style={styles.sourceLinkText}>View on Capitol Trades</Text>
      </TouchableOpacity>
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
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  ticker: { fontSize: 14, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY, fontFamily: 'monospace' },
  date: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginLeft: 'auto' },
  description: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 16, marginBottom: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  amount: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  reportingGap: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  sourceCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, marginTop: 4,
  },
  sourceLinkText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.ACCENT },
});
