import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  StyleSheet, RefreshControl, Dimensions, Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, HEALTH_SECTOR_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type {
  CompanyDetail, FDAAdverseEvent, FDARecall,
  ClinicalTrialItem, CMSPaymentItem, PaymentSummary,
  SECFiling, StockSnapshot,
} from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';
import SanctionsBadge from '../components/SanctionsBadge';
import { FilterPillGroup, FilterOption } from '../components/FilterPillGroup';
import { LobbyingTab, ContractsTab, EnforcementTab, DonationsTab } from '../components/company';

const { width } = Dimensions.get('window');

type Tab = 'overview' | 'safety' | 'trials' | 'filings' | 'lobbying' | 'contracts' | 'enforcement' | 'donations';

export default function CompanyScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const companyId: string = route.params?.company_id;

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  // Safety tab data
  const [events, setEvents] = useState<FDAAdverseEvent[]>([]);
  const [recalls, setRecalls] = useState<FDARecall[]>([]);
  const [safetyLoading, setSafetyLoading] = useState(false);

  // Trials tab data
  const [trials, setTrials] = useState<ClinicalTrialItem[]>([]);
  const [trialsLoading, setTrialsLoading] = useState(false);

  // Filings tab data
  const [filings, setFilings] = useState<SECFiling[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(false);
  const [stockData, setStockData] = useState<StockSnapshot | null>(null);

  // Safety filters
  const [recallFilter, setRecallFilter] = useState<string>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');

  // Political tabs data
  const [lobbyingFilings, setLobbyingFilings] = useState<any[] | null>(null);
  const [lobbySummary, setLobbySummary] = useState<any>(null);
  const [lobbyingLoading, setLobbyingLoading] = useState(false);
  const [contractsList, setContractsList] = useState<any[] | null>(null);
  const [contractSummary, setContractSummary] = useState<any>(null);
  const [contractsListLoading, setContractsListLoading] = useState(false);
  const [enforcementActions, setEnforcementActions] = useState<any[] | null>(null);
  const [enfTotalPenalties, setEnfTotalPenalties] = useState(0);
  const [enforcementLoading, setEnforcementLoading] = useState(false);
  const [donations, setDonations] = useState<any[] | null>(null);
  const [donationsLoading, setDonationsLoading] = useState(false);

  // Overview extras
  const [payments, setPayments] = useState<CMSPaymentItem[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);

  const loadCompany = useCallback(async () => {
    try {
      const data = await apiClient.getCompanyDetail(companyId);
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

  // Load safety data when tab switches
  useEffect(() => {
    if (tab === 'safety' && events.length === 0 && recalls.length === 0 && !safetyLoading) {
      setSafetyLoading(true);
      Promise.all([
        apiClient.getCompanyAdverseEvents(companyId, { limit: 50 }),
        apiClient.getCompanyRecalls(companyId, { limit: 50 }),
      ])
        .then(([evRes, recRes]) => {
          setEvents(evRes.adverse_events || []);
          setRecalls(recRes.recalls || []);
        })
        .catch(() => {})
        .finally(() => setSafetyLoading(false));
    }
  }, [tab, companyId]);

  // Load trials when tab switches
  useEffect(() => {
    if (tab === 'trials' && trials.length === 0 && !trialsLoading) {
      setTrialsLoading(true);
      apiClient.getCompanyTrials(companyId, { limit: 50 })
        .then((res) => setTrials(res.trials || []))
        .catch(() => {})
        .finally(() => setTrialsLoading(false));
    }
  }, [tab, companyId]);

  // Load filings when tab switches
  useEffect(() => {
    if (tab === 'filings' && filings.length === 0 && !filingsLoading) {
      setFilingsLoading(true);
      apiClient.getCompanyFilings(companyId, { limit: 20 })
        .then((res) => setFilings(res.filings || []))
        .catch(() => {})
        .finally(() => setFilingsLoading(false));
    }
  }, [tab, companyId]);

  // Load stock data on mount
  useEffect(() => {
    apiClient.getCompanyStock(companyId)
      .then((res) => setStockData(res.stock || null))
      .catch(() => {});
  }, [companyId]);

  // Load payment data on mount
  useEffect(() => {
    Promise.all([
      apiClient.getCompanyPayments(companyId, { limit: 50 }),
      apiClient.getCompanyPaymentSummary(companyId),
    ])
      .then(([payRes, sumRes]) => {
        setPayments(payRes.payments || []);
        setPaymentSummary(sumRes);
      })
      .catch(() => {});
  }, [companyId]);

  // Lazy-load lobbying
  useEffect(() => {
    if (tab === 'lobbying' && lobbyingFilings === null && !lobbyingLoading) {
      setLobbyingLoading(true);
      Promise.all([
        apiClient.getHealthCompanyLobbying(companyId, { limit: 25 }),
        apiClient.getHealthCompanyLobbySummary(companyId),
      ])
        .then(([filRes, sumRes]) => {
          setLobbyingFilings(filRes.filings || []);
          setLobbySummary(sumRes);
        })
        .catch(() => setLobbyingFilings([]))
        .finally(() => setLobbyingLoading(false));
    }
  }, [tab, companyId]);

  // Lazy-load contracts
  useEffect(() => {
    if (tab === 'contracts' && contractsList === null && !contractsListLoading) {
      setContractsListLoading(true);
      Promise.all([
        apiClient.getHealthCompanyContracts(companyId, { limit: 25 }),
        apiClient.getHealthCompanyContractSummary(companyId),
      ])
        .then(([ctRes, sumRes]) => {
          setContractsList(ctRes.contracts || []);
          setContractSummary(sumRes);
        })
        .catch(() => setContractsList([]))
        .finally(() => setContractsListLoading(false));
    }
  }, [tab, companyId]);

  // Lazy-load enforcement
  useEffect(() => {
    if (tab === 'enforcement' && enforcementActions === null && !enforcementLoading) {
      setEnforcementLoading(true);
      apiClient.getHealthCompanyEnforcement(companyId, { limit: 50 })
        .then((res) => {
          setEnforcementActions(res.actions || []);
          setEnfTotalPenalties(res.total_penalties || 0);
        })
        .catch(() => setEnforcementActions([]))
        .finally(() => setEnforcementLoading(false));
    }
  }, [tab, companyId]);

  // Lazy-load donations
  useEffect(() => {
    if (tab === 'donations' && donations === null && !donationsLoading) {
      setDonationsLoading(true);
      apiClient.getHealthCompanyDonations(companyId, { limit: 50 })
        .then((res) => setDonations(res.donations || res || []))
        .catch(() => setDonations([]))
        .finally(() => setDonationsLoading(false));
    }
  }, [tab, companyId]);

  const onRefresh = () => { setRefreshing(true); loadCompany(); };

  if (loading) return <LoadingSpinner message="Loading company..." />;
  if (error || !company) return <EmptyState title="Error" message={error || 'Company not found'} onRetry={loadCompany} />;

  const sectorColor = HEALTH_SECTOR_COLORS[company.sector_type] || '#6B7280';

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {([
          { key: 'overview' as Tab, label: 'Overview', icon: 'grid-outline' },
          { key: 'lobbying' as Tab, label: 'Lobbying', icon: 'megaphone-outline' },
          { key: 'contracts' as Tab, label: 'Contracts', icon: 'briefcase-outline' },
          { key: 'enforcement' as Tab, label: 'Enforcement', icon: 'shield-checkmark-outline' },
          { key: 'donations' as Tab, label: 'Donations', icon: 'heart-outline' },
          { key: 'safety' as Tab, label: 'Safety', icon: 'shield-outline' },
          { key: 'trials' as Tab, label: 'Trials', icon: 'flask-outline' },
          { key: 'filings' as Tab, label: 'Filings', icon: 'document-text-outline' },
        ]).map((t) => (
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
              size={16}
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
            <Ionicons name="medkit" size={28} color={sectorColor} />
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
        {tab === 'overview' && renderOverview(company, paymentSummary, stockData, sectorColor, setTab)}
        {tab === 'lobbying' && <LobbyingTab filings={lobbyingFilings} summary={lobbySummary} loading={lobbyingLoading} />}
        {tab === 'contracts' && <ContractsTab contracts={contractsList} summary={contractSummary} loading={contractsListLoading} />}
        {tab === 'enforcement' && <EnforcementTab actions={enforcementActions} totalPenalties={enfTotalPenalties} loading={enforcementLoading} />}
        {tab === 'donations' && <DonationsTab donations={donations} loading={donationsLoading} />}
        {tab === 'safety' && renderSafety(events, recalls, safetyLoading, recallFilter, setRecallFilter, eventFilter, setEventFilter)}
        {tab === 'trials' && renderTrials(trials, trialsLoading)}
        {tab === 'filings' && renderFilings(filings, filingsLoading)}
      </ScrollView>
    </View>
  );
}

// ── Overview Tab ──
function renderOverview(
  company: CompanyDetail,
  paymentSummary: PaymentSummary | null,
  stockData: StockSnapshot | null,
  sectorColor: string,
  setTab: (tab: Tab) => void,
) {
  return (
    <View style={styles.tabContent}>
      {/* Stats row — tap to jump to tab */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('safety')} accessibilityRole="button" accessibilityLabel="View Events">
          <Ionicons name="warning-outline" size={18} color="#E11D48" />
          <Text style={styles.miniStatVal}>{company.adverse_event_count}</Text>
          <Text style={styles.miniStatLabel}>Events</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('safety')} accessibilityRole="button" accessibilityLabel="View Recalls">
          <Ionicons name="alert-circle-outline" size={18} color="#F59E0B" />
          <Text style={styles.miniStatVal}>{company.recall_count}</Text>
          <Text style={styles.miniStatLabel}>Recalls</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('trials')} accessibilityRole="button" accessibilityLabel="View Trials">
          <Ionicons name="flask-outline" size={18} color="#10B981" />
          <Text style={styles.miniStatVal}>{company.trial_count}</Text>
          <Text style={styles.miniStatLabel}>Trials</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('overview')} accessibilityRole="button" accessibilityLabel="View Payments">
          <Ionicons name="cash-outline" size={18} color="#2563EB" />
          <Text style={styles.miniStatVal}>{company.payment_count}</Text>
          <Text style={styles.miniStatLabel}>Payments</Text>
        </TouchableOpacity>
      </View>

      {/* Serious events */}
      {company.serious_event_count > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="warning" size={16} color="#E11D48" />
            <Text style={styles.cardTitle}>Serious Adverse Events</Text>
          </View>
          <Text style={[styles.bigNum, { color: '#E11D48' }]}>{company.serious_event_count}</Text>
          <Text style={styles.cardSub}>of {company.adverse_event_count} total events flagged as serious</Text>
        </View>
      )}

      {/* Latest recall */}
      {company.latest_recall && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="alert-circle" size={16} color="#F59E0B" />
            <Text style={styles.cardTitle}>Latest Recall</Text>
          </View>
          <View style={styles.recallBadgeRow}>
            <View style={[styles.classBadge, {
              backgroundColor: company.latest_recall.classification === 'Class I' ? '#FEE2E2'
                : company.latest_recall.classification === 'Class II' ? '#FEF3C7' : '#E0F2FE',
            }]}>
              <Text style={[styles.classBadgeText, {
                color: company.latest_recall.classification === 'Class I' ? '#DC2626'
                  : company.latest_recall.classification === 'Class II' ? '#D97706' : '#2563EB',
              }]}>{company.latest_recall.classification || 'Unknown'}</Text>
            </View>
            {company.latest_recall.status && (
              <Text style={styles.recallStatus}>{company.latest_recall.status}</Text>
            )}
          </View>
          {company.latest_recall.product_description && (
            <Text style={styles.cardText} numberOfLines={3}>
              {company.latest_recall.product_description}
            </Text>
          )}
          {company.latest_recall.reason_for_recall && (
            <Text style={styles.cardReason} numberOfLines={2}>
              Reason: {company.latest_recall.reason_for_recall}
            </Text>
          )}
          {company.latest_recall.recall_initiation_date && (
            <Text style={styles.cardDate}>Initiated: {company.latest_recall.recall_initiation_date}</Text>
          )}
        </View>
      )}

      {/* Trials by status */}
      {company.trials_by_status && Object.keys(company.trials_by_status).length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="flask" size={16} color="#10B981" />
            <Text style={styles.cardTitle}>Trials by Status</Text>
          </View>
          {Object.entries(company.trials_by_status).map(([status, count]) => (
            <View key={status} style={styles.trialStatusRow}>
              <View style={[styles.statusDot, { backgroundColor: getTrialStatusColor(status) }]} />
              <Text style={styles.trialStatusLabel}>{status}</Text>
              <Text style={styles.trialStatusCount}>{count}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Stock fundamentals */}
      {stockData && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="trending-up" size={16} color="#2563EB" />
            <Text style={styles.cardTitle}>Stock Fundamentals</Text>
          </View>
          <View style={styles.stockGrid}>
            {stockData.market_cap != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Market Cap</Text>
                <Text style={styles.stockVal}>${formatLargeNum(stockData.market_cap)}</Text>
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
                <Text style={styles.stockVal}>{(stockData.profit_margin * 100).toFixed(1)}%</Text>
              </View>
            )}
            {stockData.dividend_yield != null && (
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Dividend Yield</Text>
                <Text style={styles.stockVal}>{(stockData.dividend_yield * 100).toFixed(2)}%</Text>
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
            <Text style={styles.cardDate}>As of {stockData.snapshot_date}</Text>
          )}
        </View>
      )}

      {/* Payment summary */}
      {paymentSummary && paymentSummary.total_payments > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cash" size={16} color="#2563EB" />
            <Text style={styles.cardTitle}>Payments to Physicians</Text>
          </View>
          <Text style={[styles.bigNum, { color: '#2563EB' }]}>
            ${paymentSummary.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Text>
          <Text style={styles.cardSub}>{paymentSummary.total_payments} total payments</Text>
          {Object.keys(paymentSummary.by_nature).length > 0 && (
            <View style={styles.summaryList}>
              <Text style={styles.summaryLabel}>By Payment Type</Text>
              {Object.entries(paymentSummary.by_nature).slice(0, 5).map(([nature, count]) => (
                <View key={nature} style={styles.summaryRow}>
                  <Text style={styles.summaryText} numberOfLines={1}>{nature}</Text>
                  <Text style={styles.summaryCount}>{count}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Safety Tab ──
const RECALL_FILTERS: FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'Class I', label: 'Class I' },
  { key: 'Class II', label: 'Class II' },
  { key: 'Class III', label: 'Class III' },
];

const EVENT_FILTERS: FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'serious', label: 'Serious' },
  { key: 'not-serious', label: 'Not Serious' },
];

function renderSafety(
  events: FDAAdverseEvent[],
  recalls: FDARecall[],
  loading: boolean,
  recallFilter: string,
  setRecallFilter: (v: string) => void,
  eventFilter: string,
  setEventFilter: (v: string) => void,
) {
  if (loading) return <LoadingSpinner message="Loading safety data..." />;

  const filteredRecalls = recallFilter === 'all'
    ? recalls
    : recalls.filter((r) => r.classification === recallFilter);

  const filteredEvents = eventFilter === 'all'
    ? events
    : eventFilter === 'serious'
      ? events.filter((e) => e.serious === 1)
      : events.filter((e) => e.serious !== 1);

  return (
    <View style={styles.tabContent}>
      {/* Recalls section */}
      <Text style={styles.tabSectionTitle}>FDA Recalls ({filteredRecalls.length})</Text>
      {recalls.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <FilterPillGroup options={RECALL_FILTERS} selected={recallFilter} onSelect={setRecallFilter} scrollable />
        </View>
      )}
      {filteredRecalls.length === 0 ? (
        <EmptyState title="No recalls found" message="No FDA recall actions on record." />
      ) : (
        <FlatList
          data={filteredRecalls}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={false}
          renderItem={({ item: r }) => {
            const recallUrl = r.recall_number
              ? `https://api.fda.gov/drug/enforcement.json?search=recall_number:"${r.recall_number}"&limit=1`
              : null;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => recallUrl && Linking.openURL(recallUrl)}
                disabled={!recallUrl}
                accessibilityRole="link"
              >
                <View style={styles.recallBadgeRow}>
                  <View style={[styles.classBadge, {
                    backgroundColor: r.classification === 'Class I' ? '#FEE2E2'
                      : r.classification === 'Class II' ? '#FEF3C7' : '#E0F2FE',
                  }]}>
                    <Text style={[styles.classBadgeText, {
                      color: r.classification === 'Class I' ? '#DC2626'
                        : r.classification === 'Class II' ? '#D97706' : '#2563EB',
                    }]}>{r.classification || 'Unknown'}</Text>
                  </View>
                  {r.recall_number && <Text style={styles.recallNum}>#{r.recall_number}</Text>}
                  {r.status && <Text style={styles.recallStatus}>{r.status}</Text>}
                </View>
                {r.product_description && (
                  <Text style={styles.cardText} numberOfLines={3}>{r.product_description}</Text>
                )}
                {r.reason_for_recall && (
                  <Text style={styles.cardReason} numberOfLines={2}>Reason: {r.reason_for_recall}</Text>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  {r.recall_initiation_date && (
                    <Text style={styles.cardDate}>{r.recall_initiation_date}</Text>
                  )}
                  {r.recall_number && (
                    <View style={styles.sourceLink}>
                      <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                      <Text style={styles.sourceLinkText}>FDA</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Adverse events section */}
      <Text style={[styles.tabSectionTitle, { marginTop: 20 }]}>Adverse Events ({filteredEvents.length})</Text>
      {events.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <FilterPillGroup options={EVENT_FILTERS} selected={eventFilter} onSelect={setEventFilter} scrollable />
        </View>
      )}
      {filteredEvents.length === 0 ? (
        <EmptyState title="No adverse events found" message="No FDA adverse event reports on file." />
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={false}
          renderItem={({ item: e }) => {
            const eventUrl = e.report_id
              ? `https://api.fda.gov/drug/event.json?search=safetyreportid:"${e.report_id}"&limit=1`
              : null;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => eventUrl && Linking.openURL(eventUrl)}
                disabled={!eventUrl}
                accessibilityRole="link"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {e.serious === 1 && (
                    <View style={styles.seriousBadge}>
                      <Text style={styles.seriousBadgeText}>SERIOUS</Text>
                    </View>
                  )}
                  {e.drug_name && <Text style={styles.drugName}>{e.drug_name}</Text>}
                </View>
                {e.reaction && (
                  <Text style={styles.cardText} numberOfLines={2}>{e.reaction}</Text>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {e.outcome && <Text style={styles.outcome}>{e.outcome}</Text>}
                    {e.receive_date && <Text style={styles.cardDate}>{e.receive_date}</Text>}
                  </View>
                  {eventUrl && (
                    <View style={styles.sourceLink}>
                      <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                      <Text style={styles.sourceLinkText}>openFDA</Text>
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

// ── Trials Tab ──
function renderTrials(trials: ClinicalTrialItem[], loading: boolean) {
  if (loading) return <LoadingSpinner message="Loading trials..." />;

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabSectionTitle}>Clinical Trials ({trials.length})</Text>
      {trials.length === 0 ? (
        <EmptyState title="No clinical trials found" message="No ClinicalTrials.gov studies on record." />
      ) : (
        <FlatList
          data={trials}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={false}
          renderItem={({ item: t }) => {
            const trialUrl = t.nct_id
              ? `https://clinicaltrials.gov/study/${t.nct_id}`
              : null;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => trialUrl && Linking.openURL(trialUrl)}
                disabled={!trialUrl}
                accessibilityRole="link"
              >
                {/* Status + Phase */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <View style={[styles.statusBadge, { backgroundColor: getTrialStatusColor(t.overall_status || '') + '15' }]}>
                    <View style={[styles.statusDot, { backgroundColor: getTrialStatusColor(t.overall_status || '') }]} />
                    <Text style={[styles.statusBadgeText, { color: getTrialStatusColor(t.overall_status || '') }]}>
                      {t.overall_status || 'Unknown'}
                    </Text>
                  </View>
                  {t.phase && (
                    <View style={styles.phaseBadge}>
                      <Text style={styles.phaseBadgeText}>{t.phase}</Text>
                    </View>
                  )}
                </View>

                {/* NCT ID */}
                <Text style={styles.nctId}>{t.nct_id}</Text>

                {/* Title */}
                {t.title && <Text style={styles.trialTitle} numberOfLines={3}>{t.title}</Text>}

                {/* Conditions */}
                {t.conditions && (
                  <Text style={styles.trialConditions} numberOfLines={2}>
                    Conditions: {t.conditions}
                  </Text>
                )}

                {/* Bottom row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <View>
                    {t.enrollment != null && (
                      <Text style={styles.enrollment}>Enrollment: {t.enrollment.toLocaleString()}</Text>
                    )}
                    {t.start_date && <Text style={styles.cardDate}>Started: {t.start_date}</Text>}
                  </View>
                  {trialUrl && (
                    <View style={styles.sourceLink}>
                      <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                      <Text style={styles.sourceLinkText}>ClinicalTrials.gov</Text>
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

// ── Filings Tab ──
function renderFilings(filings: SECFiling[], loading: boolean) {
  if (loading) return <LoadingSpinner message="Loading filings..." />;

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabSectionTitle}>SEC Filings ({filings.length})</Text>
      {filings.length === 0 ? (
        <EmptyState title="No SEC filings" message="No SEC EDGAR filings on record." />
      ) : (
        filings.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={styles.card}
            onPress={() => f.primary_doc_url && Linking.openURL(f.primary_doc_url)}
            disabled={!f.primary_doc_url}
            accessibilityRole="link"
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <View style={styles.formBadge}>
                <Text style={styles.formBadgeText}>{f.form_type}</Text>
              </View>
              <Text style={styles.cardDate}>{f.filing_date || 'N/A'}</Text>
            </View>
            {f.description && (
              <Text style={styles.cardText} numberOfLines={2}>{f.description}</Text>
            )}
            {f.primary_doc_url && (
              <View style={styles.sourceLink}>
                <Ionicons name="open-outline" size={12} color={UI_COLORS.ACCENT} />
                <Text style={styles.sourceLinkText}>View on SEC EDGAR</Text>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
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

function getTrialStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('recruiting') && !s.includes('not')) return '#10B981';
  if (s.includes('completed')) return '#2563EB';
  if (s.includes('active')) return '#8B5CF6';
  if (s.includes('terminated') || s.includes('withdrawn') || s.includes('suspended')) return '#DC2626';
  if (s.includes('not yet')) return '#F59E0B';
  return '#64748B';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },

  // Tab bar
  tabBar: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER_LIGHT,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 10, gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: UI_COLORS.ACCENT },
  tabText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
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
  cardReason: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, fontStyle: 'italic', marginBottom: 4 },
  cardDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  cardSub: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  bigNum: { fontSize: 28, fontWeight: '800', marginTop: 4 },

  // Recall badges
  recallBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  classBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  classBadgeText: { fontSize: 11, fontWeight: '700' },
  recallNum: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, fontFamily: 'monospace' },
  recallStatus: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, fontWeight: '600' },

  // Safety
  seriousBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  seriousBadgeText: { fontSize: 9, fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },
  drugName: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  outcome: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },

  // Trials
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  phaseBadge: { backgroundColor: '#F0F2EF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  phaseBadgeText: { fontSize: 11, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  nctId: { fontSize: 11, fontWeight: '600', color: UI_COLORS.ACCENT, fontFamily: 'monospace', marginBottom: 4 },
  trialTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 20, marginBottom: 4 },
  trialConditions: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginBottom: 4 },
  enrollment: { fontSize: 11, color: UI_COLORS.TEXT_SECONDARY, fontWeight: '600' },
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourceLinkText: { fontSize: 11, fontWeight: '600', color: UI_COLORS.ACCENT },

  // Stock grid
  stockGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  stockItem: {
    width: '47%' as any,
    backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 8, padding: 10,
  },
  stockLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginBottom: 2 },
  stockVal: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },

  // Filings
  formBadge: { backgroundColor: '#2563EB' + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  formBadgeText: { color: '#2563EB', fontSize: 11, fontWeight: '700' },

  // Trials by status (overview)
  trialStatusRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  trialStatusLabel: { flex: 1, fontSize: 13, color: UI_COLORS.TEXT_SECONDARY },
  trialStatusCount: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },

  // Payment summary
  summaryList: { marginTop: 12 },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginBottom: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryText: { flex: 1, fontSize: 13, color: UI_COLORS.TEXT_SECONDARY },
  summaryCount: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginLeft: 12 },
});
