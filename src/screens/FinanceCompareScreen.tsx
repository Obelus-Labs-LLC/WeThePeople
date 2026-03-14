import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { Institution, FinanceComparisonItem } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';

type Metric = {
  key: keyof FinanceComparisonItem;
  label: string;
  format: 'number' | 'money' | 'pct';
  icon: string;
  color: string;
};

const METRICS: Metric[] = [
  { key: 'market_cap', label: 'Market Cap', format: 'money', icon: 'trending-up', color: '#2563EB' },
  { key: 'total_assets', label: 'Total Assets', format: 'money', icon: 'wallet-outline', color: '#10B981' },
  { key: 'total_deposits', label: 'Total Deposits', format: 'money', icon: 'cash-outline', color: '#F59E0B' },
  { key: 'net_income', label: 'Net Income', format: 'money', icon: 'analytics-outline', color: '#10B981' },
  { key: 'filing_count', label: 'SEC Filings', format: 'number', icon: 'document-outline', color: '#8B5CF6' },
  { key: 'complaint_count', label: 'CFPB Complaints', format: 'number', icon: 'chatbubble-ellipses-outline', color: '#DC2626' },
  { key: 'roe', label: 'Return on Equity', format: 'pct', icon: 'stats-chart-outline', color: '#2563EB' },
  { key: 'tier1_capital_ratio', label: 'Tier 1 Capital', format: 'pct', icon: 'shield-outline', color: '#10B981' },
];

export default function FinanceCompareScreen() {
  const navigation = useNavigation<any>();
  const [allInstitutions, setAllInstitutions] = useState<Institution[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<FinanceComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    apiClient.getInstitutions({ limit: 50 })
      .then((res) => {
        setAllInstitutions(res.institutions || []);
        const top5 = (res.institutions || []).slice(0, 5).map((i) => i.institution_id);
        setSelectedIds(top5);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedIds.length >= 2) {
      setComparing(true);
      apiClient.getFinanceComparison(selectedIds)
        .then((res) => setComparison(res.institutions || []))
        .catch(() => {})
        .finally(() => setComparing(false));
    } else {
      setComparison([]);
    }
  }, [selectedIds]);

  const toggleInstitution = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 10
        ? [...prev, id]
        : prev
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    apiClient.getInstitutions({ limit: 50 })
      .then((res) => setAllInstitutions(res.institutions || []))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  if (loading) return <LoadingSpinner message="Loading institutions..." />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View style={styles.selectorCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="git-compare-outline" size={16} color={UI_COLORS.ACCENT} />
          <Text style={styles.cardTitle}>Select Institutions to Compare</Text>
        </View>
        <View style={styles.chipGrid}>
          {allInstitutions.map((inst) => {
            const selected = selectedIds.includes(inst.institution_id);
            return (
              <TouchableOpacity
                key={inst.institution_id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => toggleInstitution(inst.institution_id)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {inst.ticker || inst.display_name}
                </Text>
                {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.selectorHint}>
          {selectedIds.length} selected (min 2, max 10)
        </Text>
      </View>

      {comparing && <LoadingSpinner message="Comparing..." />}

      {!comparing && comparison.length >= 2 && (
        <View style={styles.resultsSection}>
          {METRICS.map((metric) => (
            <ComparisonRow
              key={metric.key}
              metric={metric}
              institutions={comparison}
              onPress={(id) => navigation.navigate('InstitutionDetail', { institution_id: id })}
            />
          ))}
        </View>
      )}

      {!comparing && selectedIds.length < 2 && (
        <EmptyState title="Select at least 2 institutions" message="Tap institution chips above to compare" />
      )}
    </ScrollView>
  );
}

function ComparisonRow({
  metric,
  institutions,
  onPress,
}: {
  metric: Metric;
  institutions: FinanceComparisonItem[];
  onPress: (id: string) => void;
}) {
  const values = institutions.map((inst) => {
    const val = inst[metric.key];
    return typeof val === 'number' ? val : 0;
  });
  const maxVal = Math.max(...values, 1);

  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <Ionicons name={metric.icon as any} size={14} color={metric.color} />
        <Text style={styles.metricLabel}>{metric.label}</Text>
      </View>
      {institutions.map((inst, idx) => {
        const val = values[idx];
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        return (
          <TouchableOpacity
            key={inst.institution_id}
            style={styles.barRow}
            onPress={() => onPress(inst.institution_id)}
          >
            <Text style={styles.barLabel} numberOfLines={1}>
              {inst.ticker || inst.display_name}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: metric.color }]} />
            </View>
            <Text style={styles.barValue}>
              {formatMetricValue(val, metric.format)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function formatMetricValue(n: number, format: 'number' | 'money' | 'pct'): string {
  if (format === 'pct') {
    return n != null && n !== 0 ? (n * 100).toFixed(1) + '%' : '-';
  }
  const prefix = format === 'money' ? '$' : '';
  if (n >= 1e12) return prefix + (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return prefix + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return prefix + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return prefix + (n / 1e3).toFixed(0) + 'K';
  if (n === 0) return '-';
  return prefix + n.toLocaleString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  selectorCard: {
    backgroundColor: UI_COLORS.CARD_BG, margin: 16, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: UI_COLORS.SECONDARY_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  chipSelected: { backgroundColor: UI_COLORS.ACCENT, borderColor: UI_COLORS.ACCENT },
  chipText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  chipTextSelected: { color: '#fff' },
  selectorHint: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 10, textAlign: 'center' },
  resultsSection: { paddingHorizontal: 16, paddingBottom: 16 },
  metricCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  metricLabel: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  barRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  barLabel: { width: 48, fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  barTrack: {
    flex: 1, height: 18, backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 4, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4, minWidth: 2 },
  barValue: { width: 60, fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, textAlign: 'right' },
});
