import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

const ACCENT = '#7C3AED';

function fmt$(n?: number | null): string {
  if (n == null || n === 0) return '-';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function InfluenceExplorerScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<any>(null);
  const [topLobbying, setTopLobbying] = useState<any[]>([]);
  const [topContracts, setTopContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [s, lob, con] = await Promise.all([
        apiClient.getInfluenceStats(),
        apiClient.getTopLobbying({ limit: 15 }),
        apiClient.getTopContracts({ limit: 15 }),
      ]);
      setStats(s);
      setTopLobbying(Array.isArray(lob) ? lob : (lob as any).companies || []);
      setTopContracts(Array.isArray(con) ? con : (con as any).companies || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner message="Loading influence data..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <LinearGradient colors={[ACCENT, '#6D28D9', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="pulse" size={24} color="#FFFFFF" />
        <Text style={styles.heroTitle}>Influence Explorer</Text>
        <Text style={styles.heroSubtitle}>
          Aggregate view of lobbying, contracts, donations, and trades across every tracked entity.
        </Text>
      </LinearGradient>

      {stats && (
        <View style={styles.statsGrid}>
          <StatCard label="Lobbying spend" value={fmt$(stats.total_lobbying_spend)} color="#F59E0B" />
          <StatCard label="Contract value" value={fmt$(stats.total_contract_value)} color="#10B981" />
          <StatCard label="Penalties" value={fmt$(stats.total_penalties)} color="#DC2626" />
          <StatCard label="Donations" value={fmt$(stats.total_donation_amount)} color="#3B82F6" />
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={styles.titleRow}>
            <View style={[styles.bar, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.sectionTitle}>Top lobbyists</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('LobbyingBreakdown')}>
            <Text style={[styles.seeAll, { color: '#F59E0B' }]}>Breakdown \u2192</Text>
          </TouchableOpacity>
        </View>
        {topLobbying.map((row, i) => (
          <LeaderRow key={`l-${i}`} rank={i + 1} name={row.display_name || row.entity_name || row.name} value={fmt$(row.total_spend || row.total_lobbying_spend || row.amount)} color="#F59E0B" />
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={styles.titleRow}>
            <View style={[styles.bar, { backgroundColor: '#10B981' }]} />
            <Text style={styles.sectionTitle}>Top contractors</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('ContractTimeline')}>
            <Text style={[styles.seeAll, { color: '#10B981' }]}>Timeline \u2192</Text>
          </TouchableOpacity>
        </View>
        {topContracts.map((row, i) => (
          <LeaderRow key={`c-${i}`} rank={i + 1} name={row.display_name || row.entity_name || row.name} value={fmt$(row.total_value || row.total_contract_value || row.amount)} color="#10B981" />
        ))}
      </View>

      <View style={styles.sectionNav}>
        <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('MoneyFlow')}>
          <Ionicons name="cash" size={20} color="#3B82F6" />
          <Text style={styles.navCardTitle}>Money Flow</Text>
          <Text style={styles.navCardDesc}>Company {'\u2192'} politician donations</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('ClosedLoop')}>
          <Ionicons name="git-compare" size={20} color="#DC2626" />
          <Text style={styles.navCardTitle}>Closed Loops</Text>
          <Text style={styles.navCardDesc}>Lobby {'\u2192'} bill {'\u2192'} donation</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('InfluenceMap')}>
          <Ionicons name="map" size={20} color="#CA8A04" />
          <Text style={styles.navCardTitle}>Spend by State</Text>
          <Text style={styles.navCardDesc}>Geographic breakdown</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LeaderRow({ rank, name, value, color }: { rank: number; name?: string; value: string; color: string }) {
  return (
    <View style={styles.leaderRow}>
      <Text style={styles.rank}>#{rank}</Text>
      <Text style={styles.leaderName} numberOfLines={1}>{name || 'Unknown'}</Text>
      <Text style={[styles.leaderValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 22, paddingTop: 28, gap: 6 },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 6 },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 },
  statCard: { width: '48%' as any, flexGrow: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14, borderLeftWidth: 3, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', marginTop: 3 },
  section: { paddingHorizontal: 16, marginTop: 12, marginBottom: 12 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { width: 4, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  seeAll: { fontSize: 12, fontWeight: '700' },
  leaderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  rank: { width: 36, fontSize: 12, fontWeight: '800', color: UI_COLORS.TEXT_MUTED },
  leaderName: { flex: 1, fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginRight: 8 },
  leaderValue: { fontSize: 13, fontWeight: '800' },
  sectionNav: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 4 },
  navCard: { width: '48%' as any, flexGrow: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT, gap: 6 },
  navCardTitle: { fontSize: 14, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  navCardDesc: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
