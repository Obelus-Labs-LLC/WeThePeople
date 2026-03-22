import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  StyleSheet, RefreshControl, Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, TECH_SECTOR_COLORS, ENFORCEMENT_SOURCE_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type {
  TechCompanyDetail, SECFiling, TechPatentItem,
  ContractItem, ContractSummary, ContractTrendYear,
  LobbyingFiling, LobbyingSummary,
  EnforcementAction, NewsArticle,
} from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';
import SanctionsBadge from '../components/SanctionsBadge';
import { FilterPillGroup, FilterOption } from '../components/FilterPillGroup';
import { DonationsTab } from '../components/company';

type Tab = 'overview' | 'patents' | 'contracts' | 'lobbying' | 'enforcement' | 'donations';

export default function TechCompanyScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const companyId: string = route.params?.company_id;

  const [company, setCompany] = useState<TechCompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  // Patents tab data
  const [patents, setPatents] = useState<TechPatentItem[]>([]);
  const [patentsLoading, setPatentsLoading] = useState(false);
  const [patentsLoaded, setPatentsLoaded] = useState(false);

  // Contracts tab data
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [contractSummary, setContractSummary] = useState<ContractSummary | null>(null);
  const [contractTrends, setContractTrends] = useState<ContractTrendYear[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  // Lobbying tab data
  const [lobbyingFilings, setLobbyingFilings] = useState<LobbyingFiling[]>([]);
  const [lobbySummary, setLobbySummary] = useState<LobbyingSummary | null>(null);
  const [lobbyingLoading, setLobbyingLoading] = useState(false);
  const [lobbyingLoaded, setLobbyingLoaded] = useState(false);

  // Enforcement tab data
  const [enforcementActions, setEnforcementActions] = useState<EnforcementAction[]>([]);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoading, setEnforcementLoading] = useState(false);
  const [enforcementLoaded, setEnforcementLoaded] = useState(false);

  // Donations tab data
  const [donations, setDonations] = useState<any[] | null>(null);
  const [donationsLoading, setDonationsLoading] = useState(false);

  // Filters
  const [patentYearFilter, setPatentYearFilter] = useState<string>('all');
  const [contractAgencyFilter, setContractAgencyFilter] = useState<string>('all');
  const [enforcementSourceFilter, setEnforcementSourceFilter] = useState<string>('all');

  // Overview extras
  const [filings, setFilings] = useState<SECFiling[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);

  const loadCompany = useCallback(async () => {
    try {
      const data = await apiClient.getTechCompanyDetail(companyId);
      setCompany(data);
      setError('');
      navigation.setOptions({ title: data.display_name || '' });
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, navigation]);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  // Load filings + news on mount for overview
  useEffect(() => {
    apiClient.getTechCompanyFilings(companyId, { limit: 20 })
      .then((res) => setFilings(res.filings || []))
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (company?.display_name) {
      apiClient.getNews(company.display_name, 5)
        .then((res) => setNews(res.articles || []))
        .catch(() => {});
    }
  }, [company?.display_name]);

  // Load patents when tab switches
  useEffect(() => {
    if (tab === 'patents' && !patentsLoaded && !patentsLoading) {
      setPatentsLoading(true);
      apiClient.getTechCompanyPatents(companyId, { limit: 50 })
        .then((res) => setPatents(res.patents || []))
        .catch(() => {})
        .finally(() => { setPatentsLoading(false); setPatentsLoaded(true); });
    }
  }, [tab, companyId]);

  // Load contracts + trends when tab switches
  useEffect(() => {
    if (tab === 'contracts' && !contractsLoaded && !contractsLoading) {
      setContractsLoading(true);
      Promise.all([
        apiClient.getTechCompanyContracts(companyId, { limit: 50 }),
        apiClient.getTechCompanyContractSummary(companyId),
        apiClient.getTechCompanyContractTrends(companyId),
      ])
        .then(([ctRes, sumRes, trendRes]) => {
          setContracts(ctRes.contracts || []);
          setContractSummary(sumRes);
          setContractTrends(trendRes.trends || []);
        })
        .catch(() => {})
        .finally(() => { setContractsLoading(false); setContractsLoaded(true); });
    }
  }, [tab, companyId]);

  // Load lobbying when tab switches
  useEffect(() => {
    if (tab === 'lobbying' && !lobbyingLoaded && !lobbyingLoading) {
      setLobbyingLoading(true);
      Promise.all([
        apiClient.getTechCompanyLobbying(companyId, { limit: 50 }),
        apiClient.getTechCompanyLobbySummary(companyId),
      ])
        .then(([filRes, sumRes]) => {
          setLobbyingFilings(filRes.filings || []);
          setLobbySummary(sumRes);
        })
        .catch(() => {})
        .finally(() => { setLobbyingLoading(false); setLobbyingLoaded(true); });
    }
  }, [tab, companyId]);

  // Load enforcement when tab switches
  useEffect(() => {
    if (tab === 'enforcement' && !enforcementLoaded && !enforcementLoading) {
      setEnforcementLoading(true);
      apiClient.getTechCompanyEnforcement(companyId, { limit: 50 })
        .then((res) => {
          setEnforcementActions(res.actions || []);
          setTotalPenalties(res.total_penalties || 0);
        })
        .catch(() => {})
        .finally(() => { setEnforcementLoading(false); setEnforcementLoaded(true); });
    }
  }, [tab, companyId]);

  // Load donations when tab switches
  useEffect(() => {
    if (tab === 'donations' && donations === null && !donationsLoading) {
      setDonationsLoading(true);
      apiClient.getTechCompanyDonations(companyId, { limit: 50 })
        .then((res) => setDonations(res.donations || res || []))
        .catch(() => setDonations([]))
        .finally(() => setDonationsLoading(false));
    }
  }, [tab, companyId]);

  const onRefresh = () => { setRefreshing(true); loadCompany(); };

  if (loading) return <LoadingSpinner message="Loading company..." />;
  if (error || !company) return <EmptyState title="Error" message={error || 'Company not found'} onRetry={loadCompany} />;

  const sectorColor = TECH_SECTOR_COLORS[company.sector_type] || '#6B7280';

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'grid-outline' },
    { key: 'patents', label: 'Patents', icon: 'bulb-outline' },
    { key: 'contracts', label: 'Contracts', icon: 'document-text-outline' },
    { key: 'lobbying', label: 'Lobbying', icon: 'megaphone-outline' },
    { key: 'enforcement', label: 'Legal', icon: 'shield-outline' },
    { key: 'donations', label: 'Donations', icon: 'heart-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Tab bar — scrollable for 5 tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: tab === t.key }}
          >
            <Ionicons
              name={t.icon as any}
              size={15}
              color={tab === t.key ? UI_COLORS.ACCENT : UI_COLORS.TEXT_MUTED}
            />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Company Header */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: sectorColor + '15' }]}>
            <Ionicons name="hardware-chip" size={28} color={sectorColor} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{company.display_name}</Text>
            <View style={styles.headerMeta}>
              {company.ticker && <Text style={styles.headerTicker}>{company.ticker}</Text>}
              <View style={[styles.sectorBadge, { backgroundColor: sectorColor + '12', borderColor: sectorColor + '25' }]}>
                <Text style={[styles.sectorBadgeText, { color: sectorColor }]}>{company.sector_type}</Text>
              </View>
              {company.headquarters && <Text style={styles.headerHQ}>{company.headquarters}</Text>}
            </View>
          </View>
        </View>

        {/* Sanctions Badge */}
        {company.sanctions_status && (
          <SanctionsBadge status={company.sanctions_status} />
        )}

        {/* Tab Content */}
        {tab === 'overview' && renderOverview(company, filings, news, sectorColor, setTab)}
        {tab === 'patents' && renderPatents(patents, patentsLoading, patentYearFilter, setPatentYearFilter)}
        {tab === 'contracts' && renderContracts(contracts, contractSummary, contractTrends, contractsLoading, contractAgencyFilter, setContractAgencyFilter)}
        {tab === 'lobbying' && renderLobbying(lobbyingFilings, lobbySummary, lobbyingLoading)}
        {tab === 'enforcement' && renderEnforcement(enforcementActions, totalPenalties, enforcementLoading, enforcementSourceFilter, setEnforcementSourceFilter)}
        {tab === 'donations' && <DonationsTab donations={donations} loading={donationsLoading} />}
      </ScrollView>
    </View>
  );
}

// ── Overview Tab ──
function renderOverview(
  company: TechCompanyDetail,
  filings: SECFiling[],
  news: NewsArticle[],
  sectorColor: string,
  setTab: (tab: Tab) => void,
) {
  return (
    <View style={styles.tabContent}>
      {/* Stats row */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('patents')} accessibilityRole="button" accessibilityLabel="View Patents">
          <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
          <Text style={styles.miniStatVal}>{company.patent_count}</Text>
          <Text style={styles.miniStatLabel}>Patents</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('contracts')} accessibilityRole="button" accessibilityLabel="View Contracts">
          <Ionicons name="document-text-outline" size={18} color="#2563EB" />
          <Text style={styles.miniStatVal}>{company.contract_count}</Text>
          <Text style={styles.miniStatLabel}>Contracts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('lobbying')} accessibilityRole="button" accessibilityLabel="View Filings">
          <Ionicons name="folder-outline" size={18} color="#8B5CF6" />
          <Text style={styles.miniStatVal}>{company.filing_count}</Text>
          <Text style={styles.miniStatLabel}>Filings</Text>
        </TouchableOpacity>
      </View>

      {/* Contract value */}
      {company.total_contract_value > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cash" size={16} color="#10B981" />
            <Text style={styles.cardTitle}>Government Contract Value</Text>
          </View>
          <Text style={[styles.bigNum, { color: '#10B981' }]}>
            ${company.total_contract_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Text>
          <Text style={styles.cardSub}>{company.contract_count} total contracts</Text>
        </View>
      )}

      {/* Stock snapshot */}
      {company.latest_stock && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="trending-up" size={16} color="#2563EB" />
            <Text style={styles.cardTitle}>Stock Fundamentals</Text>
          </View>
          <View style={styles.stockGrid}>
            {company.latest_stock.market_cap != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Market Cap</Text>
                <Text style={styles.stockVal}>${formatLargeNum(company.latest_stock.market_cap)}</Text>
              </View>
            )}
            {company.latest_stock.pe_ratio != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>P/E Ratio</Text>
                <Text style={styles.stockVal}>{company.latest_stock.pe_ratio.toFixed(1)}</Text>
              </View>
            )}
            {company.latest_stock.eps != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>EPS</Text>
                <Text style={styles.stockVal}>${company.latest_stock.eps.toFixed(2)}</Text>
              </View>
            )}
            {company.latest_stock.profit_margin != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Profit Margin</Text>
                <Text style={styles.stockVal}>{(company.latest_stock.profit_margin * 100).toFixed(1)}%</Text>
              </View>
            )}
            {company.latest_stock.forward_pe != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Forward P/E</Text>
                <Text style={styles.stockVal}>{company.latest_stock.forward_pe.toFixed(1)}</Text>
              </View>
            )}
            {company.latest_stock.revenue_ttm != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Revenue (TTM)</Text>
                <Text style={styles.stockVal}>${formatLargeNum(company.latest_stock.revenue_ttm)}</Text>
              </View>
            )}
            {company.latest_stock.operating_margin != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Op. Margin</Text>
                <Text style={styles.stockVal}>{(company.latest_stock.operating_margin * 100).toFixed(1)}%</Text>
              </View>
            )}
            {company.latest_stock.dividend_yield != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Div Yield</Text>
                <Text style={styles.stockVal}>{(company.latest_stock.dividend_yield * 100).toFixed(2)}%</Text>
              </View>
            )}
            {company.latest_stock.return_on_equity != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>ROE</Text>
                <Text style={styles.stockVal}>{(company.latest_stock.return_on_equity * 100).toFixed(1)}%</Text>
              </View>
            )}
            {company.latest_stock.week_52_high != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>52W High</Text>
                <Text style={styles.stockVal}>${company.latest_stock.week_52_high.toFixed(2)}</Text>
              </View>
            )}
            {company.latest_stock.week_52_low != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>52W Low</Text>
                <Text style={styles.stockVal}>${company.latest_stock.week_52_low.toFixed(2)}</Text>
              </View>
            )}
          </View>
          {company.latest_stock.snapshot_date && (
            <Text style={styles.cardDate}>As of {company.latest_stock.snapshot_date}</Text>
          )}
        </View>
      )}

      {/* News feed */}
      {news.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="newspaper-outline" size={16} color="#EC4899" />
            <Text style={styles.cardTitle}>Recent News</Text>
          </View>
          {news.map((article, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.newsRow}
              onPress={() => article.link && Linking.openURL(article.link)}
              accessibilityRole="link"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.newsTitle} numberOfLines={2}>{article.title}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                  <Text style={styles.newsSource}>{article.source}</Text>
                  {article.published && (
                    <Text style={styles.cardDate}>{article.published}</Text>
                  )}
                </View>
              </View>
              <Ionicons name="open-outline" size={14} color={UI_COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Recent SEC filings */}
      {filings.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document" size={16} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Recent SEC Filings</Text>
          </View>
          {filings.map((f) => {
            const filingUrl = f.accession_number
              ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&accession=${f.accession_number.replace(/-/g, '')}&type=&dateb=&owner=include&count=10`
              : null;
            return (
              <TouchableOpacity
                key={f.id}
                style={styles.filingRow}
                onPress={() => filingUrl && Linking.openURL(filingUrl)}
                disabled={!filingUrl}
                accessibilityRole="link"
              >
                <View style={styles.filingTypeBadge}>
                  <Text style={styles.filingTypeText}>{f.form_type}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filingDesc} numberOfLines={1}>
                    {f.description || f.accession_number}
                  </Text>
                  {f.filing_date && <Text style={styles.cardDate}>{f.filing_date}</Text>}
                </View>
                {filingUrl && <Ionicons name="open-outline" size={14} color={UI_COLORS.TEXT_MUTED} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Patents Tab ──
function renderPatents(
  patents: TechPatentItem[],
  loading: boolean,
  yearFilter: string,
  setYearFilter: (v: string) => void,
) {
  if (loading) return <LoadingSpinner message="Loading patents..." />;

  const years = Array.from(new Set(
    patents.map((p) => p.patent_date?.substring(0, 4)).filter(Boolean)
  )).sort().reverse();
  const yearOptions: FilterOption[] = [
    { key: 'all', label: 'All' },
    ...years.slice(0, 4).map((y) => ({ key: y!, label: y! })),
  ];
  const filtered = yearFilter === 'all'
    ? patents
    : patents.filter((p) => p.patent_date?.startsWith(yearFilter));

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabSectionTitle}>USPTO Patents ({filtered.length})</Text>
      {patents.length > 0 && years.length > 1 && (
        <View style={{ marginBottom: 10 }}>
          <FilterPillGroup options={yearOptions} selected={yearFilter} onSelect={setYearFilter} scrollable />
        </View>
      )}
      {filtered.length === 0 ? (
        <EmptyState title="No patents found" message="No USPTO patents on record." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={false}
          renderItem={({ item: p }) => {
            const patentUrl = p.patent_number
              ? `https://patents.google.com/patent/US${p.patent_number.replace(/[^0-9A-Za-z]/g, '')}`
              : null;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => patentUrl && Linking.openURL(patentUrl)}
                disabled={!patentUrl}
                accessibilityRole="link"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={styles.patentNum}>#{p.patent_number}</Text>
                  {p.num_claims != null && (
                    <View style={styles.claimsBadge}>
                      <Text style={styles.claimsBadgeText}>{p.num_claims} claims</Text>
                    </View>
                  )}
                </View>
                {p.patent_title && (
                  <Text style={styles.patentTitle} numberOfLines={2}>{p.patent_title}</Text>
                )}
                {p.patent_abstract && (
                  <Text style={styles.cardText} numberOfLines={3}>{p.patent_abstract}</Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  {p.patent_date && <Text style={styles.cardDate}>Granted: {p.patent_date}</Text>}
                  {patentUrl && (
                    <View style={styles.sourceLink}>
                      <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                      <Text style={styles.sourceLinkText}>Google Patents</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

// ── Contracts Tab (with trend chart) ──
function renderContracts(
  contracts: ContractItem[],
  summary: ContractSummary | null,
  trends: ContractTrendYear[],
  loading: boolean,
  agencyFilter: string,
  setAgencyFilter: (v: string) => void,
) {
  if (loading) return <LoadingSpinner message="Loading contracts..." />;

  const maxTrend = Math.max(...trends.map((t) => t.total_amount), 1);

  return (
    <View style={styles.tabContent}>
      {/* Summary */}
      {summary && summary.total_contracts > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cash" size={16} color="#10B981" />
            <Text style={styles.cardTitle}>Contract Summary</Text>
          </View>
          <Text style={[styles.bigNum, { color: '#10B981' }]}>
            ${summary.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Text>
          <Text style={styles.cardSub}>{summary.total_contracts} total contracts</Text>

          {Object.keys(summary.by_agency).length > 0 && (
            <View style={styles.summaryList}>
              <Text style={styles.summaryLabel}>Top Agencies</Text>
              {Object.entries(summary.by_agency).slice(0, 5).map(([agency, count]) => (
                <View key={agency} style={styles.summaryRow}>
                  <Text style={styles.summaryText} numberOfLines={1}>{agency}</Text>
                  <Text style={styles.summaryCount}>{count}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Contract Value Trend Chart */}
      {trends.length > 1 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="bar-chart-outline" size={16} color="#2563EB" />
            <Text style={styles.cardTitle}>Contract Value by Year</Text>
          </View>
          <View style={styles.chartContainer}>
            {trends.filter((t) => t.year !== 'Unknown').map((t) => {
              const pct = (t.total_amount / maxTrend) * 100;
              return (
                <View key={t.year} style={styles.chartBarWrap}>
                  <Text style={styles.chartVal}>${formatLargeNum(t.total_amount)}</Text>
                  <View style={styles.chartBarBg}>
                    <View style={[styles.chartBar, { height: `${Math.max(pct, 4)}%` }]} />
                  </View>
                  <Text style={styles.chartLabel}>{t.year.slice(-2)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Individual contracts */}
      {(() => {
        const agencies = Array.from(new Set(contracts.map((c) => c.awarding_agency).filter(Boolean)));
        const agencyOptions: FilterOption[] = [
          { key: 'all', label: 'All' },
          ...agencies.slice(0, 3).map((a) => ({ key: a!, label: a!.length > 18 ? a!.substring(0, 16) + '…' : a! })),
        ];
        const filteredContracts = agencyFilter === 'all'
          ? contracts
          : contracts.filter((c) => c.awarding_agency === agencyFilter);
        return (
          <>
            <Text style={styles.tabSectionTitle}>Contracts ({filteredContracts.length})</Text>
            {contracts.length > 0 && agencies.length > 1 && (
              <View style={{ marginBottom: 10 }}>
                <FilterPillGroup options={agencyOptions} selected={agencyFilter} onSelect={setAgencyFilter} scrollable />
              </View>
            )}
            {filteredContracts.length === 0 ? (
              <EmptyState title="No contracts found" message="No USASpending contract records." />
            ) : (
              <FlatList
                data={filteredContracts}
                keyExtractor={(item) => String(item.id)}
                scrollEnabled={false}
                renderItem={({ item: ct }) => {
                  const contractUrl = ct.award_id
                    ? `https://www.usaspending.gov/award/${ct.award_id}`
                    : null;
                  return (
                    <TouchableOpacity
                      style={styles.card}
                      onPress={() => contractUrl && Linking.openURL(contractUrl)}
                      disabled={!contractUrl}
                      accessibilityRole="link"
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        {ct.award_amount != null && (
                          <Text style={styles.contractAmount}>
                            ${ct.award_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </Text>
                        )}
                        {ct.contract_type && (
                          <View style={styles.contractTypeBadge}>
                            <Text style={styles.contractTypeText}>{ct.contract_type}</Text>
                          </View>
                        )}
                      </View>
                      {ct.awarding_agency && (
                        <Text style={styles.agencyName}>{ct.awarding_agency}</Text>
                      )}
                      {ct.description && (
                        <Text style={styles.cardText} numberOfLines={3}>{ct.description}</Text>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          {ct.start_date && <Text style={styles.cardDate}>Start: {ct.start_date}</Text>}
                          {ct.end_date && <Text style={styles.cardDate}>End: {ct.end_date}</Text>}
                        </View>
                        {contractUrl && (
                          <View style={styles.sourceLink}>
                            <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                            <Text style={styles.sourceLinkText}>USASpending</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </>
        );
      })()}
    </View>
  );
}

// ── Lobbying Tab ──
function renderLobbying(
  filings: LobbyingFiling[],
  summary: LobbyingSummary | null,
  loading: boolean,
) {
  if (loading) return <LoadingSpinner message="Loading lobbying data..." />;

  return (
    <View style={styles.tabContent}>
      {/* Summary */}
      {summary && summary.total_filings > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="megaphone" size={16} color="#F59E0B" />
            <Text style={styles.cardTitle}>Lobbying Overview</Text>
          </View>
          <Text style={[styles.bigNum, { color: '#F59E0B' }]}>
            ${formatLargeNum(summary.total_income)}
          </Text>
          <Text style={styles.cardSub}>
            Total reported lobbying income ({summary.total_filings} filings)
          </Text>

          {/* By year */}
          {Object.keys(summary.by_year).length > 0 && (
            <View style={styles.summaryList}>
              <Text style={styles.summaryLabel}>By Year</Text>
              {Object.entries(summary.by_year)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([year, data]) => (
                  <View key={year} style={styles.summaryRow}>
                    <Text style={styles.summaryText}>{year}</Text>
                    <Text style={styles.summaryCount}>
                      ${formatLargeNum(data.income)} ({data.filings})
                    </Text>
                  </View>
                ))}
            </View>
          )}

          {/* Top firms */}
          {Object.keys(summary.top_firms).length > 0 && (
            <View style={styles.summaryList}>
              <Text style={styles.summaryLabel}>Top Lobbying Firms</Text>
              {Object.entries(summary.top_firms).slice(0, 5).map(([firm, data]) => (
                <View key={firm} style={styles.summaryRow}>
                  <Text style={styles.summaryText} numberOfLines={1}>{firm}</Text>
                  <Text style={styles.summaryCount}>${formatLargeNum(data.income)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Individual filings */}
      <Text style={styles.tabSectionTitle}>Lobbying Filings ({filings.length})</Text>
      {filings.length === 0 ? (
        <EmptyState title="No lobbying filings" message="No Senate LDA filings on record." />
      ) : (
        <FlatList
          data={filings}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={false}
          renderItem={({ item: f }) => {
            const lobbyUrl = f.filing_uuid
              ? `https://lda.senate.gov/filings/filing/${f.filing_uuid}/`
              : null;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => lobbyUrl && Linking.openURL(lobbyUrl)}
                disabled={!lobbyUrl}
                accessibilityRole="link"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.yearBadge}>
                      <Text style={styles.yearBadgeText}>{f.filing_year}</Text>
                    </View>
                    {f.filing_period && (
                      <Text style={styles.periodText}>{f.filing_period}</Text>
                    )}
                  </View>
                  {f.income != null && f.income > 0 && (
                    <Text style={styles.lobbyAmount}>${formatLargeNum(f.income)}</Text>
                  )}
                </View>
                {f.registrant_name && (
                  <Text style={styles.firmName}>{f.registrant_name}</Text>
                )}
                {f.lobbying_issues && (
                  <Text style={styles.cardText} numberOfLines={2}>
                    Issues: {f.lobbying_issues}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  {f.government_entities && (
                    <Text style={styles.cardDate} numberOfLines={1}>
                      Entities: {f.government_entities}
                    </Text>
                  )}
                  {lobbyUrl && (
                    <View style={styles.sourceLink}>
                      <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                      <Text style={styles.sourceLinkText}>Senate LDA</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

// ── Enforcement Tab ──
function renderEnforcement(
  actions: EnforcementAction[],
  totalPenalties: number,
  loading: boolean,
  sourceFilter: string,
  setSourceFilter: (v: string) => void,
) {
  if (loading) return <LoadingSpinner message="Loading enforcement data..." />;

  const SOURCE_COLORS = ENFORCEMENT_SOURCE_COLORS;

  return (
    <View style={styles.tabContent}>
      {/* Penalty summary */}
      {actions.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield-checkmark" size={16} color="#DC2626" />
            <Text style={styles.cardTitle}>Enforcement Summary</Text>
          </View>
          {totalPenalties > 0 && (
            <Text style={[styles.bigNum, { color: '#DC2626' }]}>
              ${formatLargeNum(totalPenalties)}
            </Text>
          )}
          <Text style={styles.cardSub}>
            {actions.length} enforcement action{actions.length !== 1 ? 's' : ''} on record
            {totalPenalties > 0 ? ' with known penalties' : ''}
          </Text>
        </View>
      )}

      {/* Individual actions */}
      {(() => {
        const sources = Array.from(new Set(actions.map((a) => a.source).filter(Boolean)));
        const sourceOptions: FilterOption[] = [
          { key: 'all', label: 'All' },
          ...sources.slice(0, 3).map((s) => ({ key: s!, label: s! })),
        ];
        const filteredActions = sourceFilter === 'all'
          ? actions
          : actions.filter((a) => a.source === sourceFilter);
        return (
          <>
            <Text style={styles.tabSectionTitle}>Enforcement Actions ({filteredActions.length})</Text>
            {actions.length > 0 && sources.length > 1 && (
              <View style={{ marginBottom: 10 }}>
                <FilterPillGroup options={sourceOptions} selected={sourceFilter} onSelect={setSourceFilter} scrollable />
              </View>
            )}
            {filteredActions.length === 0 ? (
              <EmptyState title="No enforcement actions" message="No regulatory enforcement on record." />
            ) : (
              <FlatList
                data={filteredActions}
                keyExtractor={(item) => String(item.id)}
                scrollEnabled={false}
                renderItem={({ item: a }) => {
                  const srcColor = SOURCE_COLORS[a.source || ''] || '#6B7280';
                  return (
                    <TouchableOpacity
                      style={styles.card}
                      onPress={() => a.case_url && Linking.openURL(a.case_url)}
                      disabled={!a.case_url}
                      accessibilityRole="link"
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        {a.source && (
                          <View style={[styles.sourceBadge, { backgroundColor: srcColor + '15', borderColor: srcColor + '30' }]}>
                            <Text style={[styles.sourceBadgeText, { color: srcColor }]}>{a.source}</Text>
                          </View>
                        )}
                        {a.enforcement_type && (
                          <View style={styles.enfTypeBadge}>
                            <Text style={styles.enfTypeText}>{a.enforcement_type}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.caseTitle}>{a.case_title}</Text>
                      {a.penalty_amount != null && a.penalty_amount > 0 && (
                        <Text style={styles.penaltyAmount}>
                          Penalty: ${a.penalty_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                      )}
                      {a.description && (
                        <Text style={styles.cardText} numberOfLines={3}>{a.description}</Text>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        {a.case_date && <Text style={styles.cardDate}>{a.case_date}</Text>}
                        {a.case_url && (
                          <Ionicons name="open-outline" size={12} color={UI_COLORS.TEXT_MUTED} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </>
        );
      })()}
    </View>
  );
}

// ── Helpers ──
function formatLargeNum(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toLocaleString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },

  // Tab bar (horizontal scroll for 5 tabs)
  tabBarScroll: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER_LIGHT,
    flexGrow: 0,
  },
  tabBarContent: {
    paddingHorizontal: 4,
  },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 5,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: UI_COLORS.ACCENT },
  tabText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  tabTextActive: { color: UI_COLORS.ACCENT },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: UI_COLORS.CARD_BG,
    borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT,
  },
  headerIcon: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  headerMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  headerTicker: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY },
  headerHQ: { fontSize: 12, color: UI_COLORS.TEXT_MUTED },
  sectorBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  sectorBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },

  // Tab content
  tabContent: { paddingHorizontal: 16, paddingTop: 12 },
  tabSectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 10 },
  noData: { fontSize: 13, color: UI_COLORS.TEXT_MUTED, paddingVertical: 16, textAlign: 'center' },

  // Stats row
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 16, gap: 8,
  },
  miniStat: {
    flex: 1, alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  miniStatVal: { fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY, marginTop: 4 },
  miniStatLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginTop: 2 },

  // Card
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  cardText: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 18, marginBottom: 4 },
  cardDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  cardSub: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  bigNum: { fontSize: 28, fontWeight: '800', marginTop: 4 },

  // Stock grid
  stockGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  stockItem: {
    width: '47%',
    backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 8, padding: 10,
  },
  stockLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginBottom: 2 },
  stockVal: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },

  // Filings
  filingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  filingTypeBadge: { backgroundColor: '#8B5CF6' + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  filingTypeText: { fontSize: 11, fontWeight: '700', color: '#8B5CF6' },
  filingDesc: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY },

  // News
  newsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  newsTitle: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 18 },
  newsSource: { fontSize: 11, fontWeight: '600', color: '#EC4899' },

  // Patents
  patentNum: { fontSize: 12, fontWeight: '700', color: UI_COLORS.ACCENT, fontFamily: 'monospace' },
  patentTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 20, marginBottom: 4 },
  claimsBadge: { backgroundColor: '#F59E0B' + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  claimsBadgeText: { fontSize: 10, fontWeight: '600', color: '#F59E0B' },

  // Contracts
  contractAmount: { fontSize: 16, fontWeight: '800', color: '#10B981' },
  contractTypeBadge: { backgroundColor: '#6B7280' + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  contractTypeText: { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  agencyName: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },

  // Chart (View-based bar chart)
  chartContainer: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around',
    height: 140, marginTop: 12, paddingHorizontal: 4,
  },
  chartBarWrap: { alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartVal: { fontSize: 9, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginBottom: 4 },
  chartBarBg: { width: 24, flex: 1, justifyContent: 'flex-end' },
  chartBar: { width: '100%', backgroundColor: '#2563EB', borderRadius: 4, minHeight: 4 },
  chartLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY, marginTop: 4 },

  // Lobbying
  yearBadge: { backgroundColor: '#F59E0B' + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  yearBadgeText: { fontSize: 11, fontWeight: '700', color: '#F59E0B' },
  periodText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  lobbyAmount: { fontSize: 15, fontWeight: '800', color: '#F59E0B' },
  firmName: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },

  // Enforcement
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  sourceBadgeText: { fontSize: 10, fontWeight: '700' },
  enfTypeBadge: { backgroundColor: '#6B7280' + '12', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  enfTypeText: { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  caseTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 20, marginBottom: 4 },
  penaltyAmount: { fontSize: 15, fontWeight: '800', color: '#DC2626', marginBottom: 4 },
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourceLinkText: { fontSize: 11, fontWeight: '600', color: UI_COLORS.ACCENT },

  // Summary
  summaryList: { marginTop: 12 },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginBottom: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryText: { flex: 1, fontSize: 13, color: UI_COLORS.TEXT_SECONDARY },
  summaryCount: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginLeft: 12 },
});
