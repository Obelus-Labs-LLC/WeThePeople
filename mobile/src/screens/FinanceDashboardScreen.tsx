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
import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';
import { SectorTypeBadge } from '../components/ui';

const SECTOR_COLORS: Record<string, string> = {
  bank: '#2563EB',
  investment: '#8B5CF6',
  insurance: '#F59E0B',
  fintech: '#10B981',
  central_bank: '#DC2626',
};

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroIconWrap}>
          <Ionicons name="trending-up" size={28} color="#10B981" />
        </View>
        <Text style={styles.heroTitle}>Finance Sector</Text>
        <Text style={styles.heroSubtitle}>
          SEC filings, FDIC financials, and consumer complaints
        </Text>
      </View>

      {/* Stats Grid */}
      {stats && (
        <View style={styles.statsGrid}>
          <View style={styles.statHalf}>
            <StatCard label="Institutions" value={stats.total_institutions} accent="green" />
          </View>
          <View style={styles.statHalf}>
            <StatCard label="SEC Filings" value={stats.total_filings} accent="blue" />
          </View>
          <View style={styles.statHalf}>
            <StatCard label="FDIC Reports" value={stats.total_financials} accent="gold" />
          </View>
          <View style={styles.statHalf}>
            <StatCard label="Complaints" value={stats.total_complaints} accent="red" />
          </View>
        </View>
      )}

      {/* Sector Distribution */}
      {stats && Object.keys(stats.by_sector).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Sector Type</Text>
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
          <Text style={styles.sectionTitle}>Featured Institutions</Text>
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
    alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20,
    backgroundColor: UI_COLORS.HERO_BG,
  },
  heroIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#10B981' + '15',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  heroTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 24, fontWeight: '800', marginBottom: 6 },
  heroSubtitle: {
    color: UI_COLORS.TEXT_SECONDARY, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320,
  },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginBottom: 16, marginTop: 4,
  },
  statHalf: { width: '48%' as any, flexGrow: 1 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  seeAll: { color: UI_COLORS.ACCENT, fontSize: 13, fontWeight: '600', marginBottom: 10 },
  sectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectorChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6,
  },
  sectorDot: { width: 8, height: 8, borderRadius: 4 },
  sectorChipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  instCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
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
    marginTop: 16, backgroundColor: UI_COLORS.ACCENT, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8,
  },
  retryText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  footer: { marginTop: 16, alignItems: 'center', paddingHorizontal: 24 },
  footerText: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, textAlign: 'center' },
});
