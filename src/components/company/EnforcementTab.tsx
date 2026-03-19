import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../../constants/colors';
import { LoadingSpinner, EmptyState } from '../ui';

interface EnforcementAction {
  id?: number;
  case_title?: string;
  description?: string;
  penalty_amount?: number | null;
  case_date?: string;
  source?: string;
  enforcement_type?: string;
  case_url?: string;
}

interface EnforcementTabProps {
  actions: EnforcementAction[] | null;
  totalPenalties?: number;
  loading: boolean;
}

const SOURCE_COLORS: Record<string, string> = {
  FTC: '#DC2626',
  DOJ: '#7C3AED',
  EPA: '#10B981',
  FERC: '#2563EB',
  SEC: '#F59E0B',
  'FTC/State AGs': '#EA580C',
  'State AG': '#EA580C',
  'Private/Court': '#6B7280',
};

function fmt(n: number | null | undefined): string {
  if (n == null) return '--';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function EnforcementTab({ actions, totalPenalties, loading }: EnforcementTabProps) {
  if (loading) return <LoadingSpinner message="Loading enforcement data..." />;
  if (!actions || actions.length === 0) {
    return <EmptyState title="No enforcement actions" message="No regulatory enforcement actions on record." />;
  }

  return (
    <View style={styles.tabContent}>
      {/* Summary */}
      {(totalPenalties != null && totalPenalties > 0) && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#DC2626' }]}>{fmt(totalPenalties)}</Text>
            <Text style={styles.summaryLabel}>Total Penalties</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{actions.length}</Text>
            <Text style={styles.summaryLabel}>Actions</Text>
          </View>
        </View>
      )}

      {actions.map((a, i) => {
        const srcColor = SOURCE_COLORS[a.source || ''] || '#6B7280';
        return (
          <TouchableOpacity
            key={a.id ?? i}
            style={styles.card}
            onPress={() => a.case_url ? Linking.openURL(a.case_url) : null}
            disabled={!a.case_url}
            accessibilityRole="link"
          >
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                {a.source && (
                  <View style={[styles.sourceBadge, { backgroundColor: srcColor + '15' }]}>
                    <Text style={[styles.sourceBadgeText, { color: srcColor }]}>{a.source}</Text>
                  </View>
                )}
                {a.enforcement_type && <Text style={styles.enfType}>{a.enforcement_type}</Text>}
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{a.case_title || 'Enforcement Action'}</Text>
              {a.case_date && <Text style={styles.cardDate}>{a.case_date}</Text>}
              {a.penalty_amount != null && a.penalty_amount > 0 && (
                <Text style={styles.penaltyText}>{fmt(a.penalty_amount)} penalty</Text>
              )}
              {a.description && (
                <Text style={styles.descText} numberOfLines={2}>{a.description}</Text>
              )}
            </View>
            {a.case_url && <Ionicons name="open-outline" size={14} color={UI_COLORS.TEXT_MUTED} />}
          </TouchableOpacity>
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
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  sourceBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  sourceBadgeText: { fontSize: 10, fontWeight: '700' },
  enfType: { fontSize: 10, color: UI_COLORS.TEXT_MUTED },
  cardTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 19 },
  cardDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  penaltyText: { fontSize: 13, fontWeight: '700', color: '#DC2626', marginTop: 3 },
  descText: { fontSize: 11, color: UI_COLORS.TEXT_SECONDARY, marginTop: 4, lineHeight: 16 },
});
