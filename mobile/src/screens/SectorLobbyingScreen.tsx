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
const ACCENT = '#F59E0B';
const log = (msg: string, err: unknown) => console.warn(`[SectorLobbyingScreen] ${msg}:`, err);

interface LobbyingFiling {
  id: number;
  filing_uuid?: string;
  filing_year: number;
  filing_period?: string;
  income?: number | null;
  expenses?: number | null;
  registrant_name?: string;
  client_name?: string;
  lobbying_issues?: string;
  entity_id?: string;
  entity_name?: string;
}

function fmtDollar(n?: number | null): string {
  if (n == null || n === 0) return '-';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function filingSpend(f: LobbyingFiling): number {
  return (f.income || 0) + (f.expenses || 0);
}

export default function SectorLobbyingScreen() {
  const route = useRoute<any>();
  const sector: string = route.params?.sector || 'tech';
  const [filings, setFilings] = useState<LobbyingFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.getAggregateLobbying(sector, { limit: 500 });
      const sorted = [...(res.filings || [])].sort(
        (a: LobbyingFiling, b: LobbyingFiling) => filingSpend(b) - filingSpend(a),
      );
      setFilings(sorted);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load lobbying filings');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [sector]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const years = useMemo(() => {
    const set = new Set<number>();
    filings.forEach((f) => { if (f.filing_year) set.add(f.filing_year); });
    return Array.from(set).sort((a, b) => b - a);
  }, [filings]);

  const filtered = useMemo(() => {
    let out = filings;
    if (yearFilter) out = out.filter((f) => f.filing_year === yearFilter);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((f) =>
        (f.entity_name || '').toLowerCase().includes(q) ||
        (f.registrant_name || '').toLowerCase().includes(q) ||
        (f.client_name || '').toLowerCase().includes(q) ||
        (f.lobbying_issues || '').toLowerCase().includes(q),
      );
    }
    return out;
  }, [filings, yearFilter, search]);

  const totalSpend = useMemo(
    () => filtered.reduce((sum, f) => sum + filingSpend(f), 0),
    [filtered],
  );

  if (loading) return <LoadingSpinner message={`Loading ${sector} lobbying...`} />;
  if (error) return <EmptyState title="Error" message={error} />;

  const sectorLabel = sector.charAt(0).toUpperCase() + sector.slice(1);

  const renderRow = ({ item: f }: { item: LobbyingFiling }) => (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.yearBadge}>
          <Text style={styles.yearText}>{f.filing_year}{f.filing_period ? ` ${f.filing_period}` : ''}</Text>
        </View>
        <Text style={[styles.amount, { color: ACCENT }]}>{fmtDollar(filingSpend(f))}</Text>
      </View>
      {f.entity_name && <Text style={styles.entity}>{f.entity_name}</Text>}
      {f.registrant_name && <Text style={styles.firm}>{f.registrant_name}</Text>}
      {f.lobbying_issues && (
        <Text style={styles.issues} numberOfLines={3}>
          <Text style={styles.issuesLabel}>Issues: </Text>{f.lobbying_issues}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F59E0B', '#D97706', '#92400E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <Ionicons name="megaphone" size={22} color="#FFFFFF" />
          <Text style={styles.heroTitle}>{sectorLabel} Lobbying</Text>
        </View>
        <View style={styles.heroStats}>
          <Text style={styles.heroStat}>{filtered.length}</Text>
          <Text style={styles.heroStatLabel}>filings</Text>
          <View style={styles.heroDivider} />
          <Text style={styles.heroStat}>{fmtDollar(totalSpend)}</Text>
          <Text style={styles.heroStatLabel}>total spend</Text>
        </View>
      </LinearGradient>

      <View style={styles.controls}>
        {years.length > 0 && (
          <ScrollYearRow
            years={years}
            selected={yearFilter}
            onSelect={setYearFilter}
          />
        )}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={UI_COLORS.TEXT_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder="Filter by entity, firm, or issue..."
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
      </View>

      <FlatList
        data={filtered}
        renderItem={renderRow}
        keyExtractor={(f) => String(f.id)}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No lobbying filings match" />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      />
    </View>
  );
}

interface ScrollYearRowProps {
  years: number[];
  selected: number | null;
  onSelect: (y: number | null) => void;
}

function ScrollYearRow({ years, selected, onSelect }: ScrollYearRowProps) {
  return (
    <View style={styles.yearRow}>
      <TouchableOpacity
        style={[styles.yearChip, !selected && styles.yearChipActive]}
        onPress={() => onSelect(null)}
      >
        <Text style={[styles.yearChipText, !selected && styles.yearChipTextActive]}>All</Text>
      </TouchableOpacity>
      {years.slice(0, 6).map((y) => (
        <TouchableOpacity
          key={y}
          style={[styles.yearChip, selected === y && styles.yearChipActive]}
          onPress={() => onSelect(y)}
        >
          <Text style={[styles.yearChipText, selected === y && styles.yearChipTextActive]}>{y}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 18, margin: 16, borderRadius: 16, overflow: 'hidden' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroStat: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  heroDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 6 },
  controls: { paddingHorizontal: 16, gap: 10 },
  yearRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  yearChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER, backgroundColor: UI_COLORS.CARD_BG },
  yearChipActive: { backgroundColor: ACCENT + '20', borderColor: ACCENT + '50' },
  yearChipText: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY },
  yearChipTextActive: { color: ACCENT },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: UI_COLORS.TEXT_PRIMARY },
  card: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  yearBadge: { backgroundColor: ACCENT + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  yearText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  amount: { fontSize: 17, fontWeight: '800' },
  entity: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginTop: 2 },
  firm: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY, marginTop: 2 },
  issues: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17, marginTop: 6 },
  issuesLabel: { fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
});
