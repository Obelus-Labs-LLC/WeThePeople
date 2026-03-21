import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/ui';

const SECTOR_FILTERS = [
  { key: 'all', label: 'All Sectors' },
  { key: 'finance', label: 'Finance' },
  { key: 'health', label: 'Health' },
  { key: 'tech', label: 'Tech' },
  { key: 'energy', label: 'Energy' },
];

const SECTOR_COLORS: Record<string, string> = {
  finance: '#10B981',
  health: '#F43F5E',
  tech: '#8B5CF6',
  energy: '#475569',
};

function fmtDollar(val: number | null | undefined): string {
  if (val == null) return '$0';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

export default function MoneyFlowScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sector, setSector] = useState('all');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.getMoneyFlow(sector === 'all' ? undefined : sector);
      setData(res);
    } catch (e: any) {
      console.error('Money flow load failed:', e);
      setError(e.message || 'Failed to load money flow data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sector]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingSpinner message="Loading money flows..." />;

  // Parse links from the Sankey-style response
  const links: any[] = data?.links || data?.flows || [];
  const nodes: any[] = data?.nodes || [];

  // Build readable flow items
  const flowItems = links.map((link: any, idx: number) => {
    const sourceName = nodes.find((n: any) => n.id === link.source)?.label || link.source_name || link.source || 'Unknown';
    const targetName = nodes.find((n: any) => n.id === link.target)?.label || link.target_name || link.target || 'Unknown';
    return {
      id: `flow-${idx}`,
      source: sourceName,
      target: targetName,
      value: link.value || link.amount || 0,
      type: link.type || link.flow_type || 'lobbying',
    };
  }).sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

  const getFlowColor = (type: string) => {
    if (type === 'lobbying') return '#2563EB';
    if (type === 'pac' || type === 'donation') return '#10B981';
    if (type === 'contract') return '#DC2626';
    return '#6B7280';
  };

  const getFlowIcon = (type: string) => {
    if (type === 'lobbying') return 'megaphone';
    if (type === 'pac' || type === 'donation') return 'cash';
    if (type === 'contract') return 'briefcase';
    return 'swap-horizontal';
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
      >
        {/* Hero */}
        <LinearGradient
          colors={['#1B7A3D', '#15693A', '#0F5831']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroOrb} />
          <View style={styles.heroInner}>
            <View style={styles.heroIconRow}>
              <Ionicons name="analytics" size={24} color="#FFFFFF" />
              <Text style={styles.heroTitle}>Money Flow</Text>
            </View>
            <Text style={styles.heroSubtitle}>
              Track how money flows from corporations through lobbying and PACs to politicians
            </Text>
          </View>
        </LinearGradient>

        {/* Sector filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
          {SECTOR_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterPill,
                sector === f.key
                  ? { backgroundColor: UI_COLORS.ACCENT + '18', borderColor: UI_COLORS.ACCENT + '40' }
                  : { backgroundColor: UI_COLORS.CARD_BG, borderColor: UI_COLORS.BORDER },
              ]}
              onPress={() => setSector(f.key)}
            >
              <Text style={[
                styles.filterText,
                { color: sector === f.key ? UI_COLORS.ACCENT : UI_COLORS.TEXT_MUTED },
              ]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : flowItems.length === 0 ? (
          <EmptyState title="No flows found" message="Money flow data is not available for this sector yet." />
        ) : (
          <>
            <Text style={styles.countText}>{flowItems.length} flows</Text>
            {flowItems.map((item: any) => {
              const flowColor = getFlowColor(item.type);
              const flowIcon = getFlowIcon(item.type);
              return (
                <View key={item.id} style={styles.flowCard}>
                  <View style={styles.flowLeft}>
                    <Ionicons name={flowIcon as any} size={18} color={flowColor} />
                    <View style={styles.flowInfo}>
                      <Text style={styles.flowSource}>{item.source}</Text>
                      <View style={styles.flowArrowRow}>
                        <Ionicons name="arrow-forward" size={12} color={UI_COLORS.TEXT_MUTED} />
                        <View style={[styles.flowTypeBadge, { backgroundColor: flowColor + '15', borderColor: flowColor + '30' }]}>
                          <Text style={[styles.flowTypeText, { color: flowColor }]}>{item.type}</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={12} color={UI_COLORS.TEXT_MUTED} />
                      </View>
                      <Text style={styles.flowTarget}>{item.target}</Text>
                    </View>
                  </View>
                  <Text style={[styles.flowAmount, { color: flowColor }]}>
                    {fmtDollar(item.value)}
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { paddingBottom: 32 },
  hero: {
    borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    overflow: 'hidden', position: 'relative',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  filterScroll: { marginTop: 12 },
  filterRow: { paddingHorizontal: 16, gap: 6 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1,
  },
  filterText: { fontSize: 12, fontWeight: '600' },
  countText: { paddingHorizontal: 16, marginTop: 12, marginBottom: 8, fontSize: 12, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  flowCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  flowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  flowInfo: { flex: 1 },
  flowSource: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  flowArrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 3 },
  flowTypeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  flowTypeText: { fontSize: 9, fontWeight: '700', textTransform: 'capitalize' },
  flowTarget: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  flowAmount: { fontSize: 15, fontWeight: '800', marginLeft: 8 },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14 },
});
