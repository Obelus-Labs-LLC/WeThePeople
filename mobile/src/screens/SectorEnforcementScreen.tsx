import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, RefreshControl, Linking,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#DC2626';
const log = (msg: string, err: unknown) => console.warn(`[SectorEnforcementScreen] ${msg}:`, err);

interface EnforcementAction {
  id: number;
  case_title?: string;
  description?: string;
  penalty_amount: number | null;
  case_date?: string;
  case_url?: string;
  entity_id?: string;
  entity_name?: string;
  agency?: string;
}

function fmtDollar(n?: number | null): string {
  if (n == null || n === 0) return '-';
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

type Severity = 'all' | 'high' | 'medium' | 'low';

function severityOf(n?: number | null): Exclude<Severity, 'all'> {
  if (!n) return 'low';
  if (n >= 1e9) return 'high';
  if (n >= 1e8) return 'medium';
  return 'low';
}

const SEVERITY_COLORS: Record<Exclude<Severity, 'all'>, string> = {
  high: '#DC2626',
  medium: '#F59E0B',
  low: '#10B981',
};

export default function SectorEnforcementScreen() {
  const route = useRoute<any>();
  const sector: string = route.params?.sector || 'tech';
  const [actions, setActions] = useState<EnforcementAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sev, setSev] = useState<Severity>('all');

  const load = async () => {
    try {
      const res = await apiClient.getAggregateEnforcement(sector, { limit: 500 });
      const sorted = [...(res.actions || [])].sort(
        (a: EnforcementAction, b: EnforcementAction) => (b.penalty_amount || 0) - (a.penalty_amount || 0),
      );
      setActions(sorted);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load enforcement actions');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [sector]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    let out = actions;
    if (sev !== 'all') out = out.filter((a) => severityOf(a.penalty_amount) === sev);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((a) =>
        (a.entity_name || '').toLowerCase().includes(q) ||
        (a.case_title || '').toLowerCase().includes(q) ||
        (a.agency || '').toLowerCase().includes(q),
      );
    }
    return out;
  }, [actions, sev, search]);

  const totalPenalties = useMemo(
    () => filtered.reduce((sum, a) => sum + (a.penalty_amount || 0), 0),
    [filtered],
  );

  if (loading) return <LoadingSpinner message={`Loading ${sector} enforcement...`} />;
  if (error) return <EmptyState title="Error" message={error} />;

  const sectorLabel = sector.charAt(0).toUpperCase() + sector.slice(1);

  const renderRow = ({ item: a }: { item: EnforcementAction }) => {
    const s = severityOf(a.penalty_amount);
    const color = SEVERITY_COLORS[s];
    return (
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}
        onPress={() => a.case_url && Linking.openURL(a.case_url).catch((e) => log('open case', e))}
        disabled={!a.case_url}
      >
        <View style={styles.cardHead}>
          <View style={[styles.sevBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.sevText, { color }]}>{s.toUpperCase()}</Text>
          </View>
          {a.penalty_amount != null && a.penalty_amount > 0 && (
            <Text style={[styles.penalty, { color }]}>{fmtDollar(a.penalty_amount)}</Text>
          )}
        </View>
        {a.entity_name && <Text style={styles.entity}>{a.entity_name}</Text>}
        {a.case_title && <Text style={styles.caseTitle} numberOfLines={2}>{a.case_title}</Text>}
        {a.description && <Text style={styles.desc} numberOfLines={3}>{a.description}</Text>}
        <View style={styles.cardFoot}>
          {a.agency && <Text style={styles.date}>{a.agency}</Text>}
          {a.case_date && <Text style={styles.date}>{fmtDate(a.case_date)}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#DC2626', '#B91C1C', '#7F1D1D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <Ionicons name="shield" size={22} color="#FFFFFF" />
          <Text style={styles.heroTitle}>{sectorLabel} Enforcement</Text>
        </View>
        <View style={styles.heroStats}>
          <Text style={styles.heroStat}>{filtered.length}</Text>
          <Text style={styles.heroStatLabel}>actions</Text>
          <View style={styles.heroDivider} />
          <Text style={styles.heroStat}>{fmtDollar(totalPenalties)}</Text>
          <Text style={styles.heroStatLabel}>penalties</Text>
        </View>
      </LinearGradient>

      <View style={styles.controls}>
        <View style={styles.filterRow}>
          {(['all', 'high', 'medium', 'low'] as Severity[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, sev === s && styles.filterChipActive]}
              onPress={() => setSev(s)}
            >
              <Text style={[styles.filterText, sev === s && styles.filterTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={UI_COLORS.TEXT_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder="Filter by entity, case, or agency..."
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
        keyExtractor={(a) => String(a.id)}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No enforcement actions match" />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      />
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
  filterRow: { flexDirection: 'row', gap: 6 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER, backgroundColor: UI_COLORS.CARD_BG },
  filterChipActive: { backgroundColor: ACCENT + '20', borderColor: ACCENT + '50' },
  filterText: { fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'uppercase' },
  filterTextActive: { color: ACCENT },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: UI_COLORS.TEXT_PRIMARY },
  card: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sevBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sevText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  penalty: { fontSize: 17, fontWeight: '800' },
  entity: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginTop: 2 },
  caseTitle: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY, marginTop: 4 },
  desc: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17, marginTop: 6 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  date: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
