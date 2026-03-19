import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS, ACCENT_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { StatCard, LoadingSpinner, EmptyState } from '../components/ui';
import type { ContractItem } from '../api/types';

type Sector = 'finance' | 'health' | 'tech' | 'energy';

interface SectorContractsScreenProps {
  route?: { params?: { sector?: Sector } };
}

const SECTOR_CONFIG: Record<Sector, { label: string; accent: string; gradient: [string, string]; icon: string }> = {
  finance: { label: 'Finance', accent: '#10B981', gradient: ['#10B981', '#0F766E'], icon: 'trending-up' },
  health: { label: 'Health', accent: '#F43F5E', gradient: ['#F43F5E', '#BE185D'], icon: 'heart' },
  tech: { label: 'Technology', accent: '#8B5CF6', gradient: ['#8B5CF6', '#7C3AED'], icon: 'hardware-chip' },
  energy: { label: 'Energy', accent: '#475569', gradient: ['#475569', '#3F3F46'], icon: 'flash' },
};

function fmtDollar(val: number | null): string {
  if (val == null) return '$0';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function fmtDate(d: string | null): string {
  if (!d) return 'N/A';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

export default function SectorContractsScreen({ route }: SectorContractsScreenProps) {
  const sector: Sector = route?.params?.sector || 'tech';
  const config = SECTOR_CONFIG[sector];

  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchContracts = useCallback(async () => {
    try {
      // Fetch companies first, then contracts for each
      let allContracts: ContractItem[] = [];
      let companies: { id: string; name: string }[] = [];

      if (sector === 'finance') {
        const res = await apiClient.getInstitutions({ limit: 50 });
        companies = res.institutions.map(i => ({ id: i.institution_id, name: i.display_name }));
      } else if (sector === 'health') {
        const res = await apiClient.getCompanies({ limit: 50 });
        companies = res.companies.map(c => ({ id: c.company_id, name: c.display_name }));
      } else if (sector === 'tech') {
        const res = await apiClient.getTechCompanies({ limit: 50 });
        companies = res.companies.map(c => ({ id: c.company_id, name: c.display_name }));
      } else if (sector === 'energy') {
        const res = await apiClient.getEnergyCompanies({ limit: 50 });
        companies = res.companies.map(c => ({ id: c.company_id, name: c.display_name }));
      }

      // Fetch contracts for top companies (batch, limit to 10 to avoid overload)
      const topCompanies = companies.slice(0, 10);
      const results = await Promise.allSettled(
        topCompanies.map(async (c) => {
          let res;
          if (sector === 'finance') res = await apiClient.getInstitutionContracts(c.id, { limit: 20 });
          else if (sector === 'health') res = await apiClient.getHealthCompanyContracts(c.id, { limit: 20 });
          else if (sector === 'tech') res = await apiClient.getTechCompanyContracts(c.id, { limit: 20 });
          else res = await apiClient.getEnergyCompanyContracts(c.id, { limit: 20 });
          return (res?.contracts || []).map((ct: ContractItem) => ({ ...ct, _companyName: c.name }));
        })
      );

      results.forEach(r => {
        if (r.status === 'fulfilled') allContracts.push(...r.value);
      });

      // Sort by award_amount descending
      allContracts.sort((a, b) => (b.award_amount || 0) - (a.award_amount || 0));
      setContracts(allContracts);
    } catch (e) {
      console.error('Failed to load contracts:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sector]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const onRefresh = () => { setRefreshing(true); fetchContracts(); };

  // Stats
  const totalValue = contracts.reduce((s, c) => s + (c.award_amount || 0), 0);
  const agencies = new Set(contracts.map(c => c.awarding_agency).filter(Boolean));

  if (loading) return <LoadingSpinner message="Loading contracts..." />;

  const renderContract = ({ item }: { item: any }) => {
    const expanded = expandedId === item.id;
    return (
      <TouchableOpacity
        style={styles.contractCard}
        onPress={() => setExpandedId(expanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.contractHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.contractCompany}>{item._companyName || 'Unknown'}</Text>
            <Text style={[styles.contractAmount, { color: config.accent }]}>
              {fmtDollar(item.award_amount)}
            </Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={UI_COLORS.TEXT_MUTED} />
        </View>
        {item.awarding_agency && (
          <Text style={styles.contractAgency}>{item.awarding_agency}</Text>
        )}
        <Text style={styles.contractDesc} numberOfLines={expanded ? undefined : 2}>
          {item.description || 'No description available'}
        </Text>
        <Text style={styles.contractDate}>
          {fmtDate(item.start_date)} — {fmtDate(item.end_date)}
        </Text>
        {expanded && item.source_url && (
          <Text style={[styles.sourceLink, { color: config.accent }]}>View source</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={contracts}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      renderItem={renderContract}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={config.accent} />}
      ListHeaderComponent={
        <>
          <LinearGradient colors={config.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroOrb} />
            <View style={styles.heroInner}>
              <View style={styles.heroIconRow}>
                <Ionicons name="document-text" size={24} color="#FFFFFF" />
                <Text style={styles.heroTitle}>{config.label} Contracts</Text>
              </View>
              <Text style={styles.heroSubtitle}>Government contracts awarded to {config.label.toLowerCase()} sector companies</Text>
            </View>
          </LinearGradient>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Total Value" value={fmtDollar(totalValue)} accent={config.accent} />
            </View>
            <View style={styles.statItem}>
              <StatCard label="Contracts" value={contracts.length} accent="gold" />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Agencies" value={agencies.size} accent="blue" />
            </View>
            <View style={styles.statItem} />
          </View>
        </>
      }
      ListEmptyComponent={<EmptyState title="No contracts found" message="No government contracts data available for this sector yet." />}
    />
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
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 10 },
  statItem: { flex: 1 },
  contractCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginHorizontal: 16, marginTop: 10,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  contractHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  contractCompany: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 2 },
  contractAmount: { fontSize: 18, fontWeight: '800' },
  contractAgency: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginTop: 4 },
  contractDesc: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 18, marginTop: 6 },
  contractDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 6 },
  sourceLink: { fontSize: 13, fontWeight: '600', marginTop: 8 },
});
