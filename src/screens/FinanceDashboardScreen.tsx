import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { FinanceDashboardStats, Institution } from '../api/types';
import { LoadingSpinner, StatCard, EmptyState, SectorTypeBadge } from '../components/ui';
import HeroBanner from '../components/HeroBanner';
import NavCard from '../components/NavCard';
import SectionHeader from '../components/SectionHeader';
import DataFreshness from '../components/DataFreshness';

const SECTOR_COLORS: Record<string, string> = {
  bank: '#2563EB',
  investment: '#8B5CF6',
  insurance: '#F59E0B',
  fintech: '#10B981',
  central_bank: '#DC2626',
};

const ACCENT = '#D4A017';

function fmtMoney(n: number | undefined): string {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export default function FinanceDashboardScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<FinanceDashboardStats | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [statsRes, instRes] = await Promise.all([
        apiClient.getFinanceDashboardStats(),
        apiClient.getInstitutions({ limit: 6 }),
      ]);
      setStats(statsRes);
      setInstitutions(instRes.institutions || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load finance data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) return <LoadingSpinner message="Loading finance data..." />;

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      {/* Hero Banner */}
      <HeroBanner
        colors={['#D4A017', '#8B6914']}
        icon="cash"
        title="Follow the Money in Finance"
        subtitle="Tracking lobbying, contracts, enforcement, and insider trades across Wall Street."
      />

      {/* Stats Grid — politics-first: lobbying/contracts/enforcement as primary */}
      {stats && (
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <View style={styles.statsHalf}>
              <StatCard label="Institutions" value={stats.total_institutions} accent="gold" />
            </View>
            <View style={styles.statsHalf}>
              <StatCard label="SEC Filings" value={stats.total_filings} accent="blue" />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statsHalf}>
              <StatCard label="FDIC Reports" value={stats.total_financials} accent="amber" />
            </View>
            <View style={styles.statsHalf}>
              <StatCard label="Complaints" value={stats.total_complaints} accent="red" />
            </View>
          </View>
        </View>
      )}

      {/* Data Freshness */}
      <DataFreshness />

      {/* Nav Cards */}
      <SectionHeader title="Explore" accent={ACCENT} />
      <View style={styles.navGrid}>
        <NavCard icon="business" title="Institutions" subtitle="Banks, investment firms, fintechs" onPress={() => navigation.navigate('InstitutionsDirectory')} accent={ACCENT} />
        <NavCard icon="trending-down" title="Insider Trades" subtitle="Congressional & corporate" onPress={() => navigation.navigate('InsiderTrades')} accent="#DC2626" />
        <NavCard icon="bar-chart" title="Macro Indicators" subtitle="FRED economic data" onPress={() => navigation.navigate('MacroIndicators')} accent="#2563EB" />
        <NavCard icon="chatbox-ellipses" title="Complaints" subtitle="CFPB consumer data" onPress={() => navigation.navigate('Complaints')} accent="#F59E0B" />
        <NavCard icon="document-text" title="Lobbying" subtitle="Senate LDA filings" onPress={() => navigation.navigate('FinanceLobbying')} accent="#C5960C" />
        <NavCard icon="briefcase" title="Contracts" subtitle="USASpending.gov" onPress={() => navigation.navigate('FinanceContracts')} accent="#10B981" />
        <NavCard icon="shield" title="Enforcement" subtitle="Regulatory actions" onPress={() => navigation.navigate('FinanceEnforcement')} accent="#DC2626" />
        <NavCard icon="git-compare" title="Compare" subtitle="Side-by-side analysis" onPress={() => navigation.navigate('FinanceCompare')} accent="#8B5CF6" />
      </View>

      {/* Sector Distribution */}
      {stats && Object.keys(stats.by_sector).length > 0 && (
        <View style={styles.section}>
          <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
            <Text style={styles.sectionTitle}>By Sector Type</Text>
          </View>
          <View style={styles.sectorRow}>
            {Object.entries(stats.by_sector).map(([type, count]) => (
              <View key={type} style={[styles.sectorChip, { backgroundColor: (SECTOR_COLORS[type] || '#6B7280') + '15' }]}>
                <View style={[styles.sectorDot, { backgroundColor: SECTOR_COLORS[type] || '#6B7280' }]} />
                <Text style={[styles.sectorChipText, { color: SECTOR_COLORS[type] || '#6B7280' }]}>
                  {type.replace('_', ' ')} ({count})
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Featured Institutions */}
      <SectionHeader
        title="Featured Institutions"
        accent={ACCENT}
        onViewAll={() => navigation.navigate('InstitutionsDirectory')}
      />
      <View style={styles.featuredList}>
        {institutions.length === 0 ? (
          <EmptyState title="No institutions yet" message="Run the data sync to populate institutions." />
        ) : (
          institutions.map((inst) => {
            const sColor = SECTOR_COLORS[inst.sector_type] || '#6B7280';
            return (
              <TouchableOpacity
                key={inst.institution_id}
                style={styles.instCard}
                onPress={() => navigation.navigate('InstitutionDetail', { institution_id: inst.institution_id })}
                activeOpacity={0.7}
              >
                <View style={styles.instRow}>
                  {inst.logo_url ? (
                    <Image source={{ uri: inst.logo_url }} style={styles.instLogo} />
                  ) : (
                    <View style={[styles.instIconWrap, { backgroundColor: sColor + '15' }]}>
                      <Text style={[styles.instIconText, { color: sColor }]}>
                        {inst.ticker ? inst.ticker.substring(0, 2) : inst.display_name.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.instInfo}>
                    <Text style={styles.instName}>{inst.display_name}</Text>
                    <View style={styles.instMeta}>
                      {inst.ticker && <Text style={styles.instTicker}>{inst.ticker}</Text>}
                      <SectorTypeBadge sectorType={inst.sector_type} />
                    </View>
                    <Text style={styles.instStats}>
                      {inst.filing_count} filings · {inst.complaint_count} complaints
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={UI_COLORS.TEXT_MUTED} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Data from SEC EDGAR, FDIC BankFind, CFPB, Senate LDA, and USASpending.gov
        </Text>
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  sectionTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  sectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectorChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6,
  },
  sectorDot: { width: 8, height: 8, borderRadius: 4 },
  sectorChipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  featuredList: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  instCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  instLogo: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: '#F0F2EF',
  },
  instIconWrap: {
    width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  instIconText: { fontSize: 14, fontWeight: '800' },
  instInfo: { flex: 1, gap: 2 },
  instName: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 15, fontWeight: '700' },
  instMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  instTicker: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, fontWeight: '700' },
  instStats: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, marginTop: 2 },
  errorContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  errorText: { color: '#DC2626', fontSize: 14, marginTop: 12, textAlign: 'center' },
  retryBtn: {
    marginTop: 16, backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8,
  },
  retryText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  footer: { marginTop: 16, alignItems: 'center', paddingHorizontal: 24 },
  footerText: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, textAlign: 'center' },
});
