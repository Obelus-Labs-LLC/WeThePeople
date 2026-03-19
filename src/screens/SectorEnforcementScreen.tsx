import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { StatCard, LoadingSpinner, EmptyState } from '../components/ui';
import type { EnforcementAction } from '../api/types';

type Sector = 'finance' | 'health' | 'tech' | 'energy';
type Severity = 'all' | 'severe' | 'moderate' | 'minor';

interface SectorEnforcementScreenProps {
  route?: { params?: { sector?: Sector } };
}

const SECTOR_CONFIG: Record<Sector, { label: string; accent: string; gradient: [string, string] }> = {
  finance: { label: 'Finance', accent: '#10B981', gradient: ['#10B981', '#0F766E'] },
  health: { label: 'Health', accent: '#F43F5E', gradient: ['#F43F5E', '#BE185D'] },
  tech: { label: 'Technology', accent: '#8B5CF6', gradient: ['#8B5CF6', '#7C3AED'] },
  energy: { label: 'Energy', accent: '#475569', gradient: ['#475569', '#3F3F46'] },
};

const SEVERITY_COLORS: Record<string, string> = { severe: '#DC2626', moderate: '#F59E0B', minor: '#10B981' };

function classifySeverity(action: EnforcementAction): Severity {
  const penalty = action.penalty_amount || 0;
  if (penalty >= 1_000_000) return 'severe';
  if (penalty >= 100_000) return 'moderate';
  return 'minor';
}

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

export default function SectorEnforcementScreen({ route }: SectorEnforcementScreenProps) {
  const sector: Sector = route?.params?.sector || 'tech';
  const config = SECTOR_CONFIG[sector];

  const [actions, setActions] = useState<(EnforcementAction & { _companyName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Severity>('all');

  const fetchActions = useCallback(async () => {
    try {
      let allActions: (EnforcementAction & { _companyName?: string })[] = [];
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

      const topCompanies = companies.slice(0, 10);
      const results = await Promise.allSettled(
        topCompanies.map(async (c) => {
          let res;
          if (sector === 'finance') res = await apiClient.getInstitutionEnforcement(c.id, { limit: 20 });
          else if (sector === 'health') res = await apiClient.getHealthCompanyEnforcement(c.id, { limit: 20 });
          else if (sector === 'tech') res = await apiClient.getTechCompanyEnforcement(c.id, { limit: 20 });
          else res = await apiClient.getEnergyCompanyEnforcement(c.id, { limit: 20 });
          return (res?.actions || []).map((a: EnforcementAction) => ({ ...a, _companyName: c.name }));
        })
      );

      results.forEach(r => {
        if (r.status === 'fulfilled') allActions.push(...r.value);
      });

      allActions.sort((a, b) => (b.penalty_amount || 0) - (a.penalty_amount || 0));
      setActions(allActions);
    } catch (e) {
      console.error('Failed to load enforcement actions:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sector]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  const onRefresh = () => { setRefreshing(true); fetchActions(); };

  const filtered = filter === 'all' ? actions : actions.filter(a => classifySeverity(a) === filter);
  const totalPenalties = actions.reduce((s, a) => s + (a.penalty_amount || 0), 0);
  const severeCount = actions.filter(a => classifySeverity(a) === 'severe').length;

  if (loading) return <LoadingSpinner message="Loading enforcement actions..." />;

  const renderAction = ({ item }: { item: EnforcementAction & { _companyName?: string } }) => {
    const severity = classifySeverity(item);
    const sevColor = SEVERITY_COLORS[severity];
    const expanded = expandedId === item.id;

    return (
      <TouchableOpacity
        style={styles.actionCard}
        onPress={() => setExpandedId(expanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.actionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionCompany}>{item._companyName || 'Unknown'}</Text>
            <Text style={styles.actionTitle} numberOfLines={expanded ? undefined : 2}>{item.case_title}</Text>
          </View>
          <View style={[styles.severityBadge, { backgroundColor: sevColor + '15', borderColor: sevColor + '30' }]}>
            <Text style={[styles.severityText, { color: sevColor }]}>
              {severity.charAt(0).toUpperCase() + severity.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.actionMeta}>
          {item.penalty_amount != null && item.penalty_amount > 0 && (
            <Text style={[styles.actionPenalty, { color: config.accent }]}>{fmtDollar(item.penalty_amount)}</Text>
          )}
          <Text style={styles.actionDate}>{fmtDate(item.case_date)}</Text>
        </View>

        {expanded && (
          <View style={styles.expandedContent}>
            {item.description && <Text style={styles.actionDesc}>{item.description}</Text>}
            {item.case_url && (
              <TouchableOpacity onPress={() => Linking.openURL(item.case_url!)}>
                <Text style={[styles.sourceLink, { color: config.accent }]}>View source document</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const FilterPill = ({ label, value }: { label: string; value: Severity }) => (
    <TouchableOpacity
      style={[styles.pill, filter === value && { backgroundColor: config.accent + '18', borderColor: config.accent + '40' }]}
      onPress={() => setFilter(value)}
    >
      <Text style={[styles.pillText, filter === value && { color: config.accent }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={filtered}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      renderItem={renderAction}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={config.accent} />}
      ListHeaderComponent={
        <>
          <LinearGradient colors={config.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroOrb} />
            <View style={styles.heroInner}>
              <View style={styles.heroIconRow}>
                <Ionicons name="shield-checkmark" size={24} color="#FFFFFF" />
                <Text style={styles.heroTitle}>{config.label} Enforcement</Text>
              </View>
              <Text style={styles.heroSubtitle}>Regulatory enforcement actions against {config.label.toLowerCase()} sector companies</Text>
            </View>
          </LinearGradient>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Total Actions" value={actions.length} accent={config.accent} />
            </View>
            <View style={styles.statItem}>
              <StatCard label="Total Penalties" value={fmtDollar(totalPenalties)} accent="red" />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard label="Severe" value={severeCount} accent="amber" />
            </View>
            <View style={styles.statItem} />
          </View>

          <View style={styles.filterRow}>
            <FilterPill label="All" value="all" />
            <FilterPill label="Severe" value="severe" />
            <FilterPill label="Moderate" value="moderate" />
            <FilterPill label="Minor" value="minor" />
          </View>
        </>
      }
      ListEmptyComponent={<EmptyState title="No enforcement actions" message="No enforcement data available for this sector yet." />}
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
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 14, marginBottom: 4 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: UI_COLORS.CARD_BG, borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  actionCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginHorizontal: 16, marginTop: 10,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  actionCompany: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 2 },
  actionTitle: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 18 },
  severityBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  severityText: { fontSize: 11, fontWeight: '600' },
  actionMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  actionPenalty: { fontSize: 16, fontWeight: '800' },
  actionDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  expandedContent: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER },
  actionDesc: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 19 },
  sourceLink: { fontSize: 13, fontWeight: '600', marginTop: 8 },
});
