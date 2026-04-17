import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { TechCompany, TechComparisonItem } from '../api/types';
import { LoadingSpinner, EmptyState, InlineError } from '../components/ui';

type Metric = {
  key: keyof TechComparisonItem;
  label: string;
  format: 'number' | 'money' | 'pct';
  icon: string;
  color: string;
};

const METRICS: Metric[] = [
  { key: 'market_cap', label: 'Market Cap', format: 'money', icon: 'trending-up', color: '#2563EB' },
  { key: 'patent_count', label: 'Patents', format: 'number', icon: 'bulb-outline', color: '#F59E0B' },
  { key: 'total_contract_value', label: 'Gov Contracts', format: 'money', icon: 'cash-outline', color: '#10B981' },
  { key: 'lobbying_total', label: 'Lobbying Spend', format: 'money', icon: 'megaphone-outline', color: '#F59E0B' },
  { key: 'total_penalties', label: 'Total Penalties', format: 'money', icon: 'shield-outline', color: '#DC2626' },
  { key: 'enforcement_count', label: 'Enforcement Actions', format: 'number', icon: 'alert-circle-outline', color: '#DC2626' },
  { key: 'filing_count', label: 'SEC Filings', format: 'number', icon: 'document-outline', color: '#8B5CF6' },
  { key: 'profit_margin', label: 'Profit Margin', format: 'pct', icon: 'analytics-outline', color: '#10B981' },
];

export default function TechCompareScreen() {
  const navigation = useNavigation<any>();
  const [allCompanies, setAllCompanies] = useState<TechCompany[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<TechComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState('');
  const [compareError, setCompareError] = useState('');

  const loadList = React.useCallback(() => {
    setLoading(true);
    setListError('');
    apiClient.getTechCompanies({ limit: 50 })
      .then((res) => {
        setAllCompanies(res.companies || []);
        // Default: select top 5 (only on first load)
        setSelectedIds((prev) =>
          prev.length === 0
            ? (res.companies || []).slice(0, 5).map((c) => c.company_id)
            : prev
        );
      })
      .catch((e: any) => setListError(e?.message || 'Failed to load companies'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // Load comparison when selection changes
  const loadComparison = React.useCallback(() => {
    if (selectedIds.length < 2) {
      setComparison([]);
      return;
    }
    setComparing(true);
    setCompareError('');
    apiClient.getTechComparison(selectedIds)
      .then((res) => setComparison(res.companies || []))
      .catch((e: any) => setCompareError(e?.message || 'Failed to load comparison'))
      .finally(() => setComparing(false));
  }, [selectedIds]);

  useEffect(() => { loadComparison(); }, [loadComparison]);

  const toggleCompany = (id: string) => {
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
    setListError('');
    apiClient.getTechCompanies({ limit: 50 })
      .then((res) => setAllCompanies(res.companies || []))
      .catch((e: any) => setListError(e?.message || 'Failed to refresh'))
      .finally(() => setRefreshing(false));
  };

  if (loading) return <LoadingSpinner message="Loading companies..." />;
  if (listError) return <InlineError message={listError} onRetry={loadList} />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Company selector */}
      <View style={styles.selectorCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="git-compare-outline" size={16} color={UI_COLORS.ACCENT} />
          <Text style={styles.cardTitle}>Select Companies to Compare</Text>
        </View>
        <View style={styles.chipGrid}>
          {allCompanies.map((co) => {
            const selected = selectedIds.includes(co.company_id);
            return (
              <TouchableOpacity
                key={co.company_id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => toggleCompany(co.company_id)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {co.ticker || co.display_name}
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

      {/* Comparison results */}
      {comparing && <LoadingSpinner message="Comparing..." />}

      {!comparing && compareError ? (
        <InlineError message={compareError} onRetry={loadComparison} />
      ) : null}

      {!comparing && !compareError && comparison.length >= 2 && (
        <View style={styles.resultsSection}>
          {METRICS.map((metric) => (
            <ComparisonRow
              key={metric.key}
              metric={metric}
              companies={comparison}
              onCompanyPress={(id) => navigation.navigate('TechCompanyDetail', { company_id: id })}
            />
          ))}
        </View>
      )}

      {!comparing && selectedIds.length < 2 && (
        <EmptyState title="Select at least 2 companies" message="Tap company chips above to compare" />
      )}
    </ScrollView>
  );
}

function ComparisonRow({
  metric,
  companies,
  onCompanyPress,
}: {
  metric: Metric;
  companies: TechComparisonItem[];
  onCompanyPress: (id: string) => void;
}) {
  const values = companies.map((c) => {
    const val = c[metric.key];
    return typeof val === 'number' ? val : 0;
  });
  const maxVal = Math.max(...values, 1);

  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <Ionicons name={metric.icon as any} size={14} color={metric.color} />
        <Text style={styles.metricLabel}>{metric.label}</Text>
      </View>
      {companies.map((co, idx) => {
        const val = values[idx];
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        return (
          <TouchableOpacity
            key={co.company_id}
            style={styles.barRow}
            onPress={() => onCompanyPress(co.company_id)}
          >
            <Text style={styles.barLabel} numberOfLines={1}>
              {co.ticker || co.display_name}
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
    return n != null ? (n * 100).toFixed(1) + '%' : '-';
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

  // Selector
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

  // Results
  resultsSection: { paddingHorizontal: 16, paddingBottom: 16 },

  // Metric card
  metricCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  metricLabel: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },

  // Bar row
  barRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  barLabel: { width: 48, fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  barTrack: {
    flex: 1, height: 18, backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 4, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4, minWidth: 2 },
  barValue: { width: 60, fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, textAlign: 'right' },
});
