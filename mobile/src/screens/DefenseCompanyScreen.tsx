import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { API_BASE } from '../api/client';
const ACCENT = '#DC2626';

const SECTOR_COLORS: Record<string, string> = {
  'prime contractor': '#DC2626',
  aerospace: '#0EA5E9',
  'defense electronics': '#F59E0B',
  cybersecurity: '#10B981',
  shipbuilding: '#8B5CF6',
};

type Tab = 'overview' | 'contracts' | 'lobbying' | 'enforcement';

export default function DefenseCompanyScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const companyId: string = route.params?.company_id;

  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  const [contracts, setContracts] = useState<any[]>([]);
  const [contractSummary, setContractSummary] = useState<any>(null);
  const [contractsLoading, setContractsLoading] = useState(false);

  const [lobbyingFilings, setLobbyingFilings] = useState<any[]>([]);
  const [lobbySummary, setLobbySummary] = useState<any>(null);
  const [lobbyingLoading, setLobbyingLoading] = useState(false);

  const [enforcementActions, setEnforcementActions] = useState<any[]>([]);
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [enforcementLoading, setEnforcementLoading] = useState(false);

  const [filings, setFilings] = useState<any[]>([]);

  const loadCompany = useCallback(async () => {
    try {
      const data = await fetch(`${API_BASE}/defense/companies/${companyId}`).then(r => r.json());
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

  useEffect(() => {
    fetch(`${API_BASE}/defense/companies/${companyId}/filings?limit=5`)
      .then(r => r.json())
      .then((res) => setFilings(res.filings || []))
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (tab === 'contracts' && contracts.length === 0 && !contractsLoading) {
      setContractsLoading(true);
      Promise.all([
        fetch(`${API_BASE}/defense/companies/${companyId}/contracts?limit=50`).then(r => r.json()),
        fetch(`${API_BASE}/defense/companies/${companyId}/contracts/summary`).then(r => r.json()),
      ])
        .then(([ctRes, sumRes]) => { setContracts(ctRes.contracts || []); setContractSummary(sumRes); })
        .catch(() => {})
        .finally(() => setContractsLoading(false));
    }
  }, [tab, companyId]);

  useEffect(() => {
    if (tab === 'lobbying' && lobbyingFilings.length === 0 && !lobbyingLoading) {
      setLobbyingLoading(true);
      Promise.all([
        fetch(`${API_BASE}/defense/companies/${companyId}/lobbying?limit=50`).then(r => r.json()),
        fetch(`${API_BASE}/defense/companies/${companyId}/lobbying/summary`).then(r => r.json()),
      ])
        .then(([filRes, sumRes]) => { setLobbyingFilings(filRes.filings || []); setLobbySummary(sumRes); })
        .catch(() => {})
        .finally(() => setLobbyingLoading(false));
    }
  }, [tab, companyId]);

  useEffect(() => {
    if (tab === 'enforcement' && enforcementActions.length === 0 && !enforcementLoading) {
      setEnforcementLoading(true);
      fetch(`${API_BASE}/defense/companies/${companyId}/enforcement?limit=50`)
        .then(r => r.json())
        .then((res) => { setEnforcementActions(res.actions || []); setTotalPenalties(res.total_penalties || 0); })
        .catch(() => {})
        .finally(() => setEnforcementLoading(false));
    }
  }, [tab, companyId]);

  const onRefresh = () => { setRefreshing(true); loadCompany(); };

  if (loading) return <LoadingSpinner message="Loading company..." />;
  if (error || !company) return <EmptyState title="Error" message={error || 'Company not found'} />;

  const sectorColor = SECTOR_COLORS[company.sector_type] || '#6B7280';

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'grid-outline' },
    { key: 'contracts', label: 'Contracts', icon: 'document-text-outline' },
    { key: 'lobbying', label: 'Lobbying', icon: 'megaphone-outline' },
    { key: 'enforcement', label: 'Legal', icon: 'shield-outline' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll} contentContainerStyle={styles.tabBarContent}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon as any} size={15} color={tab === t.key ? ACCENT : UI_COLORS.TEXT_MUTED} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: sectorColor + '15' }]}>
            <Ionicons name="shield-checkmark" size={28} color={sectorColor} />
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

        {tab === 'overview' && renderOverview(company, filings)}
        {tab === 'contracts' && renderContracts(contracts, contractSummary, contractsLoading)}
        {tab === 'lobbying' && renderLobbying(lobbyingFilings, lobbySummary, lobbyingLoading)}
        {tab === 'enforcement' && renderEnforcement(enforcementActions, totalPenalties, enforcementLoading)}
      </ScrollView>
    </View>
  );
}

function renderOverview(company: any, filings: any[]) {
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
          </View>
        </View>
      )}

      {filings.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document" size={16} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Recent SEC Filings</Text>
          </View>
          {filings.map((f: any) => (
            <View key={f.id} style={styles.filingRow}>
              <View style={styles.filingTypeBadge}><Text style={styles.filingTypeText}>{f.form_type}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filingDesc} numberOfLines={1}>{f.description || f.accession_number}</Text>
                {f.filing_date && <Text style={styles.cardDate}>{f.filing_date}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function renderContracts(contracts: any[], summary: any, loading: boolean) {
  if (loading) return <LoadingSpinner message="Loading contracts..." />;
  return (
    <View style={styles.tabContent}>
      {summary && summary.total_contracts > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}><Ionicons name="cash" size={16} color="#10B981" /><Text style={styles.cardTitle}>Contract Summary</Text></View>
          <Text style={[styles.bigNum, { color: '#10B981' }]}>${summary.total_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}</Text>
          <Text style={styles.cardSub}>{summary.total_contracts} total contracts</Text>
        </View>
      )}
      <Text style={styles.tabSectionTitle}>Contracts ({contracts.length})</Text>
      {contracts.length === 0 ? <Text style={styles.noData}>No government contracts found</Text> : (
        contracts.map((ct: any) => (
          <View key={ct.id} style={styles.card}>
            {ct.award_amount != null && <Text style={styles.contractAmount}>${ct.award_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>}
            {ct.awarding_agency && <Text style={styles.agencyName}>{ct.awarding_agency}</Text>}
            {ct.description && <Text style={styles.cardText} numberOfLines={3}>{ct.description}</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              {ct.start_date && <Text style={styles.cardDate}>Start: {ct.start_date}</Text>}
              {ct.end_date && <Text style={styles.cardDate}>End: {ct.end_date}</Text>}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function renderLobbying(filings: any[], summary: any, loading: boolean) {
  if (loading) return <LoadingSpinner message="Loading lobbying data..." />;
  return (
    <View style={styles.tabContent}>
      {summary && summary.total_filings > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}><Ionicons name="megaphone" size={16} color="#F59E0B" /><Text style={styles.cardTitle}>Lobbying Overview</Text></View>
          <Text style={[styles.bigNum, { color: '#F59E0B' }]}>${formatLargeNum(summary.total_income || 0)}</Text>
          <Text style={styles.cardSub}>Total reported lobbying income ({summary.total_filings} filings)</Text>
        </View>
      )}
      <Text style={styles.tabSectionTitle}>Lobbying Filings ({filings.length})</Text>
      {filings.length === 0 ? <Text style={styles.noData}>No lobbying filings found</Text> : (
        filings.map((f: any) => (
          <View key={f.id} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.yearBadge}><Text style={styles.yearBadgeText}>{f.filing_year}</Text></View>
                {f.filing_period && <Text style={styles.periodText}>{f.filing_period}</Text>}
              </View>
              {f.income != null && f.income > 0 && <Text style={styles.lobbyAmount}>${formatLargeNum(f.income)}</Text>}
            </View>
            {f.registrant_name && <Text style={styles.firmName}>{f.registrant_name}</Text>}
            {f.lobbying_issues && <Text style={styles.cardText} numberOfLines={2}>Issues: {f.lobbying_issues}</Text>}
          </View>
        ))
      )}
    </View>
  );
}

function renderEnforcement(actions: any[], totalPenalties: number, loading: boolean) {
  if (loading) return <LoadingSpinner message="Loading enforcement data..." />;
  return (
    <View style={styles.tabContent}>
      {actions.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}><Ionicons name="shield-checkmark" size={16} color="#DC2626" /><Text style={styles.cardTitle}>Enforcement Summary</Text></View>
          {totalPenalties > 0 && <Text style={[styles.bigNum, { color: '#DC2626' }]}>${formatLargeNum(totalPenalties)}</Text>}
          <Text style={styles.cardSub}>{actions.length} enforcement action{actions.length !== 1 ? 's' : ''} on record</Text>
        </View>
      )}
      <Text style={styles.tabSectionTitle}>Enforcement Actions ({actions.length})</Text>
      {actions.length === 0 ? <Text style={styles.noData}>No enforcement actions found</Text> : (
        actions.map((a: any) => (
          <TouchableOpacity key={a.id} style={styles.card} onPress={() => a.case_url && Linking.openURL(a.case_url)} disabled={!a.case_url}>
            <Text style={styles.caseTitle}>{a.case_title}</Text>
            {a.penalty_amount != null && a.penalty_amount > 0 && <Text style={styles.penaltyAmount}>Penalty: ${a.penalty_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>}
            {a.description && <Text style={styles.cardText} numberOfLines={3}>{a.description}</Text>}
            {a.case_date && <Text style={styles.cardDate}>{a.case_date}</Text>}
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
  tabBtnActive: { borderBottomColor: ACCENT },
  tabText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_MUTED },
  tabTextActive: { color: ACCENT },
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
  filingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: UI_COLORS.BORDER_LIGHT },
  filingTypeBadge: { backgroundColor: '#8B5CF6' + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  filingTypeText: { fontSize: 11, fontWeight: '700', color: '#8B5CF6' },
  filingDesc: { fontSize: 13, color: UI_COLORS.TEXT_SECONDARY },
  contractAmount: { fontSize: 16, fontWeight: '800', color: '#10B981', marginBottom: 6 },
  agencyName: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },
  yearBadge: { backgroundColor: '#F59E0B' + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  yearBadgeText: { fontSize: 11, fontWeight: '700', color: '#F59E0B' },
  periodText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY },
  lobbyAmount: { fontSize: 15, fontWeight: '800', color: '#F59E0B' },
  firmName: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginBottom: 4 },
  caseTitle: { fontSize: 14, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 20, marginBottom: 4 },
  penaltyAmount: { fontSize: 15, fontWeight: '800', color: '#DC2626', marginBottom: 4 },
});
