import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';
import SectionHeader from '../components/SectionHeader';

const SECTORS = [
  { key: 'politics', label: 'Politics', icon: 'business', color: '#2563EB' },
  { key: 'finance', label: 'Finance', icon: 'trending-up', color: '#10B981' },
  { key: 'health', label: 'Health', icon: 'medkit', color: '#F43F5E' },
  { key: 'tech', label: 'Tech', icon: 'hardware-chip', color: '#8B5CF6' },
  { key: 'energy', label: 'Energy', icon: 'flame', color: '#475569' },
];

function fmtDollar(val: number | null | undefined): string {
  if (val == null) return '$0';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

export default function DataExplorerScreen() {
  const [activeSectors, setActiveSectors] = useState<Set<string>>(new Set(['politics', 'finance', 'health', 'tech', 'energy']));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [influenceStats, setInfluenceStats] = useState<any>(null);
  const [freshness, setFreshness] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, freshnessRes] = await Promise.all([
        apiClient.getInfluenceStats().catch(() => null),
        apiClient.getDataFreshness().catch(() => null),
      ]);
      setInfluenceStats(statsRes);
      setFreshness(freshnessRes);
    } catch (e) {
      console.error('Data explorer load failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const toggleSector = (key: string) => {
    setActiveSectors(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) return <LoadingSpinner message="Loading data explorer..." />;

  return (
    <ScrollView
      style={styles.container}
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
            <Ionicons name="grid" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Data Explorer</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Cross-sector dashboard showing key metrics across all tracked sectors
          </Text>
        </View>
      </LinearGradient>

      {/* Sector Toggles */}
      <View style={styles.toggleRow}>
        {SECTORS.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[
              styles.toggleBtn,
              activeSectors.has(s.key)
                ? { backgroundColor: s.color + '18', borderColor: s.color + '40' }
                : { backgroundColor: UI_COLORS.CARD_BG, borderColor: UI_COLORS.BORDER },
            ]}
            onPress={() => toggleSector(s.key)}
          >
            <Ionicons
              name={s.icon as any}
              size={14}
              color={activeSectors.has(s.key) ? s.color : UI_COLORS.TEXT_MUTED}
            />
            <Text style={[
              styles.toggleText,
              { color: activeSectors.has(s.key) ? s.color : UI_COLORS.TEXT_MUTED },
            ]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Aggregate Stats */}
      {influenceStats && (
        <View style={styles.section}>
          <SectionHeader title="Aggregate Influence" accent={UI_COLORS.ACCENT} />
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Total Lobbying" value={fmtDollar(influenceStats.total_lobbying_spend)} accent="green" />
            </View>
            <View style={styles.statItem}>
              <StatCard label="Total Contracts" value={fmtDollar(influenceStats.total_contract_value)} accent="gold" />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Enforcement" value={influenceStats.total_enforcement_actions || 0} accent="red" />
            </View>
            <View style={styles.statItem}>
              <StatCard label="Politicians" value={influenceStats.politicians_connected || 0} accent="blue" />
            </View>
          </View>
        </View>
      )}

      {/* Data Freshness */}
      {freshness && (
        <View style={styles.section}>
          <SectionHeader title="Data Freshness" accent={UI_COLORS.GOLD} />
          {(Array.isArray(freshness) ? freshness : freshness.items || [])
            .filter((item: any) => {
              if (!item.sector) return true;
              return activeSectors.has(item.sector);
            })
            .map((item: any, idx: number) => (
              <View key={idx} style={styles.freshnessCard}>
                <View style={styles.freshnessLeft}>
                  <Text style={styles.freshnessLabel}>{item.label || item.dataset || item.name}</Text>
                  <Text style={styles.freshnessDetail}>
                    {item.record_count?.toLocaleString() || '---'} records
                  </Text>
                </View>
                <View style={styles.freshnessRight}>
                  <Text style={styles.freshnessDate}>
                    {item.last_sync ? new Date(item.last_sync).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
              </View>
            ))}
          {(!freshness || (Array.isArray(freshness) ? freshness.length === 0 : !freshness.items?.length)) && (
            <EmptyState title="No freshness data" message="Data freshness information is not available." />
          )}
        </View>
      )}

      {/* Per-sector summary cards */}
      <View style={styles.section}>
        <SectionHeader title="Active Sectors" accent={UI_COLORS.ACCENT} />
        {SECTORS.filter(s => activeSectors.has(s.key)).map(s => (
          <View key={s.key} style={[styles.sectorCard, { borderLeftColor: s.color }]}>
            <Ionicons name={s.icon as any} size={20} color={s.color} />
            <View style={styles.sectorInfo}>
              <Text style={styles.sectorName}>{s.label}</Text>
              <Text style={styles.sectorDetail}>Tracking lobbying, contracts, and enforcement</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
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
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 6, marginTop: 12 },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1,
  },
  toggleText: { fontSize: 12, fontWeight: '600' },
  section: { marginTop: 20 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 10 },
  statItem: { flex: 1 },
  freshnessCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginHorizontal: 16, marginBottom: 6,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  freshnessLeft: { flex: 1 },
  freshnessLabel: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  freshnessDetail: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 1 },
  freshnessRight: {},
  freshnessDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },
  sectorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14, marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER, borderLeftWidth: 3,
  },
  sectorInfo: { flex: 1 },
  sectorName: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  sectorDetail: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 1 },
});
