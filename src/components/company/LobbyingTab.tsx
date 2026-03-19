import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../../constants/colors';
import { LoadingSpinner, EmptyState } from '../ui';

interface LobbyingFiling {
  id?: number;
  registrant_name?: string;
  client_name?: string;
  income?: number | null;
  filing_year?: number;
  filing_period?: string;
  lobbying_issues?: string;
  filing_uuid?: string;
}

interface LobbyingSummary {
  total_filings?: number;
  total_income?: number;
}

interface LobbyingTabProps {
  filings: LobbyingFiling[] | null;
  summary: LobbyingSummary | null;
  loading: boolean;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '--';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function LobbyingTab({ filings, summary, loading }: LobbyingTabProps) {
  if (loading) return <LoadingSpinner message="Loading lobbying data..." />;
  if (!filings || filings.length === 0) {
    return <EmptyState title="No lobbying records" message="No Senate LDA lobbying disclosures found." />;
  }

  return (
    <View style={styles.tabContent}>
      {/* Summary stats */}
      {summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.total_filings ?? filings.length}</Text>
            <Text style={styles.summaryLabel}>Filings</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>{fmt(summary.total_income)}</Text>
            <Text style={styles.summaryLabel}>Total Spent</Text>
          </View>
        </View>
      )}

      {filings.map((f, i) => (
        <TouchableOpacity
          key={f.id ?? i}
          style={styles.card}
          onPress={() => f.filing_uuid ? Linking.openURL(`https://lda.senate.gov/filings/filing/${f.filing_uuid}/`) : null}
          disabled={!f.filing_uuid}
          accessibilityRole="link"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{f.registrant_name || 'Unknown Firm'}</Text>
            <Text style={styles.cardMeta}>
              {f.filing_year} {f.filing_period || ''} {f.client_name ? `· ${f.client_name}` : ''}
            </Text>
            {f.income != null && (
              <Text style={styles.incomeText}>{fmt(f.income)}</Text>
            )}
            {f.lobbying_issues && (
              <Text style={styles.issuesText} numberOfLines={1}>Issues: {f.lobbying_issues}</Text>
            )}
          </View>
          {f.filing_uuid && <Ionicons name="open-outline" size={14} color={UI_COLORS.TEXT_MUTED} />}
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
  cardTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  cardMeta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  incomeText: { fontSize: 13, fontWeight: '700', color: '#F59E0B', marginTop: 3 },
  issuesText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3, fontStyle: 'italic' },
});
