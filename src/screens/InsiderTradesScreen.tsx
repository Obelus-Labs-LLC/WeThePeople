import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Linking,
  StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { InsiderTrade } from '../api/types';
import { LoadingSpinner, EmptyState, StatCard } from '../components/ui';
import { FilterPillGroup } from '../components/FilterPillGroup';
import SearchBar from '../components/SearchBar';

type TypeFilter = 'all' | 'P' | 'S' | 'A';

const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All Types' },
  { key: 'P', label: 'Purchase' },
  { key: 'S', label: 'Sale' },
  { key: 'A', label: 'Award' },
];

const TYPE_COLORS: Record<string, string> = {
  P: '#10B981',
  S: '#DC2626',
  A: '#2563EB',
};

const TYPE_LABELS: Record<string, string> = {
  P: 'Purchase',
  S: 'Sale',
  A: 'Award',
};

function formatCurrency(val: number | null): string {
  if (val == null) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function formatNumber(val: number | null): string {
  if (val == null) return '—';
  return val.toLocaleString();
}

export default function InsiderTradesScreen() {
  const [trades, setTrades] = useState<InsiderTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const loadData = async () => {
    const params: any = { limit: 200 };
    if (typeFilter !== 'all') params.transaction_type = typeFilter;
    const res = await apiClient.getAllInsiderTrades(params);
    setTrades(res.trades || []);
  };

  useEffect(() => {
    setLoading(true);
    loadData()
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [typeFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadData(); } catch {}
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    if (!search) return trades;
    const q = search.toLowerCase();
    return trades.filter((t) =>
      t.filer_name?.toLowerCase().includes(q) ||
      t.filer_title?.toLowerCase().includes(q)
    );
  }, [trades, search]);

  const stats = useMemo(() => {
    const purchases = trades.filter((t) => t.transaction_type === 'P').length;
    const sales = trades.filter((t) => t.transaction_type === 'S').length;
    const totalValue = trades.reduce((sum, t) => sum + (t.total_value || 0), 0);
    return { total: trades.length, purchases, sales, totalValue };
  }, [trades]);

  if (loading) return <LoadingSpinner message="Loading insider trades..." />;

  const renderTrade = ({ item }: { item: InsiderTrade }) => {
    const typeCode = item.transaction_type || '?';
    const color = TYPE_COLORS[typeCode] || '#6B7280';
    const label = TYPE_LABELS[typeCode] || typeCode;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={item.filing_url ? 0.7 : 1}
        onPress={() => item.filing_url && Linking.openURL(item.filing_url)}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.filerName} numberOfLines={1}>{item.filer_name}</Text>
            {item.filer_title && (
              <Text style={styles.filerTitle} numberOfLines={1}>{item.filer_title}</Text>
            )}
          </View>
          <View style={[styles.typeBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
            <Text style={[styles.typeBadgeText, { color }]}>{label}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Shares</Text>
            <Text style={styles.detailValue}>{formatNumber(item.shares)}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Price</Text>
            <Text style={styles.detailValue}>{formatCurrency(item.price_per_share)}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Total Value</Text>
            <Text style={[styles.detailValue, { color }]}>{formatCurrency(item.total_value)}</Text>
          </View>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.dateText}>
            {item.transaction_date || 'Unknown date'}
          </Text>
          {item.filing_url && (
            <View style={styles.secLink}>
              <Text style={styles.secLinkText}>SEC Filing</Text>
              <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search by filer name..."
      />

      <View style={styles.filterRow}>
        <FilterPillGroup options={TYPE_OPTIONS} selected={typeFilter} onSelect={setTypeFilter} scrollable />
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Total" value={stats.total} accent="green" />
        <StatCard label="Total Value" value={formatCurrency(stats.totalValue)} accent="blue" />
      </View>

      <Text style={styles.countText}>
        Showing {filtered.length} of {trades.length}
      </Text>

      {error ? (
        <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
      ) : filtered.length === 0 ? (
        <EmptyState title="No insider trades found" message="Try adjusting your search or filters." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id.toString()}
          renderItem={renderTrade}
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
  filterRow: { marginVertical: 8 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  countText: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, marginBottom: 8 },
  listContent: { paddingBottom: 24 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  filerName: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 15, fontWeight: '700' },
  filerTitle: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, marginTop: 1 },
  typeBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  detailRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  detailItem: { flex: 1 },
  detailLabel: { color: UI_COLORS.TEXT_MUTED, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 14, fontWeight: '700', marginTop: 2 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { color: UI_COLORS.TEXT_MUTED, fontSize: 11 },
  secLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  secLinkText: { color: UI_COLORS.ACCENT, fontSize: 11, fontWeight: '600' },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14 },
});
