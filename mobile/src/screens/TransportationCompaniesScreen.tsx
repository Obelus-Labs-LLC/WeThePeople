import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { API_BASE } from '../api/client';

const SECTOR_COLORS: Record<string, string> = {
  automotive: '#0EA5E9',
  airline: '#8B5CF6',
  logistics: '#F59E0B',
  rail: '#10B981',
  maritime: '#EC4899',
};

export default function TransportationCompaniesScreen() {
  const navigation = useNavigation<any>();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/transportation/companies?limit=200`)
      .then(r => r.json())
      .then((res) => { setCompanies(res.companies || []); })
      .catch((e: any) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter((c: any) =>
      c.display_name.toLowerCase().includes(q) ||
      (c.ticker && c.ticker.toLowerCase().includes(q)) ||
      c.company_id.toLowerCase().includes(q)
    );
  }, [companies, search]);

  if (loading) return <LoadingSpinner message="Loading companies..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  const renderCompany = ({ item: c }: { item: any }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('TransportationCompanyDetail', { company_id: c.company_id })}
    >
      <View style={[styles.iconWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '15' }]}>
        <Ionicons name="car-sport" size={20} color={SECTOR_COLORS[c.sector_type] || '#6B7280'} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{c.display_name}</Text>
        <View style={styles.meta}>
          {c.ticker && <Text style={styles.ticker}>{c.ticker}</Text>}
          <View style={[styles.badge, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '12', borderColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '25' }]}>
            <Text style={[styles.badgeText, { color: SECTOR_COLORS[c.sector_type] || '#6B7280' }]}>{c.sector_type}</Text>
          </View>
          {c.headquarters && <Text style={styles.hq}>{c.headquarters}</Text>}
        </View>
        <Text style={styles.stats}>
          {c.contract_count || 0} contracts {'\u00B7'} {c.filing_count || 0} filings
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
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

      <Text style={styles.countText}>Showing {filtered.length} of {companies.length}</Text>

      <FlatList
        data={filtered}
        renderItem={renderCompany}
        keyExtractor={(c) => c.company_id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState title="No companies found" />}
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
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },
  ticker: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  hq: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  stats: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },
});
