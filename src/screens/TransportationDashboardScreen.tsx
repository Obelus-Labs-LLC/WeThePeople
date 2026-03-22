import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { TransportationDashboardStats, TransportationCompany, RecentActivityItem } from '../api/types';
import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';
import HeroBanner from '../components/HeroBanner';
import NavCard from '../components/NavCard';
import SectionHeader from '../components/SectionHeader';
import DataFreshness from '../components/DataFreshness';

const SECTOR_COLORS: Record<string, string> = {
  aviation: '#3B82F6',
  shipping: '#0EA5E9',
  auto: '#6366F1',
  rail: '#8B5CF6',
  aerospace: '#2563EB',
  logistics: '#14B8A6',
  trucking: '#F59E0B',
};

const ACCENT = '#3B82F6';

export default function TransportationDashboardScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<TransportationDashboardStats | null>(null);
  const [companies, setCompanies] = useState<TransportationCompany[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [statsRes, compRes] = await Promise.all([
        apiClient.getTransportationDashboard(),
        apiClient.getTransportationCompanies({ limit: 6 }),
      ]);
      setStats(statsRes);
      setCompanies(compRes.companies || []);
      // Fetch recent activity separately (may not exist yet)
      try {
        const activityRes = await apiClient.getTransportationRecentActivity();
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

  if (loading) return <LoadingSpinner message="Loading transportation data..." />;
  if (error) return <EmptyState title="Error" message={error} onRetry={loadData} />;
  if (!stats) return <EmptyState title="No Data" />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      {/* Hero Banner */}
      <HeroBanner
        colors={['#3B82F6', '#1E3A5F']}
        icon="airplane"
        title="Follow the Money in Transportation"
        subtitle="Tracking lobbying, contracts, enforcement across aviation, shipping, auto, rail, and aerospace."
      />

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <View style={styles.statsHalf}>
            <StatCard label="Companies" value={stats.total_companies} accent="blue" />
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

      {/* Data Freshness */}
      <DataFreshness />

      {/* Nav Cards */}
      <SectionHeader title="Explore" accent={ACCENT} />
      <View style={styles.navGrid}>
        <NavCard icon="business" title="Companies" subtitle="Airlines, automakers, rail, shipping" onPress={() => navigation.navigate('TransportationCompaniesDirectory')} accent={ACCENT} />
        <NavCard icon="document-text" title="Lobbying" subtitle="Senate LDA filings" onPress={() => navigation.navigate('TransportationLobbying')} accent="#C5960C" />
        <NavCard icon="briefcase" title="Contracts" subtitle="USASpending.gov" onPress={() => navigation.navigate('TransportationContracts')} accent="#10B981" />
        <NavCard icon="shield" title="Enforcement" subtitle="FAA, NHTSA, DOT, FMC" onPress={() => navigation.navigate('TransportationEnforcement')} accent="#DC2626" />
        <NavCard icon="git-compare" title="Compare" subtitle="Side-by-side analysis" onPress={() => navigation.navigate('TransportationCompare')} accent="#8B5CF6" />
      </View>

      {/* Sector Distribution */}
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
                  {key.replace('_', ' ')} ({count})
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Featured Companies */}
      <SectionHeader
        title="Featured Companies"
        accent={ACCENT}
        onViewAll={() => navigation.navigate('TransportationCompaniesDirectory')}
      />
      <View style={styles.featuredList}>
        {companies.map((c) => (
          <TouchableOpacity
            key={c.company_id}
            style={styles.companyCard}
            onPress={() => navigation.navigate('TransportationCompanyDetail', { company_id: c.company_id })}
            accessibilityRole="button"
            accessibilityLabel={`View ${c.display_name}`}
          >
            <View style={[styles.iconWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '15' }]}>
              <Ionicons name="airplane" size={20} color={SECTOR_COLORS[c.sector_type] || '#6B7280'} />
            </View>
            <View style={styles.companyInfo}>
              <Text style={styles.companyName} numberOfLines={1}>{c.display_name}</Text>
              <View style={styles.companyMeta}>
                {c.ticker && <Text style={styles.ticker}>{c.ticker}</Text>}
                <View style={[styles.badge, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '12', borderColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '25' }]}>
                  <Text style={[styles.badgeText, { color: SECTOR_COLORS[c.sector_type] || '#6B7280' }]}>{c.sector_type.replace('_', ' ')}</Text>
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

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <>
          <SectionHeader title="Recent Activity" accent={UI_COLORS.GOLD} />
          <View style={styles.activityCard}>
            {recentActivity.slice(0, 5).map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.activityRow, i < Math.min(recentActivity.length, 5) - 1 && styles.activityBorder]}
                onPress={() => item.company_id ? navigation.navigate('TransportationCompanyDetail', { company_id: item.company_id }) : null}
              >
                <View style={styles.activityDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
                  {item.company_name && <Text style={styles.activityMeta}>{item.company_name}</Text>}
                </View>
                <Text style={styles.activityDate}>{new Date(item.date).toLocaleDateString()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data from FAA, NHTSA, DOT, SEC EDGAR, USASpending.gov, Senate LDA</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  statsGrid: {
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statsHalf: {
    flex: 1,
  },
  navGrid: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, gap: 6 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  featuredList: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  companyCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  companyInfo: { flex: 1 },
  companyName: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  companyMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },
  ticker: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  companyStats: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },
  // Recent Activity
  activityCard: {
    marginHorizontal: 16,
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    marginBottom: 16,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  activityBorder: {
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  activityMeta: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
    marginTop: 2,
  },
  activityDate: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
    fontVariant: ['tabular-nums'],
  },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, textAlign: 'center', paddingHorizontal: 24 },
});
