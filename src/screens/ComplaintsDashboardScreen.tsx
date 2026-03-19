import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
} from 'react-native';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { CFPBComplaint, ComplaintSummary } from '../api/types';
import { LoadingSpinner, EmptyState, StatCard } from '../components/ui';
import { FilterPillGroup } from '../components/FilterPillGroup';

type ProductFilter = string;

const DEFAULT_PRODUCTS = [
  { key: 'all', label: 'All Products' },
  { key: 'Credit card', label: 'Credit Card' },
  { key: 'Mortgage', label: 'Mortgage' },
  { key: 'Student loan', label: 'Student Loan' },
  { key: 'Checking or savings account', label: 'Checking/Savings' },
  { key: 'Debt collection', label: 'Debt Collection' },
];

export default function ComplaintsDashboardScreen() {
  const [complaints, setComplaints] = useState<CFPBComplaint[]>([]);
  const [summary, setSummary] = useState<ComplaintSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');

  const loadData = async () => {
    const params: any = { limit: 200 };
    if (productFilter !== 'all') params.product = productFilter;
    const [complaintsRes, summaryRes] = await Promise.all([
      apiClient.getAllComplaints(params),
      apiClient.getGlobalComplaintSummary(),
    ]);
    setComplaints(complaintsRes.complaints || []);
    setSummary(summaryRes);
  };

  useEffect(() => {
    setLoading(true);
    loadData()
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [productFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadData(); } catch {}
    setRefreshing(false);
  };

  // Build product filter options from summary data
  const productOptions = useMemo(() => {
    if (!summary?.by_product) return DEFAULT_PRODUCTS;
    const tops = Object.entries(summary.by_product)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([key]) => ({ key, label: key.length > 16 ? key.substring(0, 14) + '...' : key }));
    return [{ key: 'all', label: 'All Products' }, ...tops];
  }, [summary]);

  if (loading) return <LoadingSpinner message="Loading complaints..." />;

  const renderComplaint = ({ item }: { item: CFPBComplaint }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.product} numberOfLines={1}>{item.product || 'Unknown'}</Text>
        {item.timely_response === 'Yes' ? (
          <View style={styles.timelyBadge}>
            <Text style={styles.timelyText}>Timely</Text>
          </View>
        ) : item.timely_response === 'No' ? (
          <View style={styles.lateBadge}>
            <Text style={styles.lateText}>Late</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.issue} numberOfLines={2}>{item.issue || 'No issue specified'}</Text>
      {item.sub_issue && (
        <Text style={styles.subIssue} numberOfLines={1}>{item.sub_issue}</Text>
      )}
      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>{item.date_received || '—'}</Text>
        {item.state && <Text style={styles.stateText}>{item.state}</Text>}
        {item.company_response && (
          <Text style={styles.responseText} numberOfLines={1}>{item.company_response}</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Summary stats */}
      {summary && (
        <View style={styles.statsGrid}>
          <StatCard label="Total Complaints" value={summary.total_complaints} accent="red" />
          <StatCard
            label="Timely Response"
            value={summary.timely_response_pct != null ? `${summary.timely_response_pct.toFixed(1)}%` : '—'}
            accent="green"
          />
        </View>
      )}

      {/* Product breakdown */}
      {summary?.by_product && (
        <View style={styles.breakdownSection}>
          <Text style={styles.breakdownTitle}>By Product</Text>
          <View style={styles.breakdownRow}>
            {Object.entries(summary.by_product)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 4)
              .map(([product, count]) => (
                <View key={product} style={styles.breakdownItem}>
                  <Text style={styles.breakdownCount}>{count.toLocaleString()}</Text>
                  <Text style={styles.breakdownLabel} numberOfLines={1}>{product}</Text>
                </View>
              ))}
          </View>
        </View>
      )}

      {/* Filter pills */}
      <View style={styles.filterRow}>
        <FilterPillGroup
          options={productOptions}
          selected={productFilter}
          onSelect={setProductFilter}
          scrollable
        />
      </View>

      <Text style={styles.countText}>
        Showing {complaints.length} complaints
      </Text>

      {error ? (
        <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
      ) : complaints.length === 0 ? (
        <EmptyState title="No complaints found" message="Try a different product filter." />
      ) : (
        <FlatList
          data={complaints}
          keyExtractor={(c) => c.id.toString()}
          renderItem={renderComplaint}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG, paddingHorizontal: 16, paddingTop: 12 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  breakdownSection: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, marginBottom: 12,
  },
  breakdownTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  breakdownRow: { flexDirection: 'row', gap: 8 },
  breakdownItem: { flex: 1, alignItems: 'center' },
  breakdownCount: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 16, fontWeight: '800' },
  breakdownLabel: { color: UI_COLORS.TEXT_MUTED, fontSize: 9, marginTop: 2, textAlign: 'center' },
  filterRow: { marginBottom: 8 },
  countText: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, marginBottom: 8 },
  listContent: { paddingBottom: 24 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  product: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 14, fontWeight: '700', flex: 1 },
  timelyBadge: { backgroundColor: '#10B98115', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  timelyText: { color: '#10B981', fontSize: 10, fontWeight: '700' },
  lateBadge: { backgroundColor: '#DC262615', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  lateText: { color: '#DC2626', fontSize: 10, fontWeight: '700' },
  issue: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 13, lineHeight: 18 },
  subIssue: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, marginTop: 2 },
  cardFooter: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' },
  dateText: { color: UI_COLORS.TEXT_MUTED, fontSize: 11 },
  stateText: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, fontWeight: '600' },
  responseText: { color: UI_COLORS.TEXT_MUTED, fontSize: 10, flex: 1, textAlign: 'right' },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14 },
});
