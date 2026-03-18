import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { EnergyCompany } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';

const SECTOR_COLORS: Record<string, string> = {
  oil_gas: '#475569',
  utility: '#2563EB',
  renewable: '#10B981',
  pipeline: '#F59E0B',
  services: '#8B5CF6',
};

type SectorFilter = 'all' | 'oil_gas' | 'utility' | 'renewable' | 'pipeline' | 'services';

const SECTOR_OPTIONS: { key: SectorFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'oil_gas', label: 'Oil & Gas' },
  { key: 'utility', label: 'Utility' },
  { key: 'renewable', label: 'Renewable' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'services', label: 'Services' },
];

export default function EnergyCompaniesScreen() {
  const navigation = useNavigation<any>();
  const [companies, setCompanies] = useState<EnergyCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('all');

  const loadData = async () => {
    const res = await apiClient.getEnergyCompanies({ limit: 200 });
    setCompanies(res.companies || []);
  };

  useEffect(() => {
    loadData()
      .catch((e: any) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadData(); } catch {}
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    let result = companies;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.display_name.toLowerCase().includes(q) ||
        (c.ticker && c.ticker.toLowerCase().includes(q)) ||
        c.company_id.toLowerCase().includes(q)
      );
    }
    if (sectorFilter !== 'all') {
      result = result.filter(c => c.sector_type === sectorFilter);
    }
    return result;
  }, [companies, search, sectorFilter]);

  if (loading) return <LoadingSpinner message="Loading companies..." />;
  if (error) return <EmptyState title="Error" message={error} onRetry={() => { setLoading(true); setError(''); loadData().catch((e: any) => setError(e.message)).finally(() => setLoading(false)); }} />;

  const renderCompany = ({ item: c }: { item: EnergyCompany }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('EnergyCompanyDetail', { company_id: c.company_id })}
      accessibilityRole="button"
      accessibilityLabel={`View ${c.display_name}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '15' }]}>
        <Ionicons name="flame" size={20} color={SECTOR_COLORS[c.sector_type] || '#6B7280'} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{c.display_name}</Text>
        <View style={styles.meta}>
          {c.ticker && <Text style={styles.ticker}>{c.ticker}</Text>}
          <View style={[styles.badge, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '12', borderColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '25' }]}>
            <Text style={[styles.badgeText, { color: SECTOR_COLORS[c.sector_type] || '#6B7280' }]}>{c.sector_type.replace('_', ' ')}</Text>
          </View>
          {c.headquarters && <Text style={styles.hq}>{c.headquarters}</Text>}
        </View>
        <Text style={styles.stats}>
          {c.emission_count} emissions {'\u00B7'} {c.contract_count} contracts {'\u00B7'} {c.filing_count} filings
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={UI_COLORS.TEXT_MUTED} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search companies..."
          placeholderTextColor={UI_COLORS.TEXT_MUTED}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={UI_COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sector filter */}
      <View style={styles.filterRow}>
        {SECTOR_OPTIONS.map(opt => {
          const active = sectorFilter === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
              onPress={() => setSectorFilter(opt.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterBtnText, active && styles.filterBtnTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Count */}
      <Text style={styles.countText}>Showing {filtered.length} of {companies.length}</Text>

      {/* List */}
      <FlatList
        data={filtered}
        renderItem={renderCompany}
        keyExtractor={(c) => c.company_id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState title="No companies found" />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    paddingHorizontal: 12, height: 40,
    borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: UI_COLORS.TEXT_PRIMARY },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8, gap: 6, flexWrap: 'wrap' },
  filterBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: UI_COLORS.CARD_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  filterBtnActive: { backgroundColor: '#475569', borderColor: '#475569' },
  filterBtnText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  filterBtnTextActive: { color: '#FFFFFF' },
  countText: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, paddingHorizontal: 16, marginBottom: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6, flexWrap: 'wrap' },
  ticker: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  hq: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  stats: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },
});
