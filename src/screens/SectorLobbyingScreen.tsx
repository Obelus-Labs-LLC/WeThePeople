import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { LobbyingFiling } from '../api/types';
import { LoadingSpinner, EmptyState, StatCard } from '../components/ui';
import SectionHeader from '../components/SectionHeader';

type SectorParam = 'finance' | 'health' | 'tech' | 'energy';

const SECTOR_ACCENTS: Record<SectorParam, string> = {
  finance: '#10B981',
  health: '#E11D48',
  tech: '#8B5CF6',
  energy: '#475569',
};

const SECTOR_LABELS: Record<SectorParam, string> = {
  finance: 'Finance',
  health: 'Health',
  tech: 'Technology',
  energy: 'Energy',
};

function formatCurrency(val: number | null): string {
  if (val == null) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

interface GroupedIssue {
  issue: string;
  totalIncome: number;
  filings: LobbyingFiling[];
}

export default function SectorLobbyingScreen() {
  const route = useRoute<any>();
  const sector: SectorParam = route.params?.sector || 'finance';
  const accent = SECTOR_ACCENTS[sector] || UI_COLORS.ACCENT;
  const sectorLabel = SECTOR_LABELS[sector] || sector;

  const [filings, setFilings] = useState<LobbyingFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  const loadData = async () => {
    let allFilings: LobbyingFiling[] = [];

    // Fetch entities for the sector, then their lobbying data
    try {
      let entities: Array<{ id: string; name: string }> = [];

      if (sector === 'finance') {
        const res = await apiClient.getInstitutions({ limit: 50 });
        entities = (res.institutions || []).map((i) => ({ id: i.institution_id, name: i.display_name }));
      } else if (sector === 'health') {
        const res = await apiClient.getCompanies({ limit: 50 });
        entities = (res.companies || []).map((c) => ({ id: c.company_id, name: c.display_name }));
      } else if (sector === 'tech') {
        const res = await apiClient.getTechCompanies({ limit: 50 });
        entities = (res.companies || []).map((c) => ({ id: c.company_id, name: c.display_name }));
      } else if (sector === 'energy') {
        const res = await apiClient.getEnergyCompanies({ limit: 50 });
        entities = (res.companies || []).map((c) => ({ id: c.company_id, name: c.display_name }));
      }

      // Fetch lobbying for top 15 entities (to avoid too many requests)
      const topEntities = entities.slice(0, 15);
      const results = await Promise.all(
        topEntities.map(async (entity) => {
          try {
            let res: any;
            if (sector === 'finance') {
              res = await apiClient.getInstitutionLobbying(entity.id, { limit: 20 });
            } else if (sector === 'health') {
              res = await apiClient.getHealthCompanyLobbying(entity.id, { limit: 20 });
            } else if (sector === 'tech') {
              res = await apiClient.getTechCompanyLobbying(entity.id, { limit: 20 });
            } else if (sector === 'energy') {
              res = await apiClient.getEnergyCompanyLobbying(entity.id, { limit: 20 });
            }
            return res?.filings || [];
          } catch {
            return [];
          }
        })
      );

      allFilings = results.flat();
    } catch (err: any) {
      throw err;
    }

    setFilings(allFilings);
  };

  useEffect(() => {
    setLoading(true);
    loadData()
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [sector]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadData(); } catch {}
    setRefreshing(false);
  };

  const stats = useMemo(() => {
    const totalSpend = filings.reduce((sum, f) => sum + (f.income || 0), 0);
    const uniqueClients = new Set(filings.map((f) => f.client_name).filter(Boolean)).size;
    return { total: filings.length, totalSpend, uniqueClients };
  }, [filings]);

  const grouped = useMemo(() => {
    const issueMap: Record<string, GroupedIssue> = {};
    filings.forEach((f) => {
      const issues = f.lobbying_issues?.split(';').map((s) => s.trim()) || ['Unknown'];
      issues.forEach((issue) => {
        if (!issue) return;
        if (!issueMap[issue]) {
          issueMap[issue] = { issue, totalIncome: 0, filings: [] };
        }
        issueMap[issue].totalIncome += f.income || 0;
        issueMap[issue].filings.push(f);
      });
    });
    return Object.values(issueMap).sort((a, b) => b.totalIncome - a.totalIncome);
  }, [filings]);

  const toggleIssue = (issue: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issue)) next.delete(issue);
      else next.add(issue);
      return next;
    });
  };

  if (loading) return <LoadingSpinner message={`Loading ${sectorLabel} lobbying...`} />;

  const renderIssueGroup = ({ item }: { item: GroupedIssue }) => {
    const expanded = expandedIssues.has(item.issue);
    return (
      <View style={styles.issueCard}>
        <TouchableOpacity
          style={styles.issueHeader}
          onPress={() => toggleIssue(item.issue)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.issueName} numberOfLines={2}>{item.issue}</Text>
            <Text style={styles.issueStats}>
              {item.filings.length} filings · {formatCurrency(item.totalIncome)}
            </Text>
          </View>
          <View style={[styles.incomeWrap, { backgroundColor: accent + '15' }]}>
            <Text style={[styles.incomeText, { color: accent }]}>{formatCurrency(item.totalIncome)}</Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={UI_COLORS.TEXT_MUTED}
          />
        </TouchableOpacity>

        {expanded && (
          <View style={styles.filingsList}>
            {item.filings.slice(0, 10).map((f) => (
              <View key={f.id} style={styles.filingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filingClient} numberOfLines={1}>
                    {f.client_name || 'Unknown client'}
                  </Text>
                  {f.registrant_name && (
                    <Text style={styles.filingRegistrant} numberOfLines={1}>
                      via {f.registrant_name}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.filingIncome}>{formatCurrency(f.income)}</Text>
                  <Text style={styles.filingPeriod}>
                    {f.filing_year} {f.filing_period || ''}
                  </Text>
                </View>
              </View>
            ))}
            {item.filings.length > 10 && (
              <Text style={styles.moreText}>+{item.filings.length - 10} more filings</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <StatCard label="Total Spend" value={formatCurrency(stats.totalSpend)} accent={accent === '#10B981' ? 'emerald' : 'purple'} />
        <StatCard label="Total Filings" value={stats.total} accent="blue" />
      </View>
      <StatCard
        label="Companies Involved"
        value={stats.uniqueClients}
        accent="slate"
        subtitle={`${sectorLabel} sector`}
      />

      <View style={{ height: 12 }} />

      <Text style={styles.countText}>
        {grouped.length} issue areas
      </Text>

      {error ? (
        <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
      ) : grouped.length === 0 ? (
        <EmptyState title="No lobbying data found" message={`No lobbying records for the ${sectorLabel} sector yet.`} />
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(g) => g.issue}
          renderItem={renderIssueGroup}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG, paddingHorizontal: 16, paddingTop: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  countText: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, marginBottom: 8 },
  listContent: { paddingBottom: 24 },
  issueCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  issueHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
  },
  issueName: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  issueStats: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, marginTop: 2 },
  incomeWrap: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  incomeText: { fontSize: 12, fontWeight: '800' },
  filingsList: {
    borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER_LIGHT,
    paddingHorizontal: 14, paddingBottom: 10,
  },
  filingRow: {
    flexDirection: 'row', gap: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT,
  },
  filingClient: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '600' },
  filingRegistrant: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, marginTop: 1 },
  filingIncome: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '700' },
  filingPeriod: { color: UI_COLORS.TEXT_MUTED, fontSize: 10, marginTop: 1 },
  moreText: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, textAlign: 'center', marginTop: 8 },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14 },
});
