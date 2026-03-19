import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { StatCard, LoadingSpinner, EmptyState } from '../components/ui';
import SectionHeader from '../components/SectionHeader';
import NavCard from '../components/NavCard';
import type { InfluenceStats, TopLobbyingItem, TopContractsItem } from '../api/types';

function fmtDollar(val: number | null): string {
  if (val == null) return '$0';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

interface InfluenceExplorerScreenProps {
  navigation?: any;
}

export default function InfluenceExplorerScreen({ navigation }: InfluenceExplorerScreenProps) {
  const [stats, setStats] = useState<InfluenceStats | null>(null);
  const [topLobbying, setTopLobbying] = useState<TopLobbyingItem[]>([]);
  const [topContracts, setTopContracts] = useState<TopContractsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, lobbyingRes, contractsRes] = await Promise.all([
        apiClient.getInfluenceStats(),
        apiClient.getTopLobbying(5),
        apiClient.getTopContracts(5),
      ]);
      setStats(statsRes);
      setTopLobbying(lobbyingRes);
      setTopContracts(contractsRes);
    } catch (e) {
      console.error('Failed to load influence data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingSpinner message="Loading influence data..." />;

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
            <Ionicons name="git-network" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Follow the Money</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Track how corporations lobby Congress, win government contracts, and face enforcement actions
          </Text>
        </View>
      </LinearGradient>

      {/* Stats */}
      {stats && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Lobbying Spend" value={fmtDollar(stats.total_lobbying_spend)} accent="green" />
            </View>
            <View style={styles.statItem}>
              <StatCard label="Contract Value" value={fmtDollar(stats.total_contract_value)} accent="gold" />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Enforcement Actions" value={stats.total_enforcement_actions} accent="red" />
            </View>
            <View style={styles.statItem}>
              <StatCard label="Politicians Connected" value={stats.politicians_connected} accent="blue" />
            </View>
          </View>
        </>
      )}

      {/* Top Lobbying Spenders */}
      <View style={styles.section}>
        <SectionHeader title="Top Lobbying Spenders" accent={UI_COLORS.ACCENT} />
        {topLobbying.length === 0 ? (
          <EmptyState title="No data" message="Lobbying data not available yet." />
        ) : (
          topLobbying.map((item, i) => (
            <View key={item.entity_id} style={styles.rankCard}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankNumber}>{i + 1}</Text>
              </View>
              <View style={styles.rankInfo}>
                <Text style={styles.rankName}>{item.display_name}</Text>
                <Text style={styles.rankDetail}>{item.filing_count} filings</Text>
              </View>
              <Text style={[styles.rankValue, { color: UI_COLORS.ACCENT }]}>{fmtDollar(item.total_income)}</Text>
            </View>
          ))
        )}
      </View>

      {/* Top Contract Recipients */}
      <View style={styles.section}>
        <SectionHeader title="Top Contract Recipients" accent={UI_COLORS.GOLD} />
        {topContracts.length === 0 ? (
          <EmptyState title="No data" message="Contract data not available yet." />
        ) : (
          topContracts.map((item, i) => (
            <View key={item.entity_id} style={styles.rankCard}>
              <View style={[styles.rankBadge, { backgroundColor: UI_COLORS.GOLD + '18' }]}>
                <Text style={[styles.rankNumber, { color: UI_COLORS.GOLD }]}>{i + 1}</Text>
              </View>
              <View style={styles.rankInfo}>
                <Text style={styles.rankName}>{item.display_name}</Text>
                <Text style={styles.rankDetail}>{item.contract_count} contracts</Text>
              </View>
              <Text style={[styles.rankValue, { color: UI_COLORS.GOLD }]}>{fmtDollar(item.total_value)}</Text>
            </View>
          ))
        )}
      </View>

      {/* Navigation */}
      <View style={styles.section}>
        <SectionHeader title="Explore" accent={UI_COLORS.ACCENT} />
        <View style={styles.navCards}>
          <NavCard
            icon="git-network"
            title="Influence Network"
            subtitle="Connections between politicians and companies"
            onPress={() => navigation?.navigate?.('InfluenceNetwork')}
            accent={UI_COLORS.ACCENT}
          />
          <View style={{ height: 10 }} />
          <NavCard
            icon="map"
            title="Spending by State"
            subtitle="Donations, lobbying, and members by state"
            onPress={() => navigation?.navigate?.('SpendingMap')}
            accent={UI_COLORS.GOLD}
          />
        </View>
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
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 10 },
  statItem: { flex: 1 },
  section: { marginTop: 20 },
  rankCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 10, padding: 12, marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  rankBadge: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: UI_COLORS.ACCENT + '18',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  rankNumber: { fontSize: 14, fontWeight: '800', color: UI_COLORS.ACCENT },
  rankInfo: { flex: 1 },
  rankName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  rankDetail: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 1 },
  rankValue: { fontSize: 15, fontWeight: '800' },
  navCards: { paddingHorizontal: 16 },
});
