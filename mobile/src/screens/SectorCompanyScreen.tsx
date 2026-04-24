import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';
import WatchlistButton from '../components/WatchlistButton';

type SectorSlug =
  | 'energy'
  | 'transportation'
  | 'defense'
  | 'chemicals'
  | 'agriculture'
  | 'telecom'
  | 'education';

type Tab = 'overview' | 'contracts' | 'lobbying' | 'enforcement';

interface SectorConfig {
  accent: string;
  icon: string;
  tabLabels?: Partial<Record<Tab, string>>;
}

const SECTOR_CONFIG: Record<SectorSlug, SectorConfig> = {
  energy: { accent: '#475569', icon: 'flash' },
  transportation: { accent: '#0284C7', icon: 'car' },
  defense: { accent: '#7C2D12', icon: 'shield' },
  chemicals: { accent: '#7C3AED', icon: 'flask' },
  agriculture: { accent: '#166534', icon: 'leaf' },
  telecom: { accent: '#DB2777', icon: 'cellular' },
  education: { accent: '#CA8A04', icon: 'school' },
};

interface Props {
  // Optionally passed from the navigator when registering the route.
  sector?: SectorSlug;
}

export default function SectorCompanyScreen(_props: Props) {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  // Sector can come from route params (preferred, dynamic) or from
  // navigator initialParams (static). This lets one component back all seven
  // sector detail routes without duplicate screen files.
  const sector: SectorSlug = (route.params?.sector || _props.sector || 'energy') as SectorSlug;
  const companyId: string = route.params?.company_id;
  const config = SECTOR_CONFIG[sector] || SECTOR_CONFIG.energy;
  const ACCENT = config.accent;

  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  const [contracts, setContracts] = useState<any[]>([]);
  const [contractSummary, setContractSummary] = useState<any>(null);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState('');

  const [lobbyingFilings, setLobbyingFilings] = useState<any[]>([]);
  const [lobbySummary, setLobbySummary] = useState<any>(null);
  const [lobbyingLoading, setLobbyingLoading] = useState(false);
  const [lobbyingError, setLobbyingError] = useState('');

  const [enforcementActions, setEnforcementActions] = useState<any[]>([]);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoading, setEnforcementLoading] = useState(false);
  const [enforcementError, setEnforcementError] = useState('');

  const loadCompany = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await apiClient.getSectorCompanyDetail(sector, companyId);
      setCompany(data);
      setError('');
      navigation.setOptions({ title: (data as any)?.display_name || '' });
    } catch (e: any) {
      setError(e?.message || 'Failed to load company');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sector, companyId, navigation]);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  const loadContracts = useCallback(async () => {
    if (!companyId) return;
    setContractsLoading(true);
    setContractsError('');
    try {
      const [ctRes, sumRes] = await Promise.all([
        apiClient.getSectorCompanyContracts(sector, companyId, { limit: 50 }),
        apiClient.getSectorCompanyContractSummary(sector, companyId),
      ]);
      setContracts((ctRes as any)?.contracts || []);
      setContractSummary(sumRes);
    } catch (e: any) {
      setContractsError(e?.message || 'Failed to load contracts');
    } finally {
      setContractsLoading(false);
    }
  }, [sector, companyId]);

  const loadLobbying = useCallback(async () => {
    if (!companyId) return;
    setLobbyingLoading(true);
    setLobbyingError('');
    try {
      const [filRes, sumRes] = await Promise.all([
        apiClient.getSectorCompanyLobbying(sector, companyId, { limit: 50 }),
        apiClient.fetchJSON<any>(
          `${apiClient.base}/${encodeURIComponent(sector)}/companies/${encodeURIComponent(companyId)}/lobbying/summary`
        ),
      ]);
      setLobbyingFilings((filRes as any)?.filings || []);
      setLobbySummary(sumRes);
    } catch (e: any) {
      setLobbyingError(e?.message || 'Failed to load lobbying data');
    } finally {
      setLobbyingLoading(false);
    }
  }, [sector, companyId]);

  const loadEnforcement = useCallback(async () => {
    if (!companyId) return;
    setEnforcementLoading(true);
    setEnforcementError('');
    try {
      const res = await apiClient.getSectorCompanyEnforcement(sector, companyId, { limit: 50 });
      setEnforcementActions((res as any)?.actions || []);
      setTotalPenalties((res as any)?.total_penalties || 0);
    } catch (e: any) {
      setEnforcementError(e?.message || 'Failed to load enforcement data');
    } finally {
      setEnforcementLoading(false);
    }
  }, [sector, companyId]);

  useEffect(() => {
    if (tab === 'contracts' && contracts.length === 0 && !contractsLoading && !contractsError) {
      loadContracts();
    }
    if (tab === 'lobbying' && lobbyingFilings.length === 0 && !lobbyingLoading && !lobbyingError) {
      loadLobbying();
    }
    if (tab === 'enforcement' && enforcementActions.length === 0 && !enforcementLoading && !enforcementError) {
      loadEnforcement();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sector, companyId]);

  const onRefresh = () => { setRefreshing(true); loadCompany(); };

  if (loading) return <LoadingSpinner message="Loading company..." />;
  if (error || !company) {
    return (
      <View style={styles.errorWrap}>
        <EmptyState title="Error" message={error || 'Company not found'} />
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: ACCENT }]}
          onPress={() => {
            setError('');
            setLoading(true);
            loadCompany();
          }}
        >
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sectorColor = ACCENT;

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'grid-outline' },
    { key: 'contracts', label: 'Contracts', icon: 'document-text-outline' },
    { key: 'lobbying', label: 'Lobbying', icon: 'megaphone-outline' },
    { key: 'enforcement', label: 'Legal', icon: 'shield-outline' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && { borderBottomColor: ACCENT }]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons
              name={t.icon as any}
              size={15}
              color={tab === t.key ? ACCENT : UI_COLORS.TEXT_MUTED}
            />
            <Text style={[styles.tabText, tab === t.key && { color: ACCENT }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: sectorColor + '15' }]}>
            <Ionicons name={config.icon as any} size={28} color={sectorColor} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{company.display_name}</Text>
            <View style={styles.headerMeta}>
              {company.ticker && <Text style={styles.headerTicker}>{company.ticker}</Text>}
              {company.sector_type && (
                <View style={[styles.sectorBadge, { backgroundColor: sectorColor + '12', borderColor: sectorColor + '25' }]}>
                  <Text style={[styles.sectorBadgeText, { color: sectorColor }]}>{company.sector_type}</Text>
                </View>
              )}
              {company.headquarters && <Text style={styles.headerHQ}>{company.headquarters}</Text>}
              {companyId && (
                <WatchlistButton
                  entityType="company"
                  entityId={companyId}
                  entityName={company.display_name}
                  sector={sector}
                />
              )}
            </View>
          </View>
        </View>

        {tab === 'overview' && renderOverview(company)}
        {tab === 'contracts' && renderContracts(contracts, contractSummary, contractsLoading, contractsError, loadContracts)}
        {tab === 'lobbying' && renderLobbying(lobbyingFilings, lobbySummary, lobbyingLoading, lobbyingError, loadLobbying)}
        {tab === 'enforcement' && renderEnforcement(enforcementActions, totalPenalties, enforcementLoading, enforcementError, loadEnforcement)}
      </ScrollView>
    </View>
  );
}

function RetryRow({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <View style={styles.retryRow}>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryRowBtn} onPress={onRetry}>
        <Ionicons name="refresh" size={14} color={UI_COLORS.TEXT_PRIMARY} />
        <Text style={styles.retryRowBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

function renderOverview(company: any) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.statsRow}>
        <View style={styles.miniStat}>
          <Ionicons name="document-text-outline" size={18} color="#2563EB" />
          <Text style={styles.miniStatVal}>{company.contract_count || 0}</Text>
          <Text style={styles.miniStatLabel}>Contracts</Text>
        </View>
        <View style={styles.miniStat}>
          <Ionicons name="folder-outline" size={18} color="#8B5CF6" />
          <Text style={styles.miniStatVal}>{company.filing_count || 0}</Text>
          <Text style={styles.miniStatLabel}>Filings</Text>
        </View>
        <View style={styles.miniStat}>
          <Ionicons name="shield-outline" size={18} color="#DC2626" />
          <Text style={styles.miniStatVal}>{company.enforcement_count || 0}</Text>
          <Text style={styles.miniStatLabel}>Enforcement</Text>
        </View>
      </View>

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
          </View>
          {company.latest_stock.snapshot_date && (
            <Text style={styles.cardDate}>As of {company.latest_stock.snapshot_date}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function renderContracts(contracts: any[], summary: any, loading: boolean, error: string, retry: () => void) {
  if (loading) return <LoadingSpinner message="Loading contracts..." />;
  if (error) return <RetryRow error={error} onRetry={retry} />;

  return (
    <View style={styles.tabContent}>
      {summary && summary.total_contracts > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cash" size={16} color="#10B981" />
            <Text style={styles.cardTitle}>Contract Summary</Text>
          </View>
          <Text style={[styles.bigNum, { color: '#10B981' }]}>
            ${summary.total_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}
          </Text>
          <Text style={styles.cardSub}>{summary.total_contracts} total contracts</Text>
        </View>
      )}

      <Text style={styles.tabSectionTitle}>Contracts ({contracts.length})</Text>
      {contracts.length === 0 ? (
        <Text style={styles.noData}>No government contracts found</Text>
      ) : (
        contracts.map((ct: any) => (
          <View key={ct.id} style={styles.card}>
            {ct.award_amount != null && (
              <Text style={styles.contractAmount}>
                ${ct.award_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Text>
            )}
            {ct.awarding_agency && <Text style={styles.agencyName}>{ct.awarding_agency}</Text>}
            {ct.description && <Text style={styles.cardText} numberOfLines={3}>{ct.description}</Text>}
          </View>
        ))
      )}
    </View>
  );
}

function renderLobbying(filings: any[], summary: any, loading: boolean, error: string, retry: () => void) {
  if (loading) return <LoadingSpinner message="Loading lobbying data..." />;
  if (error) return <RetryRow error={error} onRetry={retry} />;

  return (
    <View style={styles.tabContent}>
      {summary && summary.total_filings > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="megaphone" size={16} color="#F59E0B" />
            <Text style={styles.cardTitle}>Lobbying Overview</Text>
          </View>
          <Text style={[styles.bigNum, { color: '#F59E0B' }]}>
            ${formatLargeNum(summary.total_income || 0)}
          </Text>
          <Text style={styles.cardSub}>
            Total reported lobbying income ({summary.total_filings} filings)
          </Text>
        </View>
      )}

      <Text style={styles.tabSectionTitle}>Lobbying Filings ({filings.length})</Text>
      {filings.length === 0 ? (
        <Text style={styles.noData}>No lobbying filings found</Text>
      ) : (
        filings.map((f: any) => (
          <View key={f.id} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={styles.yearBadge}>
                <Text style={styles.yearBadgeText}>{f.filing_year}</Text>
              </View>
              {f.income != null && f.income > 0 && (
                <Text style={styles.lobbyAmount}>${formatLargeNum(f.income)}</Text>
              )}
            </View>
            {f.registrant_name && <Text style={styles.firmName}>{f.registrant_name}</Text>}
            {f.lobbying_issues && (
              <Text style={styles.cardText} numberOfLines={2}>Issues: {f.lobbying_issues}</Text>
            )}
          </View>
        ))
      )}
    </View>
  );
}

function renderEnforcement(actions: any[], totalPenalties: number, loading: boolean, error: string, retry: () => void) {
  if (loading) return <LoadingSpinner message="Loading enforcement data..." />;
  if (error) return <RetryRow error={error} onRetry={retry} />;

  return (
    <View style={styles.tabContent}>
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
          </Text>
        </View>
      )}

      <Text style={styles.tabSectionTitle}>Enforcement Actions ({actions.length})</Text>
      {actions.length === 0 ? (
        <Text style={styles.noData}>No enforcement actions found</Text>
      ) : (
        actions.map((a: any) => (
          <TouchableOpacity
            key={a.id}
            style={styles.card}
            onPress={() => a.case_url && Linking.openURL(a.case_url)}
            disabled={!a.case_url}
          >
            <Text style={styles.caseTitle}>{a.case_title}</Text>
            {a.penalty_amount != null && a.penalty_amount > 0 && (
              <Text style={styles.penaltyAmount}>
                Penalty: ${a.penalty_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Text>
            )}
            {a.description && <Text style={styles.cardText} numberOfLines={3}>{a.description}</Text>}
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function formatLargeNum(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toLocaleString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  tabBarScroll: { backgroundColor: UI_COLORS.CARD_BG, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT, flexGrow: 0 },
  tabBarContent: { paddingHorizontal: 4 },
  tabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 5, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: UI_COLORS.CARD_BG, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  headerIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  headerMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  headerTicker: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY },
  headerHQ: { fontSize: 12, color: UI_COLORS.TEXT_MUTED },
  sectorBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  sectorBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  tabContent: { paddingHorizontal: 16, paddingTop: 12 },
  tabSectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 10 },
  noData: { fontSize: 13, color: UI_COLORS.TEXT_MUTED, paddingVertical: 16, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  miniStat: { flex: 1, alignItems: 'center', backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  miniStatVal: { fontSize: 18, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY, marginTop: 4 },
  miniStatLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  card: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  cardText: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 18, marginBottom: 4 },
  cardDate: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  cardSub: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  bigNum: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  stockGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  stockItem: { width: '47%', backgroundColor: UI_COLORS.SECONDARY_BG, borderRadius: 8, padding: 10 },
  stockLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, marginBottom: 2 },
  stockVal: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  contractAmount: { fontSize: 16, fontWeight: '800', color: '#10B981' },
  agencyName: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },
  yearBadge: { backgroundColor: '#F59E0B' + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  yearBadgeText: { fontSize: 11, fontWeight: '700', color: '#F59E0B' },
  lobbyAmount: { fontSize: 15, fontWeight: '800', color: '#F59E0B' },
  firmName: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },
  caseTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 20, marginBottom: 4 },
  penaltyAmount: { fontSize: 15, fontWeight: '800', color: '#DC2626', marginBottom: 4 },
  errorWrap: {
    flex: 1, backgroundColor: UI_COLORS.PRIMARY_BG, justifyContent: 'center',
    alignItems: 'center', gap: 16, padding: 32,
  },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  retryRow: {
    padding: 16, alignItems: 'center', gap: 10,
  },
  errorText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  retryRowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: UI_COLORS.CARD_BG,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
  },
  retryRowBtnText: { color: UI_COLORS.TEXT_PRIMARY, fontSize: 13, fontWeight: '600' },
});
