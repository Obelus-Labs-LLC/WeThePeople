import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

const ACCENT = '#3B82F6';

interface Flow {
  source_name?: string;
  source_type?: string;
  target_name?: string;
  target_type?: string;
  amount?: number;
  year?: number | string;
  count?: number;
}

function fmt$(n?: number | null): string {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function MoneyFlowScreen() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      // Backend returns Sankey format: { nodes: [{name, group}], links: [{source, target, value}] }
      // where source/target are indices into nodes. Resolve to named flows so the
      // mobile UI can show "Company A -> Politician B".
      const data = await apiClient.getMoneyFlow({ limit: 50 });
      const nodes: Array<{ name: string; group: string }> = data.nodes || [];
      const links: Array<{ source: number; target: number; value: number }> = data.links || [];
      const parsed: Flow[] = links
        .map((l) => {
          const src = nodes[l.source];
          const tgt = nodes[l.target];
          return {
            source_name: src?.name,
            source_type: src?.group,
            target_name: tgt?.name,
            target_type: tgt?.group,
            amount: Number(l.value || 0),
          };
        })
        .filter((f) => f.source_name && f.target_name)
        .sort((a, b) => (b.amount || 0) - (a.amount || 0));
      setFlows(parsed);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load money flow');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const grandTotal = useMemo(() => flows.reduce((s, f) => s + (f.amount || 0), 0), [flows]);

  if (loading) return <LoadingSpinner message="Loading money flow..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  const renderRow = ({ item: f }: { item: Flow }) => (
    <View style={styles.card}>
      <View style={styles.pair}>
        <View style={styles.side}>
          <Ionicons name="business" size={14} color="#10B981" />
          <Text style={styles.sideText} numberOfLines={2}>{f.source_name || 'Unknown'}</Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={UI_COLORS.TEXT_MUTED} style={{ marginHorizontal: 4 }} />
        <View style={styles.side}>
          <Ionicons name="person" size={14} color="#F59E0B" />
          <Text style={styles.sideText} numberOfLines={2}>{f.target_name || 'Unknown'}</Text>
        </View>
      </View>
      <View style={styles.amountRow}>
        <Text style={[styles.amount, { color: ACCENT }]}>{fmt$(f.amount)}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {f.year != null && <Text style={styles.meta}>{f.year}</Text>}
          {f.count != null && <Text style={styles.meta}>{f.count} txn</Text>}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={[ACCENT, '#1D4ED8', '#1E3A8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="cash" size={22} color="#FFFFFF" />
        <Text style={styles.heroTitle}>Money Flow</Text>
        <Text style={styles.heroSubtitle}>
          Donations from companies and PACs to politicians, ranked by dollar amount.
        </Text>
        <Text style={styles.heroTotal}>{fmt$(grandTotal)} tracked across {flows.length} flows</Text>
      </LinearGradient>

      <FlatList
        data={flows}
        renderItem={renderRow}
        keyExtractor={(f, i) => `${f.source_name}-${f.target_name}-${i}`}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No money flow data" />}
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
  card: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  pair: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sideText: { flex: 1, fontSize: 12, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER_LIGHT },
  amount: { fontSize: 16, fontWeight: '800' },
  meta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
