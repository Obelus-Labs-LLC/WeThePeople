import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView,
  StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, StatCard } from '../components/ui';
import SectionHeader from '../components/SectionHeader';

export default function BalanceOfPowerScreen() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.getBalanceOfPower();
      setStats(res);
    } catch (e) {
      console.error('Balance of power load failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingSpinner message="Loading balance of power..." />;

  // Extract party composition from dashboard stats
  const partyBreakdown = stats?.party_breakdown || stats?.balance_of_power || {};
  const senateData = partyBreakdown.senate || {};
  const houseData = partyBreakdown.house || {};

  const senateD = senateData.D || senateData.Democrat || 0;
  const senateR = senateData.R || senateData.Republican || 0;
  const senateI = senateData.I || senateData.Independent || 0;
  const senateTotal = senateD + senateR + senateI || 100;

  const houseD = houseData.D || houseData.Democrat || 0;
  const houseR = houseData.R || houseData.Republican || 0;
  const houseI = houseData.I || houseData.Independent || 0;
  const houseTotal = houseD + houseR + houseI || 435;

  // Calculate congress number dynamically
  const currentYear = new Date().getFullYear();
  const congressNumber = Math.floor((currentYear - 1789) / 2) + 1;

  const renderBar = (dem: number, rep: number, ind: number, total: number) => {
    const dFlex = total > 0 ? dem / total : 0;
    const rFlex = total > 0 ? rep / total : 0;
    const iFlex = total > 0 ? ind / total : 0;
    return (
      <View style={styles.barContainer}>
        {dFlex > 0 && <View style={[styles.barSegment, { flex: dFlex, backgroundColor: PARTY_COLORS.D }]} />}
        {iFlex > 0 && <View style={[styles.barSegment, { flex: iFlex, backgroundColor: PARTY_COLORS.I }]} />}
        {rFlex > 0 && <View style={[styles.barSegment, { flex: rFlex, backgroundColor: PARTY_COLORS.R }]} />}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#2563EB', '#1D4ED8', '#1E40AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="podium" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Balance of Power</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            {congressNumber}th Congress party composition
          </Text>
        </View>
      </LinearGradient>

      {/* Senate */}
      <View style={styles.section}>
        <SectionHeader title="Senate" accent={PARTY_COLORS.D} />
        <View style={styles.chamberCard}>
          {renderBar(senateD, senateR, senateI, senateTotal)}
          <View style={styles.partyRow}>
            <View style={styles.partyItem}>
              <View style={[styles.partyDot, { backgroundColor: PARTY_COLORS.D }]} />
              <Text style={styles.partyLabel}>Democrats</Text>
              <Text style={[styles.partyCount, { color: PARTY_COLORS.D }]}>{senateD}</Text>
            </View>
            <View style={styles.partyItem}>
              <View style={[styles.partyDot, { backgroundColor: PARTY_COLORS.R }]} />
              <Text style={styles.partyLabel}>Republicans</Text>
              <Text style={[styles.partyCount, { color: PARTY_COLORS.R }]}>{senateR}</Text>
            </View>
            {senateI > 0 && (
              <View style={styles.partyItem}>
                <View style={[styles.partyDot, { backgroundColor: PARTY_COLORS.I }]} />
                <Text style={styles.partyLabel}>Independent</Text>
                <Text style={[styles.partyCount, { color: PARTY_COLORS.I }]}>{senateI}</Text>
              </View>
            )}
          </View>
          <Text style={styles.majorityText}>
            {senateD > senateR ? 'Democratic Majority' : senateR > senateD ? 'Republican Majority' : 'Evenly Split'}
          </Text>
        </View>
      </View>

      {/* House */}
      <View style={styles.section}>
        <SectionHeader title="House of Representatives" accent={PARTY_COLORS.R} />
        <View style={styles.chamberCard}>
          {renderBar(houseD, houseR, houseI, houseTotal)}
          <View style={styles.partyRow}>
            <View style={styles.partyItem}>
              <View style={[styles.partyDot, { backgroundColor: PARTY_COLORS.D }]} />
              <Text style={styles.partyLabel}>Democrats</Text>
              <Text style={[styles.partyCount, { color: PARTY_COLORS.D }]}>{houseD}</Text>
            </View>
            <View style={styles.partyItem}>
              <View style={[styles.partyDot, { backgroundColor: PARTY_COLORS.R }]} />
              <Text style={styles.partyLabel}>Republicans</Text>
              <Text style={[styles.partyCount, { color: PARTY_COLORS.R }]}>{houseR}</Text>
            </View>
            {houseI > 0 && (
              <View style={styles.partyItem}>
                <View style={[styles.partyDot, { backgroundColor: PARTY_COLORS.I }]} />
                <Text style={styles.partyLabel}>Independent</Text>
                <Text style={[styles.partyCount, { color: PARTY_COLORS.I }]}>{houseI}</Text>
              </View>
            )}
          </View>
          <Text style={styles.majorityText}>
            {houseD > houseR ? 'Democratic Majority' : houseR > houseD ? 'Republican Majority' : 'Evenly Split'}
          </Text>
        </View>
      </View>

      {/* Overview Stats */}
      {stats && (
        <View style={styles.section}>
          <SectionHeader title="Overview" accent={UI_COLORS.ACCENT} />
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Total Members" value={stats.total_members || stats.people_count || '---'} accent="green" />
            </View>
            <View style={styles.statItem}>
              <StatCard label="Bills Tracked" value={stats.bill_count || stats.total_bills || '---'} accent="blue" />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Votes Recorded" value={stats.vote_count || stats.total_votes || '---'} accent="gold" />
            </View>
            <View style={styles.statItem}>
              <StatCard label="Committees" value={stats.committee_count || '---'} accent="purple" />
            </View>
          </View>
        </View>
      )}
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
  section: { marginTop: 20 },
  chamberCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 16, marginHorizontal: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  barContainer: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: UI_COLORS.BORDER, marginBottom: 12 },
  barSegment: { height: '100%' },
  partyRow: { gap: 8 },
  partyItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partyDot: { width: 10, height: 10, borderRadius: 5 },
  partyLabel: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, flex: 1 },
  partyCount: { fontSize: 18, fontWeight: '800' },
  majorityText: { marginTop: 10, fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, textAlign: 'center' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 10 },
  statItem: { flex: 1 },
});
