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
  EnergyCompanyDetail, SECFiling, EnergyEmissionItem,
  ContractItem, ContractSummary,
  LobbyingFiling, LobbyingSummary,
  EnforcementAction, NewsArticle,
} from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { DonationsTab } from '../components/company';

const ENERGY_SECTOR_COLORS: Record<string, string> = {
  oil_gas: '#475569',
  utility: '#2563EB',
  renewable: '#10B981',
  pipeline: '#F59E0B',
  services: '#8B5CF6',
};

const ENFORCEMENT_SOURCE_COLORS: Record<string, string> = {
  EPA: '#10B981',
  FERC: '#2563EB',
  DOJ: '#7C3AED',
  'State AG': '#EA580C',
};

type Tab = 'overview' | 'emissions' | 'contracts' | 'lobbying' | 'enforcement' | 'donations';

export default function EnergyCompanyScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const companyId: string = route.params?.company_id;

  const [company, setCompany] = useState<EnergyCompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  // Emissions tab data
  const [emissions, setEmissions] = useState<EnergyEmissionItem[]>([]);
  const [emissionsLoading, setEmissionsLoading] = useState(false);

  // Contracts tab data
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [contractSummary, setContractSummary] = useState<ContractSummary | null>(null);
  const [contractsLoading, setContractsLoading] = useState(false);

  // Lobbying tab data
  const [filings, setFilings] = useState<LobbyingFiling[]>([]);
  const [lobbySummary, setLobbySummary] = useState<LobbyingSummary | null>(null);
  const [lobbyLoading, setLobbyLoading] = useState(false);

  // Enforcement tab data
  const [enforcement, setEnforcement] = useState<EnforcementAction[]>([]);
  const [enforcementLoading, setEnforcementLoading] = useState(false);
  const [totalPenalties, setTotalPenalties] = useState(0);

  // Donations tab data
  const [donations, setDonations] = useState<any[] | null>(null);
  const [donationsLoading, setDonationsLoading] = useState(false);

  // News
  const [news, setNews] = useState<NewsArticle[]>([]);

  const loadCompany = useCallback(async () => {
    try {
      const detail = await apiClient.getEnergyCompanyDetail(companyId);
      setCompany(detail);
      navigation.setOptions({ title: detail.display_name });
      setError('');
      // Load news in background
      apiClient.getNews(detail.display_name, 5)
        .then(r => setNews(r.articles || []))
        .catch(() => {});
    } catch (e: any) {
      setError(e.message || 'Failed to load company');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, navigation]);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  // Lazy load tab data
  useEffect(() => {
    if (!company) return;
    if (tab === 'emissions' && emissions.length === 0 && !emissionsLoading) {
      setEmissionsLoading(true);
      apiClient.getEnergyCompanyEmissions(companyId, { limit: 50 })
        .then(r => setEmissions(r.emissions || []))
        .catch(() => {})
        .finally(() => setEmissionsLoading(false));
    }
    if (tab === 'contracts' && contracts.length === 0 && !contractsLoading) {
      setContractsLoading(true);
      Promise.all([
        apiClient.getEnergyCompanyContracts(companyId, { limit: 25 }),
        apiClient.getEnergyCompanyContractSummary(companyId),
      ])
        .then(([cRes, sRes]) => {
          setContracts(cRes.contracts || []);
          setContractSummary(sRes);
        })
        .catch(() => {})
        .finally(() => setContractsLoading(false));
    }
    if (tab === 'lobbying' && filings.length === 0 && !lobbyLoading) {
      setLobbyLoading(true);
      Promise.all([
        apiClient.getEnergyCompanyLobbying(companyId, { limit: 20 }),
        apiClient.getEnergyCompanyLobbySummary(companyId),
      ])
        .then(([lRes, sRes]) => {
          setFilings(lRes.filings || []);
          setLobbySummary(sRes);
        })
        .catch(() => {})
        .finally(() => setLobbyLoading(false));
    }
    if (tab === 'enforcement' && enforcement.length === 0 && !enforcementLoading) {
      setEnforcementLoading(true);
      apiClient.getEnergyCompanyEnforcement(companyId, { limit: 50 })
        .then(r => {
          setEnforcement(r.actions || []);
          setTotalPenalties(r.total_penalties || 0);
        })
        .catch(() => {})
        .finally(() => setEnforcementLoading(false));
    }
    if (tab === 'donations' && donations === null && !donationsLoading) {
      setDonationsLoading(true);
      apiClient.getEnergyCompanyDonations(companyId, { limit: 50 })
        .then((res) => setDonations(res.donations || res || []))
        .catch(() => setDonations([]))
        .finally(() => setDonationsLoading(false));
    }
  }, [tab, company, companyId, emissions.length, contracts.length, filings.length, enforcement.length, emissionsLoading, contractsLoading, lobbyLoading, enforcementLoading, donations, donationsLoading]);

  const onRefresh = () => { setRefreshing(true); loadCompany(); };

  const fmt = (n: number | null | undefined) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };

  const fmtNum = (n: number | null | undefined) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toLocaleString();
  };

  const fmtTons = (n: number | null | undefined) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M tons`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K tons`;
    return `${n.toLocaleString()} tons`;
  };

  const pct = (n: number | null | undefined) => n != null ? `${(n * 100).toFixed(1)}%` : '—';

  if (loading) return <LoadingSpinner message="Loading company..." />;
  if (error) return <EmptyState title="Error" message={error} onRetry={loadCompany} />;
  if (!company) return <EmptyState title="Not Found" />;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'emissions', label: 'Emissions' },
    { key: 'contracts', label: 'Contracts' },
    { key: 'lobbying', label: 'Lobbying' },
    { key: 'enforcement', label: 'Enforcement' },
    { key: 'donations', label: 'Donations' },
  ];

  const sectorColor = ENERGY_SECTOR_COLORS[company.sector_type] || '#6B7280';

  // ── Tab Renderers ──

  const renderOverview = () => (
    <>
      {/* Stats row — clickable to switch tabs */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statBox} onPress={() => setTab('emissions')} accessibilityRole="button" accessibilityLabel={`${company.emission_count} emissions records`}>
          <Text style={styles.statValue}>{fmtNum(company.emission_count)}</Text>
          <Text style={styles.statLabel}>Emissions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statBox} onPress={() => setTab('contracts')} accessibilityRole="button" accessibilityLabel={`${company.contract_count} contracts`}>
          <Text style={styles.statValue}>{fmtNum(company.contract_count)}</Text>
          <Text style={styles.statLabel}>Contracts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statBox} onPress={() => setTab('enforcement')} accessibilityRole="button" accessibilityLabel={`${company.enforcement_count} enforcement actions`}>
          <Text style={styles.statValue}>{fmtNum(company.enforcement_count)}</Text>
          <Text style={styles.statLabel}>Enforcement</Text>
        </TouchableOpacity>
      </View>

      {/* Contract value + penalties */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{fmt(company.total_contract_value)}</Text>
          <Text style={styles.statLabel}>Contract Value</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, company.total_penalties > 0 && { color: '#DC2626' }]}>{fmt(company.total_penalties)}</Text>
          <Text style={styles.statLabel}>Penalties</Text>
        </View>
        <TouchableOpacity style={styles.statBox} onPress={() => setTab('lobbying')} accessibilityRole="button" accessibilityLabel={`${company.lobbying_count} lobbying filings`}>
          <Text style={styles.statValue}>{fmtNum(company.lobbying_count)}</Text>
          <Text style={styles.statLabel}>Lobbying</Text>
        </TouchableOpacity>
      </View>

      {/* Stock data */}
      {company.latest_stock && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Market Data</Text>
          <View style={styles.stockGrid}>
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>Market Cap</Text>
              <Text style={styles.stockValue}>{fmt(company.latest_stock.market_cap)}</Text>
            </View>
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>P/E Ratio</Text>
              <Text style={styles.stockValue}>{company.latest_stock.pe_ratio?.toFixed(1) ?? '—'}</Text>
            </View>
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>EPS</Text>
              <Text style={styles.stockValue}>{company.latest_stock.eps ? `$${company.latest_stock.eps.toFixed(2)}` : '—'}</Text>
            </View>
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>Div Yield</Text>
              <Text style={styles.stockValue}>{pct(company.latest_stock.dividend_yield)}</Text>
            </View>
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>Profit Margin</Text>
              <Text style={styles.stockValue}>{pct(company.latest_stock.profit_margin)}</Text>
            </View>
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>52W High</Text>
              <Text style={styles.stockValue}>{company.latest_stock.week_52_high ? `$${company.latest_stock.week_52_high.toFixed(2)}` : '—'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* News */}
      {news.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent News</Text>
          {news.map((n, i) => (
            <TouchableOpacity
              key={i}
              style={styles.newsItem}
              onPress={() => Linking.openURL(n.link)}
              accessibilityRole="link"
              accessibilityLabel={`Read: ${n.title}`}
            >
              <Text style={styles.newsTitle} numberOfLines={2}>{n.title}</Text>
              <Text style={styles.newsMeta}>{n.source} · {n.published}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* SEC filings link */}
      {company.sec_cik && (
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => Linking.openURL(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.sec_cik}&type=&dateb=&owner=include&count=40`)}
          accessibilityRole="link"
          accessibilityLabel="View SEC filings on EDGAR"
        >
          <Ionicons name="document-text-outline" size={18} color={sectorColor} />
          <Text style={[styles.linkText, { color: sectorColor }]}>View SEC Filings on EDGAR →</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const renderEmissions = () => {
    if (emissionsLoading) return <LoadingSpinner message="Loading emissions..." />;
    if (emissions.length === 0) return <EmptyState title="No Emissions Data" message="EPA GHGRP data not yet available" />;
    return (
      <FlatList
        data={emissions}
        scrollEnabled={false}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item: e }) => (
          <View style={styles.listCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listTitle} numberOfLines={2}>{e.facility_name || 'Unnamed Facility'}</Text>
              <Text style={styles.listMeta}>
                {e.facility_state || '—'} · {e.reporting_year} · {e.industry_type || '—'}
              </Text>
              <Text style={styles.listDetail}>
                {fmtTons(e.total_emissions)} CO2e · {e.emission_type || 'Total GHG'}
              </Text>
            </View>
            {e.source_url && (
              <TouchableOpacity onPress={() => Linking.openURL(e.source_url!)} accessibilityRole="link" accessibilityLabel="View source">
                <Ionicons name="open-outline" size={16} color={sectorColor} />
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    );
  };

  const renderContracts = () => {
    if (contractsLoading) return <LoadingSpinner message="Loading contracts..." />;
    if (contracts.length === 0) return <EmptyState title="No Contracts" message="No government contracts found" />;
    return (
      <>
        {contractSummary && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{contractSummary.total_contracts}</Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{fmt(contractSummary.total_amount)}</Text>
              <Text style={styles.summaryLabel}>Value</Text>
            </View>
          </View>
        )}
        <FlatList
          data={contracts}
          scrollEnabled={false}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item: ct }) => (
            <TouchableOpacity
              style={styles.listCard}
              onPress={() => ct.award_id ? Linking.openURL(`https://www.usaspending.gov/award/${ct.award_id}`) : null}
              accessibilityRole="link"
              accessibilityLabel={`Contract: ${ct.description || 'View details'}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle} numberOfLines={2}>{ct.description || 'Government Contract'}</Text>
                <Text style={styles.listMeta}>
                  {ct.awarding_agency || '—'} · {ct.start_date || '—'}
                </Text>
                {ct.award_amount != null && (
                  <Text style={[styles.listDetail, { color: '#10B981', fontWeight: '700' }]}>{fmt(ct.award_amount)}</Text>
                )}
              </View>
              <Ionicons name="open-outline" size={16} color={sectorColor} />
            </TouchableOpacity>
          )}
        />
      </>
    );
  };

  const renderLobbying = () => {
    if (lobbyLoading) return <LoadingSpinner message="Loading lobbying..." />;
    if (filings.length === 0) return <EmptyState title="No Lobbying Data" message="No lobbying disclosures found" />;
    return (
      <>
        {lobbySummary && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{lobbySummary.total_filings}</Text>
              <Text style={styles.summaryLabel}>Filings</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{fmt(lobbySummary.total_income)}</Text>
              <Text style={styles.summaryLabel}>Total Spent</Text>
            </View>
          </View>
        )}
        <FlatList
          data={filings}
          scrollEnabled={false}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item: f }) => (
            <TouchableOpacity
              style={styles.listCard}
              onPress={() => f.filing_uuid ? Linking.openURL(`https://lda.senate.gov/filings/filing/${f.filing_uuid}/`) : null}
              accessibilityRole="link"
              accessibilityLabel={`Lobbying filing by ${f.registrant_name || 'unknown'}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle} numberOfLines={1}>{f.registrant_name || 'Unknown Firm'}</Text>
                <Text style={styles.listMeta}>
                  {f.filing_year} {f.filing_period || ''} · {f.client_name || '—'}
                </Text>
                {f.income != null && (
                  <Text style={[styles.listDetail, { color: '#F59E0B', fontWeight: '700' }]}>{fmt(f.income)}</Text>
                )}
                {f.lobbying_issues && (
                  <Text style={styles.listIssues} numberOfLines={1}>Issues: {f.lobbying_issues}</Text>
                )}
              </View>
              <Ionicons name="open-outline" size={16} color={sectorColor} />
            </TouchableOpacity>
          )}
        />
      </>
    );
  };

  const renderEnforcement = () => {
    if (enforcementLoading) return <LoadingSpinner message="Loading enforcement..." />;
    if (enforcement.length === 0) return <EmptyState title="No Enforcement Actions" message="No EPA/FERC/DOJ actions found" />;
    return (
      <>
        {totalPenalties > 0 && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: '#DC2626' }]}>{fmt(totalPenalties)}</Text>
              <Text style={styles.summaryLabel}>Total Penalties</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{enforcement.length}</Text>
              <Text style={styles.summaryLabel}>Actions</Text>
            </View>
          </View>
        )}
        <FlatList
          data={enforcement}
          scrollEnabled={false}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item: a }) => (
            <TouchableOpacity
              style={styles.listCard}
              onPress={() => a.case_url ? Linking.openURL(a.case_url) : null}
              accessibilityRole="link"
              accessibilityLabel={`Enforcement: ${a.case_title}`}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  {a.source && (
                    <View style={[styles.sourceBadge, { backgroundColor: (ENFORCEMENT_SOURCE_COLORS[a.source] || '#6B7280') + '15' }]}>
                      <Text style={[styles.sourceBadgeText, { color: ENFORCEMENT_SOURCE_COLORS[a.source] || '#6B7280' }]}>{a.source}</Text>
                    </View>
                  )}
                  {a.enforcement_type && <Text style={styles.enfType}>{a.enforcement_type}</Text>}
                </View>
                <Text style={styles.listTitle} numberOfLines={2}>{a.case_title}</Text>
                <Text style={styles.listMeta}>{a.case_date || '—'}</Text>
                {a.penalty_amount != null && a.penalty_amount > 0 && (
                  <Text style={[styles.listDetail, { color: '#DC2626', fontWeight: '700' }]}>{fmt(a.penalty_amount)} penalty</Text>
                )}
                {a.description && <Text style={styles.listDesc} numberOfLines={2}>{a.description}</Text>}
              </View>
              {a.case_url && <Ionicons name="open-outline" size={16} color={sectorColor} />}
            </TouchableOpacity>
          )}
        />
      </>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={sectorColor} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: sectorColor + '15' }]}>
          <Ionicons name="flame" size={28} color={sectorColor} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{company.display_name}</Text>
          <View style={styles.headerMeta}>
            {company.ticker && <Text style={styles.headerTicker}>{company.ticker}</Text>}
            <View style={[styles.headerBadge, { backgroundColor: sectorColor + '12', borderColor: sectorColor + '25' }]}>
              <Text style={[styles.headerBadgeText, { color: sectorColor }]}>{company.sector_type.replace('_', ' ')}</Text>
            </View>
          </View>
          {company.headquarters && <Text style={styles.headerHq}>{company.headquarters}</Text>}
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && { borderBottomColor: sectorColor }]}
            onPress={() => setTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
          >
            <Text style={[styles.tabText, tab === t.key && { color: sectorColor, fontWeight: '700' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab content */}
      <View style={styles.tabContent}>
        {tab === 'overview' && renderOverview()}
        {tab === 'emissions' && renderEmissions()}
        {tab === 'contracts' && renderContracts()}
        {tab === 'lobbying' && renderLobbying()}
        {tab === 'enforcement' && renderEnforcement()}
        {tab === 'donations' && <DonationsTab donations={donations} loading={donationsLoading} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 32 },
  header: {
    flexDirection: 'row', padding: 16, paddingBottom: 8, alignItems: 'center',
  },
  headerIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 20, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  headerTicker: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY },
  headerBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  headerBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  headerHq: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  tabBar: { borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER },
  tabBarContent: { paddingHorizontal: 16, gap: 4 },
  tabBtn: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  tabContent: { paddingHorizontal: 16, paddingTop: 12 },

  // Overview
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statBox: {
    flex: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  statLabel: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },

  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 10 },
  stockGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stockItem: {
    width: '30%' as any, flexGrow: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 8, padding: 8, alignItems: 'center',
  },
  stockLabel: { fontSize: 10, color: UI_COLORS.TEXT_MUTED },
  stockValue: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginTop: 2 },

  newsItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  newsTitle: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 18 },
  newsMeta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },

  linkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  linkText: { fontSize: 13, fontWeight: '600' },

  // Lists
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryItem: {
    flex: 1, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  summaryValue: { fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  summaryLabel: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },

  listCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  listTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 19 },
  listMeta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  listDetail: { fontSize: 13, marginTop: 3 },
  listDesc: { fontSize: 11, color: UI_COLORS.TEXT_SECONDARY, marginTop: 4, lineHeight: 16 },
  listIssues: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3, fontStyle: 'italic' },

  // Enforcement specific
  sourceBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  sourceBadgeText: { fontSize: 10, fontWeight: '700' },
  enfType: { fontSize: 10, color: UI_COLORS.TEXT_MUTED },
});
