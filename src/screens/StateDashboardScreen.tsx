import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { StateDashboardData, StateLegislator, StateBill } from '../api/types';
import { LoadingSpinner, EmptyState, StatCard, PartyBadge, ChamberBadge, TierProgressBar } from '../components/ui';
import PillTabBar from '../components/PillTabBar';
import SearchBar from '../components/SearchBar';

const MAIN_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'legislators', label: 'Legislators' },
  { key: 'bills', label: 'Bills' },
];

const CHAMBER_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'upper', label: 'Senate' },
  { key: 'lower', label: 'House' },
];

const PARTY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Democratic', label: 'Dem' },
  { key: 'Republican', label: 'Rep' },
];

const PAGE_SIZE = 50;

export default function StateDashboardScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const stateCode: string = route.params?.state_code;

  const [dashboard, setDashboard] = useState<StateDashboardData | null>(null);
  const [legislators, setLegislators] = useState<StateLegislator[]>([]);
  const [bills, setBills] = useState<StateBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('overview');
  const [chamberFilter, setChamberFilter] = useState('all');
  const [partyFilter, setPartyFilter] = useState('all');
  const [billSearch, setBillSearch] = useState('');

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const data = await apiClient.getStateDashboard(stateCode);
      setDashboard(data);
      navigation.setOptions({ title: data.state_name || stateCode });
    } catch (err: any) {
      setError(err.message || 'Failed to load state data');
    }
  }, [stateCode, navigation]);

  const loadLegislators = useCallback(async () => {
    try {
      const params: any = { limit: PAGE_SIZE };
      if (chamberFilter !== 'all') params.chamber = chamberFilter;
      if (partyFilter !== 'all') params.party = partyFilter;
      const res = await apiClient.getStateLegislators(stateCode, params);
      setLegislators(res.legislators || []);
    } catch {}
  }, [stateCode, chamberFilter, partyFilter]);

  const loadBills = useCallback(async () => {
    try {
      const params: any = { limit: PAGE_SIZE };
      if (billSearch.trim()) params.q = billSearch;
      const res = await apiClient.getStateBills(stateCode, params);
      setBills(res.bills || []);
    } catch {}
  }, [stateCode, billSearch]);

  useEffect(() => {
    setLoading(true);
    loadDashboard().finally(() => setLoading(false));
  }, [loadDashboard]);

  useEffect(() => {
    if (activeTab === 'legislators') loadLegislators();
  }, [activeTab, loadLegislators]);

  useEffect(() => {
    if (activeTab === 'bills') loadBills();
  }, [activeTab, loadBills]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    if (activeTab === 'legislators') await loadLegislators();
    if (activeTab === 'bills') await loadBills();
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner message="Loading state data..." />;
  if (error || !dashboard) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
        <Text style={styles.errorText}>{error || 'State not found'}</Text>
      </View>
    );
  }

  const byParty = dashboard.by_party || {};
  const totalParty = Object.values(byParty).reduce((s, v) => s + v, 0) || 1;
  const partySegments = [
    { label: 'Democrat', value: byParty['Democratic'] || byParty['Democrat'] || 0, color: PARTY_COLORS.D },
    { label: 'Republican', value: byParty['Republican'] || 0, color: PARTY_COLORS.R },
    { label: 'Independent', value: byParty['Independent'] || byParty['Other'] || 0, color: PARTY_COLORS.I },
  ];

  // ── Overview Tab ──
  const renderOverview = () => (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
    >
      <View style={styles.card}>
        <Text style={styles.stateTitle}>{dashboard.state_name}</Text>
        <Text style={styles.stateSubtitle}>{stateCode.toUpperCase()} State Legislature</Text>
      </View>

      {/* Party breakdown */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Ionicons name="pie-chart-outline" size={16} color={UI_COLORS.ACCENT} />
          <Text style={styles.sectionTitle}>Party Breakdown</Text>
        </View>
        <TierProgressBar segments={partySegments} />
      </View>

      {/* Quick stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <StatCard label="Legislators" value={dashboard.total_legislators} accent="blue" />
        </View>
        <View style={styles.statItem}>
          <StatCard label="Bills" value={dashboard.total_bills} accent="amber" />
        </View>
      </View>

      {/* Recent bills preview */}
      {(dashboard.recent_bills || []).length > 0 && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={16} color={UI_COLORS.ACCENT} />
            <Text style={styles.sectionTitle}>Recent Bills</Text>
          </View>
          {dashboard.recent_bills.slice(0, 5).map((bill) => (
            <TouchableOpacity
              key={bill.bill_id}
              style={styles.billPreview}
              onPress={() => bill.source_url && Linking.openURL(bill.source_url)}
            >
              <Text style={styles.billIdentifier}>{bill.identifier}</Text>
              <Text style={styles.billTitle} numberOfLines={2}>{bill.title}</Text>
              {bill.latest_action_date && (
                <Text style={styles.billDate}>
                  {new Date(bill.latest_action_date).toLocaleDateString()}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );

  // ── Legislators Tab ──
  const renderLegislator = ({ item }: { item: StateLegislator }) => (
    <View style={styles.legCard}>
      <View style={styles.legRow}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.legInfo}>
          <Text style={styles.legName}>{item.name}</Text>
          {item.district && (
            <Text style={styles.legDistrict}>District {item.district}</Text>
          )}
          <View style={styles.badgeRow}>
            <PartyBadge party={item.party} />
            <ChamberBadge chamber={item.chamber} />
          </View>
        </View>
      </View>
    </View>
  );

  const renderLegislators = () => (
    <View style={styles.tabContainer}>
      {/* Chamber + party filters */}
      <View style={styles.filterRow}>
        <View style={styles.filterGroup}>
          {CHAMBER_FILTERS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterBtn, chamberFilter === opt.key && styles.filterBtnActive]}
              onPress={() => setChamberFilter(opt.key)}
            >
              <Text style={[styles.filterBtnText, chamberFilter === opt.key && styles.filterBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.filterGroup}>
          {PARTY_FILTERS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterBtn, partyFilter === opt.key && styles.filterBtnActive]}
              onPress={() => setPartyFilter(opt.key)}
            >
              <Text style={[styles.filterBtnText, partyFilter === opt.key && styles.filterBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={legislators}
        keyExtractor={(item) => item.ocd_id}
        renderItem={renderLegislator}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />
        }
        ListEmptyComponent={
          <EmptyState title="No legislators found" message="Try adjusting your filters." />
        }
      />
    </View>
  );

  // ── Bills Tab ──
  const renderBill = ({ item }: { item: StateBill }) => (
    <TouchableOpacity
      style={styles.billCard}
      onPress={() => item.source_url && Linking.openURL(item.source_url)}
    >
      <View style={styles.billHeader}>
        <Text style={styles.billId}>{item.identifier}</Text>
        {item.latest_action_date && (
          <Text style={styles.billDateSmall}>
            {new Date(item.latest_action_date).toLocaleDateString()}
          </Text>
        )}
      </View>
      <Text style={styles.billTitleCard} numberOfLines={2}>{item.title}</Text>
      {item.latest_action && (
        <Text style={styles.billAction} numberOfLines={1}>
          {item.latest_action}
        </Text>
      )}
      {item.source_url && (
        <View style={styles.externalLink}>
          <Ionicons name="open-outline" size={11} color={UI_COLORS.ACCENT} />
          <Text style={styles.externalText}>View source</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderBills = () => (
    <View style={styles.tabContainer}>
      <View style={styles.searchWrap}>
        <SearchBar
          value={billSearch}
          onChangeText={setBillSearch}
          placeholder="Search bills..."
        />
      </View>
      <FlatList
        data={bills}
        keyExtractor={(item) => item.bill_id}
        renderItem={renderBill}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />
        }
        ListEmptyComponent={
          <EmptyState title="No bills found" message="Try adjusting your search." />
        }
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <PillTabBar
        tabs={MAIN_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'legislators' && renderLegislators()}
      {activeTab === 'bills' && renderBills()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  tabContainer: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  stateTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: UI_COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  stateSubtitle: {
    fontSize: 13,
    color: UI_COLORS.TEXT_MUTED,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
  },
  billPreview: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.BORDER_LIGHT,
  },
  billIdentifier: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.ACCENT,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  billTitle: {
    fontSize: 13,
    color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 18,
  },
  billDate: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
    marginTop: 4,
  },

  // ── Legislators ──
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  filterGroup: {
    flexDirection: 'row',
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    padding: 2,
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  filterBtnActive: {
    backgroundColor: UI_COLORS.ACCENT,
  },
  filterBtnText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  legCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI_COLORS.ACCENT_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: UI_COLORS.ACCENT,
    fontSize: 16,
    fontWeight: '700',
  },
  legInfo: {
    flex: 1,
    gap: 2,
  },
  legName: {
    fontSize: 15,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  legDistrict: {
    fontSize: 12,
    color: UI_COLORS.TEXT_MUTED,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },

  // ── Bills ──
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  billCard: {
    backgroundColor: UI_COLORS.CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  billId: {
    fontSize: 12,
    fontWeight: '800',
    color: UI_COLORS.ACCENT,
    letterSpacing: 0.3,
  },
  billDateSmall: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
  },
  billTitleCard: {
    fontSize: 14,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
    lineHeight: 20,
    marginBottom: 4,
  },
  billAction: {
    fontSize: 12,
    color: UI_COLORS.TEXT_SECONDARY,
  },
  externalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  externalText: {
    fontSize: 11,
    color: UI_COLORS.ACCENT,
    fontWeight: '600',
  },

  // ── Error ──
  errorContainer: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
});
