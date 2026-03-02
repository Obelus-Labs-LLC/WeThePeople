import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { HealthDashboardStats, Company } from '../api/types';
import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';

const SECTOR_COLORS: Record<string, string> = {
  pharma: '#2563EB',
  biotech: '#8B5CF6',
  insurer: '#F59E0B',
  pharmacy: '#10B981',
  distributor: '#64748B',
};

const ACCENT = '#DC2626';

export default function HealthDashboardScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<HealthDashboardStats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [statsRes, compRes] = await Promise.all([
        apiClient.getHealthDashboardStats(),
        apiClient.getCompanies({ limit: 6 }),
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

  if (loading) return <LoadingSpinner message="Loading health data..." />;
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
        colors={['#DC2626', '#B91C1C', '#991B1B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="heart" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Health Sector</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            FDA recalls, adverse events, and clinical trials
          </Text>
        </View>
      </LinearGradient>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statHalf}>
          <StatCard label="Companies" value={stats.total_companies} accent="red" />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Adverse Events" value={stats.total_adverse_events} accent="rose" />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Recalls" value={stats.total_recalls} accent="amber" />
        </View>
        <View style={styles.statHalf}>
          <StatCard label="Clinical Trials" value={stats.total_trials} accent="emerald" />
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
          <TouchableOpacity onPress={() => navigation.navigate('CompaniesDirectory')}>
            <Text style={styles.seeAll}>See All →</Text>
          </TouchableOpacity>
        </View>
        {companies.map((c) => (
          <TouchableOpacity
            key={c.company_id}
            style={styles.companyCard}
            onPress={() => navigation.navigate('CompanyDetail', { company_id: c.company_id })}
          >
            <View style={[styles.iconWrap, { backgroundColor: (SECTOR_COLORS[c.sector_type] || '#6B7280') + '15' }]}>
              <Ionicons name="medkit" size={20} color={SECTOR_COLORS[c.sector_type] || '#6B7280'} />
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
                {c.adverse_event_count} events · {c.recall_count} recalls · {c.trial_count} trials
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={UI_COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: FDA openFDA · ClinicalTrials.gov · CMS Open Payments</Text>
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
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
