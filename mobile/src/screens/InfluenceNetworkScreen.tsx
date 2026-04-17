import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { apiClient } from '../api/client';
const ACCENT = '#7C3AED';

// The `/influence/top-*` endpoints may return either a bare array or an
// object wrapping one of { leaders, results, data, companies }. We normalize
// everything to this internal shape so the UI doesn't care.
interface InfluenceItem {
  display_name: string;
  entity_id?: string;
  company_id?: string;
  sector?: string;
  total_amount: number;
}

function formatDollars(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function sectorColor(sector?: string): string {
  const map: Record<string, string> = {
    finance: '#10B981', health: '#F43F5E', technology: '#8B5CF6',
    energy: '#475569', defense: '#DC2626', agriculture: '#84CC16',
    chemicals: '#F59E0B', politics: '#2563EB',
  };
  return map[(sector || '').toLowerCase()] || '#9CA3AF';
}

function normalizeInfluenceList(raw: any): InfluenceItem[] {
  // Accept either a bare array or a common envelope.
  const list = Array.isArray(raw)
    ? raw
    : raw?.leaders || raw?.results || raw?.data || raw?.companies || [];
  return (list as any[]).map((r: any) => ({
    display_name: r.display_name || r.company || r.name || 'Unknown',
    entity_id: r.entity_id,
    company_id: r.company_id,
    sector: r.sector,
    // Lobbying rows carry `total_income`; contract rows carry `total_amount`.
    // Fall back across both so a single type works for both endpoints.
    total_amount: Number(r.total_amount ?? r.total_income ?? 0),
  }));
}

export default function InfluenceNetworkScreen() {
  const navigation = useNavigation<any>();
  const [lobbying, setLobbying] = useState<InfluenceItem[]>([]);
  const [contracts, setContracts] = useState<InfluenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedLobby, setExpandedLobby] = useState<number | null>(null);
  const [expandedContract, setExpandedContract] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [lobbyRaw, contractRaw] = await Promise.all([
        apiClient.getTopLobbying({ limit: 10 }),
        apiClient.getTopContracts({ limit: 10 }),
      ]);
      setLobbying(normalizeInfluenceList(lobbyRaw));
      setContracts(normalizeInfluenceList(contractRaw));
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load influence data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const toggleExpand = (type: 'lobby' | 'contract', idx: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (type === 'lobby') {
      setExpandedLobby(expandedLobby === idx ? null : idx);
    } else {
      setExpandedContract(expandedContract === idx ? null : idx);
    }
  };

  if (loading) return <LoadingSpinner message="Loading influence network..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  const lobbyMax = lobbying.length > 0 ? Math.max(...lobbying.map(i => i.total_amount || 0), 1) : 1;
  const contractMax = contracts.length > 0 ? Math.max(...contracts.map(i => i.total_amount || 0), 1) : 1;

  // Not every sector has a detail screen registered yet. Only these navigate.
  const SECTOR_DETAIL_ROUTE: Record<string, string> = {
    energy: 'EnergyCompanyDetail',
    transportation: 'TransportationCompanyDetail',
    defense: 'DefenseCompanyDetail',
    chemicals: 'ChemicalsCompanyDetail',
    agriculture: 'AgricultureCompanyDetail',
    telecom: 'TelecomCompanyDetail',
    education: 'EducationCompanyDetail',
    technology: 'TechCompanyDetail',
    health: 'CompanyDetail',
    finance: 'InstitutionDetail',
  };

  const navigateToCompany = (item: InfluenceItem) => {
    const sectorKey = (item.sector || '').toLowerCase();
    const route = SECTOR_DETAIL_ROUTE[sectorKey];
    const id = item.company_id || item.entity_id;
    if (!route || !id) return;
    // All detail screens accept company_id as the route param. Health's
    // CompanyDetail and Finance's InstitutionDetail use `id` in their existing
    // code, so we pass both to stay compatible without touching those screens.
    navigation.navigate(route, { company_id: id, id });
  };

  const renderItem = (
    item: InfluenceItem,
    idx: number,
    max: number,
    type: 'lobby' | 'contract',
    expanded: number | null,
  ) => {
    const pct = max > 0 ? ((item.total_amount || 0) / max) * 100 : 0;
    const isExpanded = expanded === idx;
    const sectorKey = (item.sector || '').toLowerCase();
    const canNav = Boolean(
      SECTOR_DETAIL_ROUTE[sectorKey] && (item.company_id || item.entity_id)
    );

    return (
      <TouchableOpacity
        key={`${type}-${idx}`}
        style={styles.itemCard}
        activeOpacity={0.8}
        onPress={() => toggleExpand(type, idx)}
      >
        <View style={styles.itemTopRow}>
          <View style={styles.itemInfo}>
            <Text style={styles.rankBadge}>#{idx + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.companyName} numberOfLines={1}>{item.display_name}</Text>
              {item.sector && (
                <View style={[styles.sectorBadge, { backgroundColor: sectorColor(item.sector) + '18', borderColor: sectorColor(item.sector) + '30' }]}>
                  <Text style={[styles.sectorText, { color: sectorColor(item.sector) }]}>{item.sector}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.amountText}>{formatDollars(item.total_amount || 0)}</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[ACCENT, '#6D28D9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${Math.max(pct, 2)}%` as any }]}
          />
        </View>

        {/* Expanded detail */}
        {isExpanded && (
          <View style={styles.expandedSection}>
            <View style={styles.expandedRow}>
              <Text style={styles.expandedLabel}>Company</Text>
              <Text style={styles.expandedValue}>{item.display_name}</Text>
            </View>
            <View style={styles.expandedRow}>
              <Text style={styles.expandedLabel}>Sector</Text>
              <Text style={styles.expandedValue}>{item.sector || 'N/A'}</Text>
            </View>
            <View style={styles.expandedRow}>
              <Text style={styles.expandedLabel}>Total Amount</Text>
              <Text style={styles.expandedValue}>${(item.total_amount || 0).toLocaleString()}</Text>
            </View>
            <View style={styles.expandedRow}>
              <Text style={styles.expandedLabel}>Relative Share</Text>
              <Text style={styles.expandedValue}>{pct.toFixed(1)}% of top spender</Text>
            </View>
            {canNav && (
              <TouchableOpacity
                style={styles.viewProfileBtn}
                onPress={() => navigateToCompany(item)}
                activeOpacity={0.85}
              >
                <Ionicons name="open-outline" size={14} color="#FFFFFF" />
                <Text style={styles.viewProfileText}>View company profile</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.expandHint}>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={UI_COLORS.TEXT_MUTED}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#7C3AED', '#6D28D9', '#5B21B6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="git-network" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Influence Network</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Top lobbying spenders and federal contract recipients across all sectors
          </Text>
          <View style={styles.heroStatRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{lobbying.length}</Text>
              <Text style={styles.heroStatLabel}>Top Lobbyists</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{contracts.length}</Text>
              <Text style={styles.heroStatLabel}>Top Contractors</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Top Lobbying Spenders */}
      <View style={styles.section}>
        <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
          <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
          <Text style={styles.sectionTitle}>Top Lobbying Spenders</Text>
        </View>

        {lobbying.length === 0 ? (
          <EmptyState title="No Data" message="No lobbying data available." />
        ) : (
          lobbying.map((item, idx) => renderItem(item, idx, lobbyMax, 'lobby', expandedLobby))
        )}
      </View>

      {/* Top Contract Recipients */}
      <View style={styles.section}>
        <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
          <View style={[styles.accentBar, { backgroundColor: '#6D28D9' }]} />
          <Text style={styles.sectionTitle}>Top Contract Recipients</Text>
        </View>

        {contracts.length === 0 ? (
          <EmptyState title="No Data" message="No contract data available." />
        ) : (
          contracts.map((item, idx) => renderItem(item, idx, contractMax, 'contract', expandedContract))
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: Federal lobbying disclosures & USAspending.gov</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  hero: {
    borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12,
    overflow: 'hidden', position: 'relative',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180,
    borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  heroStatRow: { flexDirection: 'row', gap: 24 },
  heroStat: {},
  heroStatValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  section: { paddingHorizontal: 16, marginTop: 12, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  itemCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  itemInfo: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: 12, gap: 8 },
  rankBadge: { fontSize: 12, fontWeight: '800', color: ACCENT, marginTop: 2 },
  companyName: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },
  sectorBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1,
  },
  sectorText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  amountText: { fontSize: 16, fontWeight: '800', color: ACCENT },
  progressTrack: {
    height: 6, backgroundColor: UI_COLORS.BORDER_LIGHT, borderRadius: 3, overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  expandHint: { alignItems: 'center', marginTop: 2 },
  expandedSection: {
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER_LIGHT,
  },
  expandedRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  expandedLabel: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  expandedValue: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  viewProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#7C3AED', borderRadius: 8, paddingVertical: 8,
    marginTop: 10,
  },
  viewProfileText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
