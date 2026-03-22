import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, FlatList,
  StyleSheet, RefreshControl, Linking,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, FINANCE_SECTOR_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type {
  InstitutionDetail, SECFiling, FDICFinancial,
  CFPBComplaint, ComplaintSummary, NewsArticle,
  StockSnapshot, FREDObservation, InsiderTrade,
} from '../api/types';
import { LoadingSpinner, StatCard, EmptyState } from '../components/ui';
import { SectorTypeBadge } from '../components/ui';
import SanctionsBadge from '../components/SanctionsBadge';
import { FilterPillGroup, FilterOption } from '../components/FilterPillGroup';
import { LobbyingTab, ContractsTab, EnforcementTab, DonationsTab } from '../components/company';

type TabKey = 'overview' | 'filings' | 'complaints' | 'insider' | 'news' | 'lobbying' | 'contracts' | 'enforcement' | 'donations';

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatPct(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  return `${val.toFixed(2)}%`;
}

function formatNewsDate(raw: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    if (diffH < 48) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export default function InstitutionScreen() {
  const route = useRoute<any>();
  const institution_id = route.params?.institution_id;

  if (!institution_id) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: UI_COLORS.SECONDARY_BG }}>
        <Text style={{ color: UI_COLORS.TEXT_MUTED, fontSize: 14 }}>No institution selected.</Text>
      </View>
    );
  }

  const [detail, setDetail] = useState<InstitutionDetail | null>(null);
  const [filings, setFilings] = useState<SECFiling[]>([]);
  const [financials, setFinancials] = useState<FDICFinancial[]>([]);
  const [complaints, setComplaints] = useState<CFPBComplaint[]>([]);
  const [complaintSummary, setComplaintSummary] = useState<ComplaintSummary | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [filingTypeFilter, setFilingTypeFilter] = useState<string>('all');
  const [complaintProductFilter, setComplaintProductFilter] = useState<string>('all');
  const [stockData, setStockData] = useState<StockSnapshot | null>(null);
  const [fredData, setFredData] = useState<FREDObservation[]>([]);
  const [insiderTrades, setInsiderTrades] = useState<InsiderTrade[]>([]);
  const [insiderLoading, setInsiderLoading] = useState(false);
  const [insiderTypeFilter, setInsiderTypeFilter] = useState<string>('all');
  const [error, setError] = useState('');

  // Political data
  const [lobbyingFilings, setLobbyingFilings] = useState<any[] | null>(null);
  const [lobbySummary, setLobbySummary] = useState<any>(null);
  const [lobbyingLoading, setLobbyingLoading] = useState(false);
  const [contractsList, setContractsList] = useState<any[] | null>(null);
  const [contractSummary, setContractSummary] = useState<any>(null);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [enforcementActions, setEnforcementActions] = useState<any[] | null>(null);
  const [enfTotalPenalties, setEnfTotalPenalties] = useState(0);
  const [enforcementLoading, setEnforcementLoading] = useState(false);
  const [donations, setDonations] = useState<any[] | null>(null);
  const [donationsLoading, setDonationsLoading] = useState(false);

  const loadData = async () => {
    try {
      const [detailRes, filingsRes, financialsRes, complaintsRes, summaryRes] = await Promise.all([
        apiClient.getInstitutionDetail(institution_id),
        apiClient.getInstitutionFilings(institution_id, { limit: 20 }),
        apiClient.getInstitutionFinancials(institution_id, { limit: 8 }),
        apiClient.getInstitutionComplaints(institution_id, { limit: 20 }),
        apiClient.getInstitutionComplaintSummary(institution_id),
      ]);
      setDetail(detailRes);
      setFilings(filingsRes.filings || []);
      setFinancials(financialsRes.financials || []);
      setComplaints(complaintsRes.complaints || []);
      setComplaintSummary(summaryRes);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load institution');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [institution_id]);

  // Reset all lazy-loaded state when institution changes
  useEffect(() => {
    setInsiderTrades([]);
    setNews([]);
    setLobbyingFilings(null);
    setLobbySummary(null);
    setContractsList(null);
    setContractSummary(null);
    setEnforcementActions(null);
    setEnfTotalPenalties(0);
    setDonations(null);
    setStockData(null);
    setFredData([]);
  }, [institution_id]);

  // Load stock + FRED data on mount
  useEffect(() => {
    apiClient.getInstitutionStock(institution_id)
      .then((res) => setStockData(res.stock || null))
      .catch(() => {});
    apiClient.getInstitutionFRED(institution_id, { limit: 20 })
      .then((res) => setFredData(res.observations || []))
      .catch(() => {});
  }, [institution_id]);

  // Load insider trades when tab switches
  useEffect(() => {
    if (activeTab === 'insider' && insiderTrades.length === 0 && !insiderLoading) {
      setInsiderLoading(true);
      apiClient.getInstitutionInsiderTrades(institution_id, { limit: 50 })
        .then((res) => setInsiderTrades(res.trades || []))
        .catch(() => {})
        .finally(() => setInsiderLoading(false));
    }
  }, [activeTab, institution_id]);

  // Load news when tab switches
  useEffect(() => {
    if (activeTab === 'news' && news.length === 0 && !newsLoading && detail) {
      setNewsLoading(true);
      apiClient.getNews(detail.display_name, 15)
        .then((res) => setNews(res.articles || []))
        .catch(() => {})
        .finally(() => setNewsLoading(false));
    }
  }, [activeTab, detail, institution_id]);

  // Lazy-load lobbying
  useEffect(() => {
    if (activeTab === 'lobbying' && lobbyingFilings === null && !lobbyingLoading) {
      setLobbyingLoading(true);
      Promise.all([
        apiClient.getInstitutionLobbying(institution_id, { limit: 25 }),
        apiClient.getInstitutionLobbySummary(institution_id),
      ])
        .then(([filRes, sumRes]) => {
          setLobbyingFilings(filRes.filings || []);
          setLobbySummary(sumRes);
        })
        .catch(() => setLobbyingFilings([]))
        .finally(() => setLobbyingLoading(false));
    }
  }, [activeTab, institution_id]);

  // Lazy-load contracts
  useEffect(() => {
    if (activeTab === 'contracts' && contractsList === null && !contractsLoading) {
      setContractsLoading(true);
      Promise.all([
        apiClient.getInstitutionContracts(institution_id, { limit: 25 }),
        apiClient.getInstitutionContractSummary(institution_id),
      ])
        .then(([ctRes, sumRes]) => {
          setContractsList(ctRes.contracts || []);
          setContractSummary(sumRes);
        })
        .catch(() => setContractsList([]))
        .finally(() => setContractsLoading(false));
    }
  }, [activeTab, institution_id]);

  // Lazy-load enforcement
  useEffect(() => {
    if (activeTab === 'enforcement' && enforcementActions === null && !enforcementLoading) {
      setEnforcementLoading(true);
      apiClient.getInstitutionEnforcement(institution_id, { limit: 50 })
        .then((res) => {
          setEnforcementActions(res.actions || []);
          setEnfTotalPenalties(res.total_penalties || 0);
        })
        .catch(() => setEnforcementActions([]))
        .finally(() => setEnforcementLoading(false));
    }
  }, [activeTab, institution_id]);

  // Lazy-load donations
  useEffect(() => {
    if (activeTab === 'donations' && donations === null && !donationsLoading) {
      setDonationsLoading(true);
      apiClient.getInstitutionDonations(institution_id, { limit: 50 })
        .then((res) => setDonations(res.donations || res || []))
        .catch(() => setDonations([]))
        .finally(() => setDonationsLoading(false));
    }
  }, [activeTab, institution_id]);

  if (loading) return <LoadingSpinner message="Loading institution..." />;
  if (error || !detail) return <EmptyState title="Error" message={error || 'Institution data unavailable.'} onRetry={loadData} />;

  const sColor = FINANCE_SECTOR_COLORS[detail.sector_type] || '#6B7280';
  const latestFin = detail.latest_financial;

  const TABS: { key: TabKey; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: 'grid-outline' },
    { key: 'lobbying', label: 'Lobbying', icon: 'megaphone-outline' },
    { key: 'contracts', label: 'Contracts', icon: 'briefcase-outline' },
    { key: 'enforcement', label: 'Enforcement', icon: 'shield-checkmark-outline' },
    { key: 'donations', label: 'Donations', icon: 'heart-outline' },
    { key: 'filings', label: 'Filings', icon: 'document-text-outline' },
    { key: 'complaints', label: 'Complaints', icon: 'chatbubble-ellipses-outline' },
    { key: 'insider', label: 'Insider', icon: 'swap-horizontal-outline' },
    { key: 'news', label: 'News', icon: 'newspaper-outline' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadData(); }}
          tintColor={UI_COLORS.ACCENT}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        {detail.logo_url ? (
          <Image source={{ uri: detail.logo_url }} style={styles.headerLogo} />
        ) : (
          <View style={[styles.headerIcon, { backgroundColor: sColor + '15' }]}>
            <Text style={[styles.headerIconText, { color: sColor }]}>
              {detail.ticker ? detail.ticker.substring(0, 3) : detail.display_name.charAt(0)}
            </Text>
          </View>
        )}
        <Text style={styles.headerName}>{detail.display_name}</Text>
        <View style={styles.headerMeta}>
          {detail.ticker && <Text style={styles.headerTicker}>{detail.ticker}</Text>}
          <SectorTypeBadge sectorType={detail.sector_type} />
          {detail.headquarters && <Text style={styles.headerHQ}>{detail.headquarters}</Text>}
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={styles.tabRowContent}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <Ionicons name={tab.icon} size={14} color={activeTab === tab.key ? UI_COLORS.ACCENT : UI_COLORS.TEXT_MUTED} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sanctions Badge */}
      {detail?.sanctions_status && (
        <SanctionsBadge status={detail.sanctions_status} />
      )}

      {/* === Overview Tab === */}
      {activeTab === 'overview' && (
        <View style={styles.tabContent}>
          <View style={styles.statsGrid}>
            <TouchableOpacity style={styles.statHalf} onPress={() => setActiveTab('filings')} accessibilityRole="button" accessibilityLabel="View SEC Filings">
              <StatCard label="SEC Filings" value={detail.filing_count} accent="blue" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.statHalf} onPress={() => setActiveTab('complaints')} accessibilityRole="button" accessibilityLabel="View CFPB Complaints">
              <StatCard label="CFPB Complaints" value={detail.complaint_count} accent="red" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.statHalf} onPress={() => setActiveTab('overview')} accessibilityRole="button" accessibilityLabel="View FDIC Reports">
              <StatCard label="FDIC Reports" value={detail.financial_count} accent="gold" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.statHalf} onPress={() => setActiveTab('complaints')} accessibilityRole="button" accessibilityLabel="View Timely Response">
              <StatCard
                label="Timely Response"
                value={complaintSummary?.timely_response_pct != null ? `${complaintSummary.timely_response_pct}%` : 'N/A'}
                accent="green"
              />
            </TouchableOpacity>
          </View>

          {latestFin && (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="stats-chart" size={16} color={UI_COLORS.GOLD} />
                <Text style={styles.cardTitle}>Latest FDIC Financial Snapshot</Text>
              </View>
              <Text style={styles.cardSubtitle}>As of {latestFin.report_date || 'N/A'}</Text>
              <View style={styles.finGrid}>
                <FinRow label="Total Assets" value={formatCurrency(latestFin.total_assets)} />
                <FinRow label="Total Deposits" value={formatCurrency(latestFin.total_deposits)} />
                <FinRow label="Net Income" value={formatCurrency(latestFin.net_income)} />
                <FinRow label="ROA" value={formatPct(latestFin.roa)} />
                <FinRow label="ROE" value={formatPct(latestFin.roe)} />
                <FinRow label="Tier 1 Capital" value={formatPct(latestFin.tier1_capital_ratio)} />
                <FinRow label="Efficiency Ratio" value={formatPct(latestFin.efficiency_ratio)} />
                <FinRow label="Noncurrent Loans" value={formatPct(latestFin.noncurrent_loan_ratio)} />
                <FinRow label="Net Charge-offs" value={formatPct(latestFin.net_charge_off_ratio)} />
              </View>
            </View>
          )}

          {complaintSummary && Object.keys(complaintSummary.by_product).length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="pie-chart-outline" size={16} color="#DC2626" />
                <Text style={styles.cardTitle}>Complaints by Product</Text>
              </View>
              {Object.entries(complaintSummary.by_product)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([product, count]) => (
                  <View key={product} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel} numberOfLines={1}>{product || 'Unknown'}</Text>
                    <Text style={styles.breakdownValue}>{count}</Text>
                  </View>
                ))}
            </View>
          )}

          {/* Stock Fundamentals */}
          {stockData && (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="trending-up" size={16} color="#2563EB" />
                <Text style={styles.cardTitle}>Stock Fundamentals</Text>
              </View>
              <View style={styles.stockGrid}>
                {stockData.market_cap != null && (
                  <View style={styles.stockItem}>
                    <Text style={styles.stockLabel}>Market Cap</Text>
                    <Text style={styles.stockVal}>{formatCurrency(stockData.market_cap)}</Text>
                  </View>
                )}
                {stockData.pe_ratio != null && (
                  <View style={styles.stockItem}>
                    <Text style={styles.stockLabel}>P/E Ratio</Text>
                    <Text style={styles.stockVal}>{stockData.pe_ratio.toFixed(1)}</Text>
                  </View>
                )}
                {stockData.eps != null && (
                  <View style={styles.stockItem}>
                    <Text style={styles.stockLabel}>EPS</Text>
                    <Text style={styles.stockVal}>${stockData.eps.toFixed(2)}</Text>
                  </View>
                )}
                {stockData.profit_margin != null && (
                  <View style={styles.stockItem}>
                    <Text style={styles.stockLabel}>Profit Margin</Text>
                    <Text style={styles.stockVal}>{formatPct(stockData.profit_margin * 100)}</Text>
                  </View>
                )}
                {stockData.dividend_yield != null && (
                  <View style={styles.stockItem}>
                    <Text style={styles.stockLabel}>Div Yield</Text>
                    <Text style={styles.stockVal}>{formatPct(stockData.dividend_yield * 100)}</Text>
                  </View>
                )}
                {stockData.week_52_high != null && (
                  <View style={styles.stockItem}>
                    <Text style={styles.stockLabel}>52W High</Text>
                    <Text style={styles.stockVal}>${stockData.week_52_high.toFixed(2)}</Text>
                  </View>
                )}
              </View>
              {stockData.snapshot_date && (
                <Text style={[styles.cardSubtitle, { marginTop: 8, marginBottom: 0 }]}>
                  As of {stockData.snapshot_date}
                </Text>
              )}
            </View>
          )}

          {/* FRED Economic Indicators */}
          {fredData.length > 0 && (() => {
            const seriesIds = Array.from(new Set(fredData.map((o) => o.series_id)));
            return (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="analytics-outline" size={16} color="#10B981" />
                  <Text style={styles.cardTitle}>Economic Indicators (FRED)</Text>
                </View>
                {seriesIds.map((sid) => {
                  const latest = fredData.find((o) => o.series_id === sid);
                  if (!latest || latest.value == null) return null;
                  return (
                    <View key={sid} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{sid}</Text>
                      <Text style={styles.breakdownValue}>{latest.value.toFixed(2)}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}
        </View>
      )}

      {/* === Filings Tab === */}
      {activeTab === 'filings' && (() => {
        const filingTypes = Array.from(new Set(filings.map((f) => f.form_type).filter(Boolean)));
        const filingFilterOptions: FilterOption[] = [
          { key: 'all', label: 'All' },
          ...filingTypes.slice(0, 3).map((t) => ({ key: t, label: t })),
        ];
        const filteredFilings = filingTypeFilter === 'all'
          ? filings
          : filings.filter((f) => f.form_type === filingTypeFilter);
        return (
        <View style={styles.tabContent}>
          {filings.length > 0 && filingTypes.length > 1 && (
            <View style={{ marginBottom: 10 }}>
              <FilterPillGroup options={filingFilterOptions} selected={filingTypeFilter} onSelect={setFilingTypeFilter} scrollable />
            </View>
          )}
          {filteredFilings.length === 0 ? (
            <EmptyState title="No filings yet" message="Run data sync to ingest SEC filings." />
          ) : (
            filteredFilings.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={styles.filingCard}
                onPress={() => f.primary_doc_url && Linking.openURL(f.primary_doc_url)}
                activeOpacity={f.primary_doc_url ? 0.7 : 1}
                accessibilityRole="link"
              >
                <View style={styles.filingHeader}>
                  <View style={styles.formBadge}>
                    <Text style={styles.formBadgeText}>{f.form_type}</Text>
                  </View>
                  <Text style={styles.filingDate}>{f.filing_date || 'N/A'}</Text>
                </View>
                {f.description && (
                  <Text style={styles.filingDesc} numberOfLines={2}>{f.description}</Text>
                )}
                {f.primary_doc_url && (
                  <View style={styles.linkRow}>
                    <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                    <Text style={styles.linkText}>View on SEC EDGAR</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
        );
      })()}

      {/* === Complaints Tab === */}
      {activeTab === 'complaints' && (() => {
        const complaintProducts = Array.from(new Set(complaints.map((c) => c.product).filter(Boolean)));
        const complaintFilterOptions: FilterOption[] = [
          { key: 'all', label: 'All' },
          ...complaintProducts.slice(0, 3).map((p) => ({ key: p!, label: p!.length > 16 ? p!.substring(0, 14) + '…' : p! })),
        ];
        const filteredComplaints = complaintProductFilter === 'all'
          ? complaints
          : complaints.filter((c) => c.product === complaintProductFilter);
        return (
        <View style={styles.tabContent}>
          {complaints.length > 0 && complaintProducts.length > 1 && (
            <View style={{ marginBottom: 10 }}>
              <FilterPillGroup options={complaintFilterOptions} selected={complaintProductFilter} onSelect={setComplaintProductFilter} scrollable />
            </View>
          )}
          {filteredComplaints.length === 0 ? (
            <EmptyState title="No complaints yet" message="Run data sync to ingest CFPB complaints." />
          ) : (
            <FlatList
              data={filteredComplaints}
              keyExtractor={(item) => String(item.id)}
              scrollEnabled={false}
              renderItem={({ item: c }) => {
                const complaintUrl = c.complaint_id
                  ? `https://www.consumerfinance.gov/data-research/consumer-complaints/search/detail/${c.complaint_id}`
                  : null;
                return (
                  <TouchableOpacity
                    style={styles.complaintCard}
                    onPress={() => complaintUrl && Linking.openURL(complaintUrl)}
                    disabled={!complaintUrl}
                    accessibilityRole="link"
                  >
                    <View style={styles.complaintHeader}>
                      <Text style={styles.complaintProduct}>{c.product || 'Unknown Product'}</Text>
                      <Text style={styles.complaintDate}>{c.date_received || 'N/A'}</Text>
                    </View>
                    <Text style={styles.complaintIssue} numberOfLines={2}>
                      {c.issue || 'No issue description'}
                    </Text>
                    <View style={styles.complaintMeta}>
                      {c.company_response && (
                        <Text style={styles.complaintResponse} numberOfLines={1}>
                          {c.company_response}
                        </Text>
                      )}
                      {c.timely_response && (
                        <View style={[styles.timelyBadge, {
                          backgroundColor: c.timely_response === 'Yes' ? '#10B981' + '15' : '#DC2626' + '15',
                        }]}>
                          <Text style={[styles.timelyText, {
                            color: c.timely_response === 'Yes' ? '#10B981' : '#DC2626',
                          }]}>
                            {c.timely_response === 'Yes' ? 'Timely' : 'Late'}
                          </Text>
                        </View>
                      )}
                      {c.state && <Text style={styles.complaintState}>{c.state}</Text>}
                    </View>
                    {complaintUrl && (
                      <View style={[styles.linkRow, { marginTop: 6 }]}>
                        <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                        <Text style={styles.linkText}>View on CFPB</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
        );
      })()}

      {/* === Insider Trades Tab === */}
      {activeTab === 'insider' && (
        <View style={styles.tabContent}>
          {insiderLoading ? (
            <LoadingSpinner message="Loading insider trades..." />
          ) : insiderTrades.length === 0 ? (
            <EmptyState title="No insider trades" message="No SEC Form 4 filings on record yet." />
          ) : (() => {
            const TYPE_LABELS: Record<string, string> = { P: 'Purchase', S: 'Sale', A: 'Award' };
            const types = Array.from(new Set(insiderTrades.map((t) => t.transaction_type).filter(Boolean)));
            const typeOptions: FilterOption[] = [
              { key: 'all', label: 'All' },
              ...types.map((t) => ({ key: t!, label: TYPE_LABELS[t!] || t! })),
            ];
            const filtered = insiderTypeFilter === 'all'
              ? insiderTrades
              : insiderTrades.filter((t) => t.transaction_type === insiderTypeFilter);
            return (
              <>
                {types.length > 1 && (
                  <View style={{ marginBottom: 10 }}>
                    <FilterPillGroup options={typeOptions} selected={insiderTypeFilter} onSelect={setInsiderTypeFilter} scrollable />
                  </View>
                )}
                <Text style={styles.sectionTitle}>Form 4 Filings ({filtered.length})</Text>
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => String(item.id)}
                  scrollEnabled={false}
                  renderItem={({ item: trade }) => {
                    const typeColor = trade.transaction_type === 'P' ? '#10B981'
                      : trade.transaction_type === 'S' ? '#DC2626' : '#F59E0B';
                    return (
                      <TouchableOpacity
                        style={styles.card}
                        onPress={() => trade.filing_url && Linking.openURL(trade.filing_url)}
                        disabled={!trade.filing_url}
                        accessibilityRole="link"
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={[styles.insiderTypeBadge, { backgroundColor: typeColor + '15' }]}>
                              <Text style={[styles.insiderTypeText, { color: typeColor }]}>
                                {TYPE_LABELS[trade.transaction_type || ''] || trade.transaction_type || '?'}
                              </Text>
                            </View>
                            <Text style={styles.insiderName} numberOfLines={1}>{trade.filer_name}</Text>
                          </View>
                          {trade.filing_url && <Ionicons name="open-outline" size={14} color={UI_COLORS.TEXT_MUTED} />}
                        </View>
                        {trade.filer_title && (
                          <Text style={styles.insiderTitle}>{trade.filer_title}</Text>
                        )}
                        <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                          {trade.shares != null && (
                            <Text style={styles.insiderDetail}>
                              {trade.shares.toLocaleString()} shares
                            </Text>
                          )}
                          {trade.price_per_share != null && (
                            <Text style={styles.insiderDetail}>
                              @ ${trade.price_per_share.toFixed(2)}
                            </Text>
                          )}
                          {trade.total_value != null && (
                            <Text style={[styles.insiderDetail, { fontWeight: '700' }]}>
                              ${trade.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                          )}
                        </View>
                        {trade.transaction_date && (
                          <Text style={styles.cardDate}>{trade.transaction_date}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
              </>
            );
          })()}
        </View>
      )}

      {/* === Lobbying Tab === */}
      {activeTab === 'lobbying' && (
        <LobbyingTab filings={lobbyingFilings} summary={lobbySummary} loading={lobbyingLoading} />
      )}

      {/* === Contracts Tab === */}
      {activeTab === 'contracts' && (
        <ContractsTab contracts={contractsList} summary={contractSummary} loading={contractsLoading} />
      )}

      {/* === Enforcement Tab === */}
      {activeTab === 'enforcement' && (
        <EnforcementTab actions={enforcementActions} totalPenalties={enfTotalPenalties} loading={enforcementLoading} />
      )}

      {/* === Donations Tab === */}
      {activeTab === 'donations' && (
        <DonationsTab donations={donations} loading={donationsLoading} />
      )}

      {/* === News Tab === */}
      {activeTab === 'news' && (
        <View style={styles.tabContent}>
          {newsLoading ? (
            <LoadingSpinner message="Loading news..." />
          ) : news.length === 0 ? (
            <EmptyState title="No recent news" message="No articles found for this institution." />
          ) : (
            news.map((article, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.newsCard}
                onPress={() => article.link && Linking.openURL(article.link)}
                activeOpacity={0.7}
                accessibilityRole="link"
              >
                <View style={styles.newsSourceRow}>
                  {article.source ? (
                    <Text style={styles.newsSource}>{article.source}</Text>
                  ) : null}
                  <Text style={styles.newsDate}>{formatNewsDate(article.published)}</Text>
                </View>
                <Text style={styles.newsTitle} numberOfLines={3}>{article.title}</Text>
                <View style={styles.linkRow}>
                  <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                  <Text style={styles.linkText}>Read article</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

function FinRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.finRow}>
      <Text style={styles.finLabel}>{label}</Text>
      <Text style={styles.finValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 32 },

  // Header
  header: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  headerLogo: {
    width: 64, height: 64, borderRadius: 16, backgroundColor: '#F0F2EF', marginBottom: 12,
  },
  headerIcon: {
    width: 64, height: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  headerIconText: { fontSize: 20, fontWeight: '900' },
  headerName: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTicker: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 14, fontWeight: '700' },
  headerHQ: { color: UI_COLORS.TEXT_MUTED, fontSize: 12 },

  // Tabs
  tabRow: {
    borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER, marginBottom: 12,
  },
  tabRowContent: {
    flexDirection: 'row', paddingHorizontal: 8,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 10, gap: 4,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: UI_COLORS.ACCENT },
  tabText: { color: UI_COLORS.TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: UI_COLORS.ACCENT },

  tabContent: { paddingHorizontal: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statHalf: { width: '48%' as any, flexGrow: 1 },

  // Cards
  card: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardTitle: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 15, fontWeight: '700' },
  cardSubtitle: { color: UI_COLORS.TEXT_MUTED, fontSize: 11, marginBottom: 12 },
  finGrid: { gap: 8 },
  finRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  finLabel: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 13 },
  finValue: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  breakdownRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER,
  },
  breakdownLabel: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, flex: 1, marginRight: 8 },
  breakdownValue: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Stock grid
  stockGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  stockItem: {
    width: '47%' as any,
    backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 8, padding: 10,
  },
  stockLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginBottom: 2 },
  stockVal: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },

  // Filings
  filingCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  filingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  formBadge: { backgroundColor: '#2563EB' + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  formBadgeText: { color: '#2563EB', fontSize: 11, fontWeight: '700' },
  filingDate: { color: UI_COLORS.TEXT_MUTED, fontSize: 11 },
  filingDesc: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, lineHeight: 16, marginBottom: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { color: UI_COLORS.ACCENT, fontSize: 11, fontWeight: '600' },

  // Complaints
  complaintCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  complaintHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  complaintProduct: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '600', flex: 1 },
  complaintDate: { color: UI_COLORS.TEXT_MUTED, fontSize: 11 },
  complaintIssue: { color: UI_COLORS.TEXT_SECONDARY, fontSize: 12, lineHeight: 16, marginBottom: 8 },
  complaintMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  complaintResponse: { color: UI_COLORS.TEXT_MUTED, fontSize: 10, flex: 1 },
  timelyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  timelyText: { fontSize: 10, fontWeight: '600' },
  complaintState: { color: UI_COLORS.TEXT_MUTED, fontSize: 10, fontWeight: '600' },

  // News
  newsCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  newsSourceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  newsSource: {
    fontSize: 11, fontWeight: '700', color: UI_COLORS.ACCENT, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  newsDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  newsTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 20, marginBottom: 8 },
  insiderTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  insiderTypeText: { fontSize: 11, fontWeight: '700' },
  insiderName: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, flex: 1 },
  insiderTitle: { fontSize: 11, color: UI_COLORS.TEXT_SECONDARY, marginBottom: 2 },
  insiderDetail: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 8 },
  cardDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 4 },
});
