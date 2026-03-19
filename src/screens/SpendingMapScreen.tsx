import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/ui';
import type { SpendingByStateResponse } from '../api/types';

type Metric = 'donations' | 'lobbying' | 'members';
type SectorFilter = 'all' | 'finance' | 'health' | 'tech' | 'energy';

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

function fmtValue(val: number, metric: Metric): string {
  if (metric === 'members') return val.toLocaleString();
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

export default function SpendingMapScreen() {
  const [metric, setMetric] = useState<Metric>('donations');
  const [sector, setSector] = useState<SectorFilter>('all');
  const [data, setData] = useState<SpendingByStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.getSpendingByState(metric, sector === 'all' ? undefined : sector);
      setData(res);
    } catch (e) {
      console.error('Failed to load spending data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [metric, sector]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // Build ranked list
  const ranked = data ? Object.entries(data.states)
    .map(([code, item]) => ({
      code,
      name: STATE_NAMES[code] || code,
      value: item.value,
      count: item.count,
    }))
    .sort((a, b) => b.value - a.value)
    : [];

  const maxValue = ranked.length > 0 ? ranked[0].value : 1;
  const totalValue = ranked.reduce((s, r) => s + r.value, 0);
  const statesWithData = ranked.filter(r => r.value > 0).length;

  const MetricPill = ({ label, value }: { label: string; value: Metric }) => (
    <TouchableOpacity
      style={[styles.pill, metric === value && styles.pillActive]}
      onPress={() => setMetric(value)}
    >
      <Text style={[styles.pillText, metric === value && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const SectorPill = ({ label, value }: { label: string; value: SectorFilter }) => (
    <TouchableOpacity
      style={[styles.pill, sector === value && styles.sectorPillActive]}
      onPress={() => setSector(value)}
    >
      <Text style={[styles.pillText, sector === value && styles.sectorPillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderState = ({ item, index }: { item: typeof ranked[0]; index: number }) => {
    const barWidth = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
    return (
      <View style={styles.stateRow}>
        <Text style={styles.stateRank}>{index + 1}</Text>
        <View style={styles.stateInfo}>
          <View style={styles.stateNameRow}>
            <Text style={styles.stateName}>{item.name}</Text>
            <Text style={styles.stateCode}>{item.code}</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${barWidth}%` as any }]} />
          </View>
        </View>
        <Text style={styles.stateValue}>{fmtValue(item.value, metric)}</Text>
      </View>
    );
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={loading ? [] : ranked}
      keyExtractor={(item) => item.code}
      renderItem={renderState}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
      ListHeaderComponent={
        <>
          <LinearGradient
            colors={['#1B7A3D', '#15693A', '#0F5831']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroOrb} />
            <View style={styles.heroInner}>
              <View style={styles.heroIconRow}>
                <Ionicons name="map" size={24} color="#FFFFFF" />
                <Text style={styles.heroTitle}>Spending by State</Text>
              </View>
              <Text style={styles.heroSubtitle}>Donations, lobbying, and congressional representation ranked by state</Text>
            </View>
          </LinearGradient>

          {/* Metric Picker */}
          <View style={styles.filterRow}>
            <MetricPill label="Donations" value="donations" />
            <MetricPill label="Lobbying" value="lobbying" />
            <MetricPill label="Members" value="members" />
          </View>

          {/* Sector Filter */}
          <View style={styles.filterRow}>
            <SectorPill label="All" value="all" />
            <SectorPill label="Finance" value="finance" />
            <SectorPill label="Health" value="health" />
            <SectorPill label="Tech" value="tech" />
            <SectorPill label="Energy" value="energy" />
          </View>

          {loading ? (
            <View style={{ padding: 32 }}>
              <LoadingSpinner message="Loading spending data..." />
            </View>
          ) : (
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryValue}>{fmtValue(totalValue, metric)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>States with data</Text>
                <Text style={styles.summaryValue}>{statesWithData}</Text>
              </View>
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        !loading ? <EmptyState title="No data" message="No spending data available for this metric/sector." /> : null
      }
      ListFooterComponent={
        ranked.length > 0 ? (
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Total: {fmtValue(totalValue, metric)} across {statesWithData} states
            </Text>
          </View>
        ) : null
      }
    />
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginTop: 12 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: UI_COLORS.CARD_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  pillActive: { backgroundColor: UI_COLORS.ACCENT + '18', borderColor: UI_COLORS.ACCENT + '40' },
  pillText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  pillTextActive: { color: UI_COLORS.ACCENT },
  sectorPillActive: { backgroundColor: UI_COLORS.GOLD + '18', borderColor: UI_COLORS.GOLD + '40' },
  sectorPillTextActive: { color: UI_COLORS.GOLD },
  summaryRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginTop: 14,
  },
  summaryItem: {
    flex: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, alignItems: 'center',
  },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: UI_COLORS.ACCENT, marginTop: 2 },
  stateRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG,
    paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 16, marginTop: 6,
    borderRadius: 10, borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  stateRank: { width: 28, fontSize: 14, fontWeight: '800', color: UI_COLORS.TEXT_MUTED, textAlign: 'center' },
  stateInfo: { flex: 1, marginHorizontal: 10 },
  stateNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  stateName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  stateCode: { fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: UI_COLORS.BORDER, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: UI_COLORS.ACCENT, borderRadius: 3 },
  stateValue: { fontSize: 14, fontWeight: '700', color: UI_COLORS.ACCENT, minWidth: 60, textAlign: 'right' },
  footer: { padding: 16, alignItems: 'center' },
  footerText: { fontSize: 12, color: UI_COLORS.TEXT_MUTED },
});
