import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  StyleSheet, RefreshControl, Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type {
  DefenseCompanyDetail,
  ContractItem, ContractSummary,
  LobbyingFiling, LobbyingSummary,
  EnforcementAction, NewsArticle,
} from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';
import SanctionsBadge from '../components/SanctionsBadge';
import { DonationsTab } from '../components/company';

const ACCENT = '#DC2626';

type TabKey = 'overview' | 'contracts' | 'lobbying' | 'enforcement' | 'donations';
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'analytics' },
  { key: 'contracts', label: 'Contracts', icon: 'briefcase' },
  { key: 'lobbying', label: 'Lobbying', icon: 'document-text' },
  { key: 'enforcement', label: 'Enforce', icon: 'shield' },
  { key: 'donations', label: 'Donations', icon: 'heart' },
];

function fmtDollar(n: number | null | undefined): string {
  if (n == null) return '--';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function DefenseCompanyScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { company_id } = route.params;

  const [detail, setDetail] = useState<DefenseCompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('overview');

  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [contractSummary, setContractSummary] = useState<ContractSummary | null>(null);
  const [lobbying, setLobbying] = useState<LobbyingFiling[]>([]);
  const [lobbySummary, setLobbySummary] = useState<LobbyingSummary | null>(null);
  const [enforcement, setEnforcement] = useState<EnforcementAction[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);

  const loadData = useCallback(async () => {
    try {
      const d = await apiClient.getDefenseCompanyDetail(company_id);
      setDetail(d);
      navigation.setOptions({ title: d.display_name });
      apiClient.getCompanyNews(d.display_name).then(r => setNews(r.articles || [])).catch(() => {});
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [company_id, navigation]);

  useEffect(() => { loadData(); }, [loadData]);

  // Lazy load tabs
  useEffect(() => {
    if (!company_id) return;
    if (tab === 'contracts' && contracts.length === 0) {
      apiClient.getDefenseCompanyContracts(company_id, { limit: 50 }).then(r => setContracts(r.contracts || [])).catch(() => {});
      apiClient.getDefenseCompanyContractSummary(company_id).then(setContractSummary).catch(() => {});
    }
    if (tab === 'lobbying' && lobbying.length === 0) {
      apiClient.getDefenseCompanyLobbying(company_id, { limit: 50 }).then(r => setLobbying(r.filings || [])).catch(() => {});
      apiClient.getDefenseCompanyLobbySummary(company_id).then(setLobbySummary).catch(() => {});
    }
    if (tab === 'enforcement' && enforcement.length === 0) {
      apiClient.getDefenseCompanyEnforcement(company_id, { limit: 50 }).then(r => setEnforcement(r.actions || [])).catch(() => {});
    }
  }, [tab, company_id]);

  if (loading) return <LoadingSpinner />;
  if (error || !detail) return <EmptyState title="Error" message={error} onRetry={loadData} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.companyName}>{detail.display_name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {detail.ticker && <Text style={styles.ticker}>{detail.ticker}</Text>}
          <Text style={styles.sectorBadge}>{detail.sector_type.replace(/_/g, ' ')}</Text>
          <SanctionsBadge status={detail.sanctions_status} size="sm" />
        </View>
        {detail.headquarters && <Text style={styles.hq}>{detail.headquarters}</Text>}
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon as any} size={14} color={tab === t.key ? ACCENT : UI_COLORS.TEXT_MUTED} />
            <Text style={[styles.tabText, tab === t.key && { color: ACCENT }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Overview */}
      {tab === 'overview' && (
        <View style={styles.section}>
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}><Text style={styles.metricLabel}>Contracts</Text><Text style={styles.metricValue}>{fmtDollar(detail.total_contract_value)}</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricLabel}>Enforcement</Text><Text style={styles.metricValue}>{detail.enforcement_count}</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricLabel}>Lobbying</Text><Text style={styles.metricValue}>{detail.lobbying_count}</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricLabel}>SEC Filings</Text><Text style={styles.metricValue}>{detail.filing_count}</Text></View>
          </View>
          {detail.ai_profile_summary && (
            <View style={styles.summaryCard}><Text style={styles.summaryText}>{detail.ai_profile_summary}</Text></View>
          )}
          {news.length > 0 && news.slice(0, 3).map((n, i) => (
            <TouchableOpacity key={i} style={styles.newsCard} onPress={() => Linking.openURL(n.link)}>
              <Text style={styles.newsTitle} numberOfLines={2}>{n.title}</Text>
              <Text style={styles.newsMeta}>{n.source} · {n.published}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Contracts */}
      {tab === 'contracts' && (
        <View style={styles.section}>
          {contractSummary && (
            <View style={styles.summaryRow}>
              <View style={styles.metricCard}><Text style={styles.metricLabel}>Total Value</Text><Text style={styles.metricValue}>{fmtDollar(contractSummary.total_amount)}</Text></View>
              <View style={styles.metricCard}><Text style={styles.metricLabel}>Count</Text><Text style={styles.metricValue}>{contractSummary.total_contracts}</Text></View>
            </View>
          )}
          {contracts.map((c, i) => (
            <View key={i} style={styles.listCard}>
              <Text style={styles.listTitle} numberOfLines={2}>{c.description || 'Contract Award'}</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                {c.award_amount != null && <Text style={[styles.listMeta, { color: '#10B981' }]}>{fmtDollar(c.award_amount)}</Text>}
                {c.awarding_agency && <Text style={styles.listMeta}>{c.awarding_agency}</Text>}
              </View>
            </View>
          ))}
          {contracts.length === 0 && <EmptyState title="No contracts" />}
        </View>
      )}

      {/* Lobbying */}
      {tab === 'lobbying' && (
        <View style={styles.section}>
          {lobbySummary && (
            <View style={styles.summaryRow}>
              <View style={styles.metricCard}><Text style={styles.metricLabel}>Total Income</Text><Text style={styles.metricValue}>{fmtDollar(lobbySummary.total_income)}</Text></View>
              <View style={styles.metricCard}><Text style={styles.metricLabel}>Filings</Text><Text style={styles.metricValue}>{lobbySummary.total_filings}</Text></View>
            </View>
          )}
          {lobbying.map((l, i) => (
            <View key={i} style={styles.listCard}>
              <Text style={styles.listTitle}>{l.client_name || l.registrant_name || 'Filing'}</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                {l.income != null && <Text style={[styles.listMeta, { color: '#10B981' }]}>{fmtDollar(l.income)}</Text>}
                <Text style={styles.listMeta}>{l.filing_year} {l.filing_period}</Text>
              </View>
            </View>
          ))}
          {lobbying.length === 0 && <EmptyState title="No lobbying filings" />}
        </View>
      )}

      {/* Enforcement */}
      {tab === 'enforcement' && (
        <View style={styles.section}>
          {enforcement.map((e, i) => (
            <TouchableOpacity key={i} style={styles.listCard} onPress={() => e.case_url ? Linking.openURL(e.case_url) : null}>
              <Text style={styles.listTitle} numberOfLines={2}>{e.case_title}</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                {e.enforcement_type && <Text style={[styles.listMeta, { color: '#EF4444' }]}>{e.enforcement_type}</Text>}
                {e.penalty_amount != null && e.penalty_amount > 0 && <Text style={[styles.listMeta, { color: '#EF4444' }]}>{fmtDollar(e.penalty_amount)}</Text>}
                {e.source && <Text style={styles.listMeta}>{e.source}</Text>}
              </View>
            </TouchableOpacity>
          ))}
          {enforcement.length === 0 && <EmptyState title="No enforcement actions" />}
        </View>
      )}

      {/* Donations */}
      {tab === 'donations' && (
        <DonationsTab entityType="defense" entityId={company_id} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  content: { paddingBottom: 32 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  companyName: { fontSize: 24, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  ticker: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  sectorBadge: { fontSize: 11, fontWeight: '600', color: ACCENT, textTransform: 'capitalize' },
  hq: { fontSize: 13, color: UI_COLORS.TEXT_MUTED, marginTop: 4 },
  tabBar: { borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER },
  tabBarContent: { paddingHorizontal: 12, gap: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: ACCENT },
  tabText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  section: { paddingHorizontal: 16, paddingTop: 16 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  metricCard: { flex: 1, minWidth: '45%', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER },
  metricLabel: { fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  summaryCard: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: UI_COLORS.BORDER, marginBottom: 12 },
  summaryText: { fontSize: 14, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 20 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  listCard: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER },
  listTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  listMeta: { fontSize: 12, color: UI_COLORS.TEXT_MUTED },
  newsCard: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER },
  newsTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  newsMeta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 4 },
});
