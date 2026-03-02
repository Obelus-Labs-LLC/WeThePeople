import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { TechDashboardStats, TechCompany } from '../api/types';
import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';

const SECTOR_COLORS: Record<string, string> = {
  platform: '#8B5CF6',
  enterprise: '#2563EB',
  semiconductor: '#F59E0B',
  automotive: '#10B981',
  media: '#EC4899',
};

const ACCENT = '#2563EB';

export default function TechDashboardScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<TechDashboardStats | null>(null);
  const [companies, setCompanies] = useState<TechCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [statsRes, compRes] = await Promise.all([
        apiClient.getTechDashboardStats(),
        apiClient.getTechCompanies({ limit: 6 }),
      ]);
      setStats(statsRes);
      setCompanies(compRes.companies || []);
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

  if (loading) return <LoadingSpinner message="Loading tech data..." />;
  if (error) return <EmptyState title="Error" message={error} />;
  if (!stats) return <EmptyState title="No Data" />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
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
            <Ionicons name="hardware-chip" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Technology Sector</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Patents, SEC filings, contracts, lobbying, enforcement
          </Text>
        </View>
      </LinearGradient>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statHalf}>
          <StatCard label="Companies" value={stats.total_companies} accent="blue" />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Patents" value={stats.total_patents} accent="amber" />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="SEC Filings" value={stats.total_filings} accent="purple" />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Gov Contracts" value={stats.total_contracts} accent="emerald" />
        </View>
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
                  {key} ({count})
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Featured Companies */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
            <Text style={styles.sectionTitle}>Featured Companies</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('TechCompaniesDirectory')}>
            <Text style={styles.seeAll}>See All →</Text>
          </TouchableOpacity>
        </View>
        {companies.map((c) => (
          <TouchableOpacity
            key={c.company_id}
            style={styles.companyCard}
            onPress={() => navigation.navigate('TechCompanyDetail', { company_id: c.company_id })}
          >
            <View style={[styles.iconWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '15' }]}>
              <Ionicons name="hardware-chip" size={20} color={SECTOR_COLORS[c.sector_type] || '#6B7280'} />
            </View>
            <View style={styles.companyInfo}>
              <Text style={styles.companyName} numberOfLines={1}>{c.display_name}</Text>
              <View style={styles.companyMeta}>
                {c.ticker && <Text style={styles.ticker}>{c.ticker}</Text>}
                <View style={[styles.badge, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '12', borderColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '25' }]}>
                  <Text style={[styles.badgeText, { color: SECTOR_COLORS[c.sector_type] || '#6B7280' }]}>{c.sector_type}</Text>
                </View>
              </View>
              <Text style={styles.companyStats}>
                {c.patent_count} patents · {c.contract_count} contracts · {c.filing_count} filings
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Compare CTA */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.compareCta}
          onPress={() => navigation.navigate('TechCompare')}
        >
          <Ionicons name="git-compare-outline" size={20} color="#fff" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.compareCtaTitle}>Compare Companies</Text>
            <Text style={styles.compareCtaSub}>Side-by-side patents, contracts, lobbying, penalties</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: USPTO PatentsView · SEC EDGAR · USASpending.gov · Senate LDA · FTC</Text>
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
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginTop: 12, marginBottom: 16,
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  seeAll: { fontSize: 13, fontWeight: '600', color: ACCENT },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, gap: 6 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
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
  compareCta: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: ACCENT, borderRadius: 12, padding: 16,
  },
  compareCtaTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  compareCtaSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
