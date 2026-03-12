import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  StyleSheet, RefreshControl, Dimensions, Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type {
  CompanyDetail, FDAAdverseEvent, FDARecall,
  ClinicalTrialItem, CMSPaymentItem, PaymentSummary,
} from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';

const { width } = Dimensions.get('window');

const SECTOR_COLORS: Record<string, string> = {
  pharma: '#2563EB',
  biotech: '#8B5CF6',
  insurer: '#F59E0B',
  pharmacy: '#10B981',
  distributor: '#64748B',
};

type Tab = 'overview' | 'safety' | 'trials';

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

  // Load payment data on mount
  useEffect(() => {
    Promise.all([
      apiClient.getCompanyPayments(companyId, { limit: 10 }),
      apiClient.getCompanyPaymentSummary(companyId),
    ])
      .then(([payRes, sumRes]) => {
        setPayments(payRes.payments || []);
        setPaymentSummary(sumRes);
      })
      .catch(() => {});
  }, [companyId]);

  const onRefresh = () => { setRefreshing(true); loadCompany(); };

  if (loading) return <LoadingSpinner message="Loading company..." />;
  if (error || !company) return <EmptyState title="Error" message={error || 'Company not found'} />;

  const sectorColor = SECTOR_COLORS[company.sector_type] || '#6B7280';

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['overview', 'safety', 'trials'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Ionicons
              name={t === 'overview' ? 'grid-outline' : t === 'safety' ? 'shield-outline' : 'flask-outline'}
              size={16}
              color={tab === t ? UI_COLORS.ACCENT : UI_COLORS.TEXT_MUTED}
            />
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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

        {/* Tab Content */}
        {tab === 'overview' && renderOverview(company, paymentSummary, sectorColor, setTab)}
        {tab === 'safety' && renderSafety(events, recalls, safetyLoading)}
        {tab === 'trials' && renderTrials(trials, trialsLoading)}
      </ScrollView>
    </View>
  );
}

// ── Overview Tab ──
function renderOverview(
  company: CompanyDetail,
  paymentSummary: PaymentSummary | null,
  sectorColor: string,
  setTab: (tab: Tab) => void,
) {
  return (
    <View style={styles.tabContent}>
      {/* Stats row — tap to jump to tab */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('safety')}>
          <Ionicons name="warning-outline" size={18} color="#E11D48" />
          <Text style={styles.miniStatVal}>{company.adverse_event_count}</Text>
          <Text style={styles.miniStatLabel}>Events</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('safety')}>
          <Ionicons name="alert-circle-outline" size={18} color="#F59E0B" />
          <Text style={styles.miniStatVal}>{company.recall_count}</Text>
          <Text style={styles.miniStatLabel}>Recalls</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('trials')}>
          <Ionicons name="flask-outline" size={18} color="#10B981" />
          <Text style={styles.miniStatVal}>{company.trial_count}</Text>
          <Text style={styles.miniStatLabel}>Trials</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniStat} onPress={() => setTab('overview')}>
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
function renderSafety(
  events: FDAAdverseEvent[],
  recalls: FDARecall[],
  loading: boolean,
) {
  if (loading) return <LoadingSpinner message="Loading safety data..." />;

  return (
    <View style={styles.tabContent}>
      {/* Recalls section */}
      <Text style={styles.tabSectionTitle}>FDA Recalls ({recalls.length})</Text>
      {recalls.length === 0 ? (
        <Text style={styles.noData}>No recalls found</Text>
      ) : (
        recalls.map((r) => (
          <View key={r.id} style={styles.card}>
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
            {r.recall_initiation_date && (
              <Text style={styles.cardDate}>{r.recall_initiation_date}</Text>
            )}
          </View>
        ))
      )}

      {/* Adverse events section */}
      <Text style={[styles.tabSectionTitle, { marginTop: 20 }]}>Adverse Events ({events.length})</Text>
      {events.length === 0 ? (
        <Text style={styles.noData}>No adverse events found</Text>
      ) : (
        events.map((e) => (
          <View key={e.id} style={styles.card}>
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              {e.outcome && <Text style={styles.outcome}>{e.outcome}</Text>}
              {e.receive_date && <Text style={styles.cardDate}>{e.receive_date}</Text>}
            </View>
          </View>
        ))
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
        <Text style={styles.noData}>No clinical trials found</Text>
      ) : (
        trials.map((t) => {
          const trialUrl = t.nct_id
            ? `https://clinicaltrials.gov/study/${t.nct_id}`
            : null;
          return (
            <TouchableOpacity
              key={t.id}
              style={styles.card}
              onPress={() => trialUrl && Linking.openURL(trialUrl)}
              disabled={!trialUrl}
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
        })
      )}
    </View>
  );
}

// ── Helpers ──
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
    flexDirection: 'row',
    backgroundColor: UI_COLORS.CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER_LIGHT,
    paddingHorizontal: 8,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6,
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
