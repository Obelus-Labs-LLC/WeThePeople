import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { FinanceDashboardStats, Institution } from '../api/types';
import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';
import { SectorTypeBadge } from '../components/ui';
import SimpleBarChart from '../components/SimpleBarChart';
import type { BarChartDataPoint } from '../components/SimpleBarChart';

const SECTOR_COLORS: Record<string, string> = {
  bank: '#2563EB',
  investment: '#8B5CF6',
  insurance: '#F59E0B',
  fintech: '#10B981',
  central_bank: '#DC2626',
};

const ACCENT = '#D4A017';

export default function FinanceDashboardScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<FinanceDashboardStats | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractData, setContractData] = useState<BarChartDataPoint[]>([]);

  const loadData = async () => {
    try {
      const [statsRes, instRes, contractsRes] = await Promise.all([
        apiClient.getFinanceDashboardStats(),
        apiClient.getInstitutions({ limit: 6 }),
        fetch('https://api.wethepeopleforus.com/influence/top-contracts?limit=5')
          .then(r => r.ok ? r.json() : [])
          .catch(() => []),
      ]);
      setStats(statsRes);
      setInstitutions(instRes.institutions || []);
      setContractData(
        (contractsRes as any[]).map((d: any) => ({
          label: d.display_name?.length > 14 ? d.display_name.slice(0, 13) + '...' : d.display_name || '',
          value: d.total_contracts || 0,
        }))
      );
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
      {/* Hero */}
      <LinearGradient
        colors={['#D4A017', '#B8860B', '#8B6914']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="trending-up" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Finance Sector</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            SEC filings, FDIC financials, and consumer complaints
          </Text>
        </View>
      </LinearGradient>

      {/* Stats Grid */}
      {stats && (
        <View style={styles.statsGrid}>
          <View style={styles.statHalf}>
            <StatCard label="Institutions" value={stats.total_institutions} accent="gold" />
          </View>
          <View style={styles.statHalf}>
            <StatCard label="SEC Filings" value={stats.total_filings} accent="blue" />
          </View>
          <View style={styles.statHalf}>
            <StatCard label="FDIC Reports" value={stats.total_financials} accent="amber" />
          </View>
          <View style={styles.statHalf}>
            <StatCard label="Complaints" value={stats.total_complaints} accent="red" />
          </View>
        </View>
      )}

      {/* Top Contract Recipients chart */}
      {contractData.length > 0 && (
        <View style={styles.section}>
          <SimpleBarChart data={contractData} title="Top Contract Recipients" />
        </View>
      )}

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
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
            <Text style={styles.sectionTitle}>Featured Institutions</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('InstitutionsDirectory')}>
            <Text style={styles.seeAll}>See All →</Text>
          </TouchableOpacity>
        </View>

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
          Data from SEC EDGAR, FDIC BankFind, and CFPB
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  hero: {
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  heroOrb: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: {
    position: 'relative',
  },
  heroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 19,
  },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginBottom: 16, marginTop: 12,
  },
  statHalf: { width: '48%' as any, flexGrow: 1 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
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
  seeAll: { color: ACCENT, fontSize: 13, fontWeight: '600' },
  sectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectorChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6,
  },
  sectorDot: { width: 8, height: 8, borderRadius: 4 },
  sectorChipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
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
