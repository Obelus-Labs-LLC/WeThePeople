import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

const ACCENT = '#CA8A04';

type Metric = 'lobbying' | 'contracts';

interface StateRow {
  state_code: string;
  state_name?: string;
  total: number;
  count?: number;
}

function fmt$(n?: number | null): string {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function InfluenceMapScreen() {
  const navigation = useNavigation<any>();
  const [metric, setMetric] = useState<Metric>('lobbying');
  const [rows, setRows] = useState<StateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data: any = await apiClient.getSpendingByState({ metric, limit: 55 });
      // Null-safe shape coercion (see ClosedLoopScreen for the pattern).
      let raw: any[] = [];
      if (Array.isArray(data)) raw = data;
      else if (data && typeof data === 'object') raw = data.states || data.items || [];
      const parsed: StateRow[] = raw.map((r: any) => ({
        state_code: r.state_code || r.state,
        state_name: r.state_name,
        total: Number(r.total || r.amount || r.total_spend || r.total_amount || 0),
        count: r.count,
      }));
      parsed.sort((a, b) => b.total - a.total);
      setRows(parsed);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load state breakdown');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [metric]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const maxTotal = useMemo(() => rows.reduce((m, r) => Math.max(m, r.total), 0), [rows]);
  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);

  if (loading) return <LoadingSpinner message={`Loading ${metric} by state...`} />;
  if (error) return <EmptyState title="Error" message={error} />;

  const renderRow = ({ item: r, index }: { item: StateRow; index: number }) => {
    const pct = maxTotal > 0 ? (r.total / maxTotal) * 100 : 0;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('StateDashboard', { state_code: r.state_code })}
      >
        <Text style={styles.rank}>#{index + 1}</Text>
        <View style={styles.stateChip}>
          <Text style={styles.stateCode}>{r.state_code}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={styles.rowTop}>
            <Text style={styles.stateName} numberOfLines={1}>{r.state_name || r.state_code}</Text>
            <Text style={[styles.amount, { color: ACCENT }]}>{fmt$(r.total)}</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: ACCENT }]} />
          </View>
          {r.count != null && <Text style={styles.meta}>{r.count.toLocaleString()} filings</Text>}
        </View>
        <Ionicons name="chevron-forward" size={14} color={UI_COLORS.TEXT_MUTED} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[ACCENT, '#A16207', '#854D0E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="map" size={22} color="#FFFFFF" />
        <Text style={styles.heroTitle}>Spending by State</Text>
        <Text style={styles.heroSubtitle}>
          Total {metric} spend broken down by the state of the politician or contractor.
        </Text>
        <Text style={styles.heroTotal}>{fmt$(grandTotal)} total {'\u00B7'} {rows.length} states</Text>
      </LinearGradient>

      <View style={styles.metricRow}>
        {(['lobbying', 'contracts'] as Metric[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.metricChip, metric === m && { backgroundColor: ACCENT + '20', borderColor: ACCENT }]}
            onPress={() => { setLoading(true); setMetric(m); }}
          >
            <Text style={[styles.metricText, metric === m && { color: ACCENT }]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={(r) => r.state_code}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No state breakdown available" />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 20, paddingTop: 28, gap: 6 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 6 },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 17 },
  heroTotal: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '700', marginTop: 6 },
  metricRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  metricChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: UI_COLORS.BORDER, backgroundColor: UI_COLORS.CARD_BG },
  metricText: { fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  rank: { fontSize: 11, fontWeight: '800', color: UI_COLORS.TEXT_MUTED, width: 26 },
  stateChip: { backgroundColor: ACCENT + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  stateCode: { fontSize: 12, fontWeight: '800', color: ACCENT, letterSpacing: 0.5 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  stateName: { flex: 1, fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginRight: 8 },
  amount: { fontSize: 13, fontWeight: '800' },
  barTrack: { height: 4, backgroundColor: UI_COLORS.BORDER, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  meta: { fontSize: 10, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },
});
