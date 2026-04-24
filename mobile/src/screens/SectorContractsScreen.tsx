import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#10B981';
const log = (msg: string, err: unknown) => console.warn(`[SectorContractsScreen] ${msg}:`, err);

interface Contract {
  id: number;
  award_id?: string;
  award_amount: number | null;
  awarding_agency?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  contract_type?: string;
  entity_id?: string;
  entity_name?: string;
}

function fmtDollar(n?: number | null): string {
  if (n == null) return '-';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(s?: string): string {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
}

export default function SectorContractsScreen() {
  const route = useRoute<any>();
  const sector: string = route.params?.sector || 'tech';
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    try {
      const res = await apiClient.getAggregateContracts(sector, { limit: 500 });
      const sorted = [...(res.contracts || [])].sort(
        (a: Contract, b: Contract) => (b.award_amount || 0) - (a.award_amount || 0),
      );
      setContracts(sorted);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load contracts');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [sector]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    if (!search) return contracts;
    const q = search.toLowerCase();
    return contracts.filter((c) =>
      (c.entity_name || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.awarding_agency || '').toLowerCase().includes(q),
    );
  }, [contracts, search]);

  const totalValue = useMemo(
    () => filtered.reduce((sum, c) => sum + (c.award_amount || 0), 0),
    [filtered],
  );

  if (loading) return <LoadingSpinner message={`Loading ${sector} contracts...`} />;
  if (error) return <EmptyState title="Error" message={error} />;

  const sectorLabel = sector.charAt(0).toUpperCase() + sector.slice(1);

  const renderRow = ({ item: c }: { item: Contract }) => (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={[styles.amount, { color: ACCENT }]}>{fmtDollar(c.award_amount)}</Text>
        {c.contract_type && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{c.contract_type}</Text>
          </View>
        )}
      </View>
      {c.entity_name && <Text style={styles.entity}>{c.entity_name}</Text>}
      {c.awarding_agency && <Text style={styles.agency}>{c.awarding_agency}</Text>}
      {c.description && <Text style={styles.desc} numberOfLines={3}>{c.description}</Text>}
      <View style={styles.cardFoot}>
        {c.start_date && <Text style={styles.date}>Start: {fmtDate(c.start_date)}</Text>}
        {c.end_date && <Text style={styles.date}>End: {fmtDate(c.end_date)}</Text>}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#10B981', '#059669', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroInner}>
          <View style={styles.heroRow}>
            <Ionicons name="document-text" size={22} color="#FFFFFF" />
            <Text style={styles.heroTitle}>{sectorLabel} Contracts</Text>
          </View>
          <View style={styles.heroStats}>
            <Text style={styles.heroStat}>{filtered.length}</Text>
            <Text style={styles.heroStatLabel}>contracts</Text>
            <View style={styles.heroDivider} />
            <Text style={styles.heroStat}>{fmtDollar(totalValue)}</Text>
            <Text style={styles.heroStatLabel}>total</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={UI_COLORS.TEXT_MUTED} />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by entity, agency, or description..."
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

      <FlatList
        data={filtered}
        renderItem={renderRow}
        keyExtractor={(c) => String(c.id)}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No contracts match your filter" />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 18, margin: 16, borderRadius: 16, overflow: 'hidden' },
  heroInner: { },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroStat: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  heroDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 6 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, marginHorizontal: 16, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: UI_COLORS.TEXT_PRIMARY },
  card: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  amount: { fontSize: 18, fontWeight: '800' },
  typeBadge: { backgroundColor: UI_COLORS.SECONDARY_BG, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeText: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'uppercase' },
  entity: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginTop: 2 },
  agency: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY, marginTop: 2 },
  desc: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17, marginTop: 6 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  date: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
