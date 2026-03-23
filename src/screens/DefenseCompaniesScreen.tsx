import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { DefenseCompany } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';

const SECTOR_COLORS: Record<string, string> = {
  defense_prime: '#DC2626',
  defense_sub: '#F59E0B',
  aerospace_defense: '#3B82F6',
  cybersecurity: '#8B5CF6',
  shipbuilding: '#06B6D4',
  munitions: '#EF4444',
  intelligence: '#10B981',
  logistics_defense: '#F97316',
};

type SectorFilter = 'all' | string;

const SECTOR_OPTIONS: { key: SectorFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'defense_prime', label: 'Prime' },
  { key: 'defense_sub', label: 'Sub' },
  { key: 'aerospace_defense', label: 'Aerospace' },
  { key: 'cybersecurity', label: 'Cyber' },
  { key: 'shipbuilding', label: 'Ship' },
  { key: 'munitions', label: 'Munitions' },
  { key: 'intelligence', label: 'Intel' },
  { key: 'logistics_defense', label: 'Logistics' },
];

const ACCENT = '#DC2626';

export default function DefenseCompaniesScreen() {
  const navigation = useNavigation<any>();
  const [companies, setCompanies] = useState<DefenseCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('all');

  const loadData = async () => {
    try {
      const res = await apiClient.getDefenseCompanies({ limit: 200 });
      setCompanies(res.companies || []);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    let list = companies;
    if (sectorFilter !== 'all') list = list.filter(c => c.sector_type === sectorFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.display_name.toLowerCase().includes(q) || (c.ticker && c.ticker.toLowerCase().includes(q)));
    }
    return list;
  }, [companies, sectorFilter, search]);

  if (loading) return <LoadingSpinner message="Loading defense companies..." />;

  const renderCompany = ({ item: c }: { item: DefenseCompany }) => (
    <TouchableOpacity style={styles.card}
      onPress={() => navigation.navigate('DefenseCompanyDetail', { company_id: c.company_id })}>
      <View style={[styles.iconWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '15' }]}>
        <Ionicons name="shield" size={20} color={SECTOR_COLORS[c.sector_type] || '#6B7280'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{c.display_name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {c.ticker && <Text style={styles.ticker}>{c.ticker}</Text>}
          <Text style={[styles.badge, { color: SECTOR_COLORS[c.sector_type] || '#6B7280' }]}>{c.sector_type.replace(/_/g, ' ')}</Text>
        </View>
        <Text style={styles.stats}>{c.contract_count} contracts · {c.lobbying_count} lobbying · {c.enforcement_count} enforcement</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={UI_COLORS.TEXT_MUTED} />
        <TextInput style={styles.searchInput} placeholder="Search companies..." placeholderTextColor={UI_COLORS.TEXT_MUTED}
          value={search} onChangeText={setSearch} />
      </View>
      <FlatList
        horizontal
        data={SECTOR_OPTIONS}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.filterPill, sectorFilter === item.key && { backgroundColor: ACCENT + '20', borderColor: ACCENT }]}
            onPress={() => setSectorFilter(sectorFilter === item.key ? 'all' : item.key)}>
            <Text style={[styles.filterText, sectorFilter === item.key && { color: ACCENT }]}>{item.label}</Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      />
      <FlatList
        data={filtered}
        renderItem={renderCompany}
        keyExtractor={(item) => item.company_id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={ACCENT} />}
        ListEmptyComponent={<EmptyState title="No companies found" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, marginBottom: 8, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER },
  searchInput: { flex: 1, height: 44, color: UI_COLORS.TEXT_PRIMARY, fontSize: 15, marginLeft: 8 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: UI_COLORS.BORDER, backgroundColor: UI_COLORS.CARD_BG },
  filterText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  name: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  ticker: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  badge: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  stats: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },
});
