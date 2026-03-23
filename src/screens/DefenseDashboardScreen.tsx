import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { DefenseDashboardStats, DefenseCompany, RecentActivityItem } from '../api/types';
import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';
import HeroBanner from '../components/HeroBanner';
import NavCard from '../components/NavCard';
import SectionHeader from '../components/SectionHeader';
import DataFreshness from '../components/DataFreshness';

const SECTOR_COLORS: Record<string, string> = {
  defense_prime: '#DC2626',
  defense_sub: '#F59E0B',
  aerospace_defense: '#3B82F6',
  cybersecurity: '#8B5CF6',
  shipbuilding: '#06B6D4',
  munitions: '#EF4444',
  intelligence: '#10B981',
  logistics_defense: '#F97316',
};

const ACCENT = '#DC2626';

export default function DefenseDashboardScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<DefenseDashboardStats | null>(null);
  const [companies, setCompanies] = useState<DefenseCompany[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [statsRes, compRes] = await Promise.all([
        apiClient.getDefenseDashboard(),
        apiClient.getDefenseCompanies({ limit: 6 }),
      ]);
      setStats(statsRes);
      setCompanies(compRes.companies || []);
      try {
        const activityRes = await apiClient.getDefenseRecentActivity();
        setRecentActivity(activityRes.items || []);
      } catch { setRecentActivity([]); }
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) return <LoadingSpinner message="Loading defense data..." />;
  if (error) return <EmptyState title="Error" message={error} onRetry={loadData} />;
  if (!stats) return <EmptyState title="No Data" />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <HeroBanner
        colors={['#DC2626', '#7F1D1D']}
        icon="shield"
        title="Follow the Money in Defense"
        subtitle="Tracking lobbying, contracts, enforcement across defense primes, subcontractors, cyber, and aerospace."
      />

      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <View style={styles.statsHalf}>
            <StatCard label="Companies" value={stats.total_companies} accent="red" />
          </View>
          <View style={styles.statsHalf}>
            <StatCard label="Lobbying Filings" value={stats.total_lobbying} accent="amber" />
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statsHalf}>
            <StatCard label="Enforcement" value={stats.total_enforcement} accent="red" />
          </View>
          <View style={styles.statsHalf}>
            <StatCard label="Gov Contracts" value={stats.total_contracts} accent="emerald" />
          </View>
        </View>
      </View>

      <DataFreshness />

      <SectionHeader title="Explore" accent={ACCENT} />
      <View style={styles.navGrid}>
        <NavCard icon="shield" title="Companies" subtitle="Primes, subs, cyber, aerospace" onPress={() => navigation.navigate('DefenseCompaniesDirectory')} accent={ACCENT} />
        <NavCard icon="document-text" title="Lobbying" subtitle="Senate LDA filings" onPress={() => navigation.navigate('DefenseLobbying')} accent="#C5960C" />
        <NavCard icon="briefcase" title="Contracts" subtitle="USASpending.gov (DOD)" onPress={() => navigation.navigate('DefenseContracts')} accent="#10B981" />
        <NavCard icon="alert-circle" title="Enforcement" subtitle="DOD, DCAA, ITAR" onPress={() => navigation.navigate('DefenseEnforcement')} accent="#EF4444" />
        <NavCard icon="git-compare" title="Compare" subtitle="Side-by-side analysis" onPress={() => navigation.navigate('DefenseCompare')} accent="#8B5CF6" />
      </View>

      {Object.keys(stats.by_sector).length > 0 && (
        <View style={styles.section}>
          <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
            <Text style={styles.sectionTitle}>By Sector Type</Text>
          </View>
          <View style={styles.chipRow}>
            {Object.entries(stats.by_sector).map(([key, count]) => (
              <View key={key} style={[styles.chip, { backgroundColor: (SECTOR_COLORS[key] || '#6B7280') + '15' }]}>
                <View style={[styles.chipDot, { backgroundColor: SECTOR_COLORS[key] || '#6B7280' }]} />
                <Text style={[styles.chipText, { color: SECTOR_COLORS[key] || '#6B7280' }]}>
                  {key.replace(/_/g, ' ')} ({count})
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <SectionHeader title="Featured Companies" accent={ACCENT} onViewAll={() => navigation.navigate('DefenseCompaniesDirectory')} />
      <View style={styles.featuredList}>
        {companies.map((c) => (
          <TouchableOpacity key={c.company_id} style={styles.companyCard}
            onPress={() => navigation.navigate('DefenseCompanyDetail', { company_id: c.company_id })}>
            <View style={[styles.iconWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '15' }]}>
              <Ionicons name="shield" size={20} color={SECTOR_COLORS[c.sector_type] || '#6B7280'} />
            </View>
            <View style={styles.companyInfo}>
              <Text style={styles.companyName} numberOfLines={1}>{c.display_name}</Text>
              <View style={styles.companyMeta}>
                {c.ticker && <Text style={styles.ticker}>{c.ticker}</Text>}
                <View style={[styles.badgeWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '12', borderColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '25' }]}>
                  <Text style={[styles.badgeText, { color: SECTOR_COLORS[c.sector_type] || '#6B7280' }]}>{c.sector_type.replace(/_/g, ' ')}</Text>
                </View>
              </View>
              <Text style={styles.companyStats}>
                {c.contract_count} contracts · {c.lobbying_count} lobbying · {c.filing_count} filings
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Data from DOD, DCAA, SEC EDGAR, USASpending.gov, Senate LDA</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  statsGrid: { paddingHorizontal: 16, gap: 8, marginTop: 12 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statsHalf: { flex: 1 },
  navGrid: { paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, gap: 6 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  featuredList: { paddingHorizontal: 16, marginBottom: 16 },
  companyCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  companyInfo: { flex: 1 },
  companyName: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  companyMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },
  ticker: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  badgeWrap: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  companyStats: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, textAlign: 'center', paddingHorizontal: 24 },
});
