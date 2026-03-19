import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { Company, ClinicalTrialItem } from '../api/types';
import { LoadingSpinner, EmptyState, StatCard } from '../components/ui';
import PillTabBar from '../components/PillTabBar';
import { FilterPillGroup } from '../components/FilterPillGroup';
import SectionHeader from '../components/SectionHeader';

const PHASE_TABS = [
  { key: 'all', label: 'All Phases' },
  { key: 'Phase 1', label: 'Phase 1' },
  { key: 'Phase 2', label: 'Phase 2' },
  { key: 'Phase 3', label: 'Phase 3' },
  { key: 'Phase 4', label: 'Phase 4' },
];

const STATUS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'Recruiting', label: 'Recruiting' },
  { key: 'Active', label: 'Active' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Terminated', label: 'Terminated' },
];

const PHASE_COLORS: Record<string, string> = {
  'Phase 1': '#2563EB',
  'Phase 2': '#8B5CF6',
  'Phase 3': '#F59E0B',
  'Phase 4': '#10B981',
};

const STATUS_COLORS: Record<string, string> = {
  Recruiting: '#10B981',
  'Active, not recruiting': '#2563EB',
  Completed: '#6B7280',
  Terminated: '#DC2626',
  Withdrawn: '#F59E0B',
  Suspended: '#EA580C',
  'Not yet recruiting': '#8B5CF6',
};

interface TrialWithCompany extends ClinicalTrialItem {
  company_name: string;
  company_id: string;
}

export default function ClinicalPipelineScreen() {
  const [trials, setTrials] = useState<TrialWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = async () => {
    // Fetch all tracked health companies then their trials
    const companiesRes = await apiClient.getCompanies({ limit: 200 });
    const companies = companiesRes.companies || [];

    // Fetch trials for top companies (by trial count)
    const topCompanies = companies
      .filter((c) => c.trial_count > 0)
      .sort((a, b) => b.trial_count - a.trial_count)
      .slice(0, 20);

    const allTrials: TrialWithCompany[] = [];

    await Promise.all(
      topCompanies.map(async (company) => {
        try {
          const res = await apiClient.getCompanyTrials(company.company_id, { limit: 50 });
          const items = (res.trials || []).map((t) => ({
            ...t,
            company_name: company.display_name,
            company_id: company.company_id,
          }));
          allTrials.push(...items);
        } catch {}
      })
    );

    setTrials(allTrials);
  };

  useEffect(() => {
    setLoading(true);
    loadData()
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadData(); } catch {}
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    let result = trials;
    if (phaseFilter !== 'all') {
      result = result.filter((t) => t.phase?.includes(phaseFilter));
    }
    if (statusFilter !== 'all') {
      result = result.filter((t) =>
        t.overall_status?.toLowerCase().includes(statusFilter.toLowerCase())
      );
    }
    return result;
  }, [trials, phaseFilter, statusFilter]);

  const companyBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    trials.forEach((t) => {
      counts[t.company_name] = (counts[t.company_name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
  }, [trials]);

  if (loading) return <LoadingSpinner message="Loading clinical trials..." />;

  const renderTrial = ({ item }: { item: TrialWithCompany }) => {
    const phaseColor = PHASE_COLORS[item.phase || ''] || '#6B7280';
    const statusColor = STATUS_COLORS[item.overall_status || ''] || '#6B7280';
    const conditions = item.conditions?.split(';').map((c) => c.trim()).filter(Boolean) || [];

    return (
      <View style={styles.card}>
        <Text style={styles.trialTitle} numberOfLines={2}>{item.title || 'Untitled Trial'}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.nctId}>{item.nct_id}</Text>
          <Text style={styles.sponsor} numberOfLines={1}>{item.company_name}</Text>
        </View>

        <View style={styles.badgeRow}>
          {item.phase && (
            <View style={[styles.badge, { backgroundColor: phaseColor + '15', borderColor: phaseColor + '30' }]}>
              <Text style={[styles.badgeText, { color: phaseColor }]}>{item.phase}</Text>
            </View>
          )}
          {item.overall_status && (
            <View style={[styles.badge, { backgroundColor: statusColor + '15', borderColor: statusColor + '30' }]}>
              <Text style={[styles.badgeText, { color: statusColor }]} numberOfLines={1}>
                {item.overall_status}
              </Text>
            </View>
          )}
          {item.enrollment != null && (
            <View style={styles.enrollBadge}>
              <Ionicons name="people-outline" size={10} color={UI_COLORS.TEXT_MUTED} />
              <Text style={styles.enrollText}>{item.enrollment.toLocaleString()}</Text>
            </View>
          )}
        </View>

        {conditions.length > 0 && (
          <View style={styles.tagsRow}>
            {conditions.slice(0, 3).map((cond, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText} numberOfLines={1}>{cond}</Text>
              </View>
            ))}
            {conditions.length > 3 && (
              <Text style={styles.moreTag}>+{conditions.length - 3}</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const ListFooter = () => {
    if (companyBreakdown.length === 0) return null;
    return (
      <View style={styles.breakdownSection}>
        <SectionHeader title="Company Breakdown" accent="#8B5CF6" />
        {companyBreakdown.map(([name, count]) => (
          <View key={name} style={styles.breakdownRow}>
            <Text style={styles.breakdownName} numberOfLines={1}>{name}</Text>
            <View style={styles.breakdownBarWrap}>
              <View style={[styles.breakdownBar, { flex: count / (companyBreakdown[0]?.[1] || 1) }]} />
            </View>
            <Text style={styles.breakdownCount}>{count}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <PillTabBar
        tabs={PHASE_TABS}
        activeTab={phaseFilter}
        onTabChange={setPhaseFilter}
        accentColor="#8B5CF6"
      />

      <View style={styles.statusRow}>
        <FilterPillGroup options={STATUS_OPTIONS} selected={statusFilter} onSelect={setStatusFilter} scrollable />
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Total Trials" value={trials.length} accent="purple" />
        <StatCard label="Showing" value={filtered.length} accent="blue" />
      </View>

      {error ? (
        <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
      ) : filtered.length === 0 ? (
        <EmptyState title="No trials found" message="Try adjusting your phase or status filters." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => `${t.company_id}-${t.nct_id}`}
          renderItem={renderTrial}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
          ListFooterComponent={ListFooter}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  statusRow: { paddingHorizontal: 16, marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  trialTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 14, fontWeight: '700', lineHeight: 19, marginBottom: 6 },
  metaRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 },
  nctId: { color: UI_COLORS.ACCENT, fontSize: 11, fontWeight: '700' },
  sponsor: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, flex: 1 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  enrollBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  enrollText: { color: UI_COLORS.TEXT_MUTED, fontSize: 10 },
  tagsRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 4 },
  tag: {
    backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  tagText: { color: UI_COLORS.TEXT_MUTED, fontSize: 9 },
  moreTag: { color: UI_COLORS.TEXT_MUTED, fontSize: 9, alignSelf: 'center' },
  breakdownSection: {
    marginTop: 20,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  breakdownName: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, width: 100 },
  breakdownBarWrap: { flex: 1, height: 8, backgroundColor: UI_COLORS.BORDER_LIGHT, borderRadius: 4, overflow: 'hidden' },
  breakdownBar: { height: '100%', backgroundColor: '#8B5CF6', borderRadius: 4 },
  breakdownCount: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 12, fontWeight: '700', minWidth: 30, textAlign: 'right' },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14 },
});
