import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Image,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { Institution } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { SectorTypeBadge } from '../components/ui';

const SECTOR_COLORS: Record<string, string> = {
  bank: '#2563EB',
  investment: '#8B5CF6',
  insurance: '#F59E0B',
  fintech: '#10B981',
  central_bank: '#DC2626',
};

type SectorFilter = 'all' | 'bank' | 'investment' | 'insurance' | 'fintech' | 'central_bank';

const SECTOR_OPTIONS: { key: SectorFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bank', label: 'Banks' },
  { key: 'investment', label: 'Investment' },
  { key: 'central_bank', label: 'Central' },
];

export default function InstitutionsScreen() {
  const navigation = useNavigation<any>();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('all');

  const loadData = async () => {
    const res = await apiClient.getInstitutions({ limit: 200 });
    setInstitutions(res.institutions || []);
  };

  useEffect(() => {
    setLoading(true);
    loadData()
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadData(); } catch {}
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    let result = institutions;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) =>
        i.display_name.toLowerCase().includes(q) ||
        (i.ticker && i.ticker.toLowerCase().includes(q)) ||
        i.institution_id.toLowerCase().includes(q)
      );
    }
    if (sectorFilter !== 'all') {
      result = result.filter((i) => i.sector_type === sectorFilter);
    }
    return result;
  }, [institutions, search, sectorFilter]);

  if (loading) return <LoadingSpinner message="Loading institutions..." />;

  const renderInstitution = ({ item: inst }: { item: Institution }) => {
    const sColor = SECTOR_COLORS[inst.sector_type] || '#6B7280';
    return (
      <TouchableOpacity
        style={styles.instCard}
        onPress={() => navigation.navigate('InstitutionDetail', { institution_id: inst.institution_id })}
        activeOpacity={0.7}
      >
        <View style={styles.instRow}>
          {inst.logo_url ? (
            <Image source={{ uri: inst.logo_url }} style={styles.instLogo} />
          ) : (
            <View style={[styles.instIconWrap, { backgroundColor: sColor + '15' }]}>
              <Text style={[styles.instIconText, { color: sColor }]}>
                {inst.ticker ? inst.ticker.substring(0, 2) : inst.display_name.charAt(0)}
              </Text>
            </View>
          )}
          <View style={styles.instInfo}>
            <Text style={styles.instName}>{inst.display_name}</Text>
            <View style={styles.badgeRow}>
              {inst.ticker && <Text style={styles.instTicker}>{inst.ticker}</Text>}
              <SectorTypeBadge sectorType={inst.sector_type} />
            </View>
            <Text style={styles.instStats}>
              {inst.filing_count} filings · {inst.complaint_count} complaints
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={UI_COLORS.TEXT_MUTED} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={16} color={UI_COLORS.TEXT_MUTED} />
          <TextInput
            style={styles.searchText}
            placeholder="Search by name or ticker..."
            placeholderTextColor={UI_COLORS.TEXT_MUTED}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {SECTOR_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterBtn, sectorFilter === opt.key && styles.filterBtnActive]}
            onPress={() => setSectorFilter(opt.key)}
          >
            <Text style={[styles.filterBtnText, sectorFilter === opt.key && styles.filterBtnTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.countText}>
        Showing {filtered.length} of {institutions.length}
      </Text>

      {error ? (
        <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
      ) : filtered.length === 0 ? (
        <EmptyState title="No institutions found" message="Try adjusting your search or filters." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.institution_id}
          renderItem={renderInstitution}
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
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG, paddingHorizontal: 16 },
  searchRow: { marginTop: 12, marginBottom: 10 },
  searchInput: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  searchText: { flex: 1, color: UI_COLORS.TEXT_PRIMARY, fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  filterBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: UI_COLORS.CARD_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  filterBtnActive: { backgroundColor: UI_COLORS.ACCENT, borderColor: UI_COLORS.ACCENT },
  filterBtnText: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  filterBtnTextActive: { color: '#FFFFFF' },
  countText: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, marginBottom: 8 },
  listContent: { paddingBottom: 24 },
  instCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  instLogo: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F0F2EF' },
  instIconWrap: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  instIconText: { fontSize: 14, fontWeight: '800' },
  instInfo: { flex: 1, gap: 2 },
  instName: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 15, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  instTicker: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, fontWeight: '700' },
  instStats: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, marginTop: 2 },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14 },
});
