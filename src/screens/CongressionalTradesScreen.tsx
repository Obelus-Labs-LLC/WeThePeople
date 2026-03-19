import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS, PARTY_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import type { CongressionalTrade } from '../api/types';
import { LoadingSpinner, EmptyState } from '../components/ui';
import SearchBar from '../components/SearchBar';
import PillTabBar from '../components/PillTabBar';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'sale', label: 'Sale' },
];

const PAGE_SIZE = 50;

export default function CongressionalTradesScreen() {
  const navigation = useNavigation<any>();
  const [trades, setTrades] = useState<CongressionalTrade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setOffset(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [typeFilter]);

  const loadData = useCallback(async (currentOffset: number, append = false) => {
    setError(null);
    try {
      // API supports ticker and party filters; we'll search client-side for name
      const params: any = { limit: PAGE_SIZE, offset: currentOffset };
      if (typeFilter === 'purchase') params.ticker = undefined; // no server filter for type, we filter client-side
      if (typeFilter === 'sale') params.ticker = undefined;

      const res = await apiClient.getCongressionalTrades(params);
      let data = res.trades || [];

      // Client-side filtering
      if (searchDebounced.trim()) {
        const q = searchDebounced.toLowerCase();
        data = data.filter(
          (t) =>
            t.member_name?.toLowerCase().includes(q) ||
            t.ticker?.toLowerCase().includes(q)
        );
      }
      if (typeFilter !== 'all') {
        data = data.filter((t) => {
          const txType = (t.transaction_type || '').toLowerCase();
          if (typeFilter === 'purchase') return txType.includes('purchase') || txType.includes('buy');
          if (typeFilter === 'sale') return txType.includes('sale') || txType.includes('sell');
          return true;
        });
      }

      if (append) {
        setTrades((prev) => [...prev, ...data]);
      } else {
        setTrades(data);
      }
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load trades');
    }
  }, [searchDebounced, typeFilter]);

  useEffect(() => {
    setLoading(true);
    loadData(0).finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    setOffset(0);
    await loadData(0);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || trades.length >= total) return;
    setLoadingMore(true);
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    await loadData(newOffset, true);
    setLoadingMore(false);
  };

  if (loading) return <LoadingSpinner message="Loading trades..." />;

  const getPartyColor = (party: string) => {
    const letter = party?.charAt(0).toUpperCase();
    return PARTY_COLORS[letter] || '#6B7280';
  };

  const getTxColor = (txType: string) => {
    const t = (txType || '').toLowerCase();
    if (t.includes('purchase') || t.includes('buy')) return '#10B981';
    if (t.includes('sale') || t.includes('sell')) return '#DC2626';
    return '#6B7280';
  };

  const getTxLabel = (txType: string) => {
    const t = (txType || '').toLowerCase();
    if (t.includes('purchase') || t.includes('buy')) return 'Purchase';
    if (t.includes('sale') || t.includes('sell')) return 'Sale';
    return txType || 'Unknown';
  };

  const renderTrade = ({ item }: { item: CongressionalTrade }) => {
    const partyColor = getPartyColor(item.party);
    const txColor = getTxColor(item.transaction_type);
    const txLabel = getTxLabel(item.transaction_type);
    const partyLetter = item.party?.charAt(0).toUpperCase() || '?';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          // Try to navigate to person detail if we can match
          navigation.navigate('PersonDetail', {
            person_id: item.member_name?.toLowerCase().replace(/\s+/g, '_'),
          });
        }}
      >
        {/* Member + party */}
        <View style={styles.cardHeader}>
          <View style={styles.memberRow}>
            <Text style={styles.memberName}>{item.member_name}</Text>
            <View style={[styles.partyBadge, { backgroundColor: partyColor + '15', borderColor: partyColor + '30' }]}>
              <Text style={[styles.partyText, { color: partyColor }]}>
                {partyLetter === 'D' ? 'Dem' : partyLetter === 'R' ? 'Rep' : partyLetter}
              </Text>
            </View>
          </View>
          <View style={[styles.txBadge, { backgroundColor: txColor + '15' }]}>
            <View style={[styles.txDot, { backgroundColor: txColor }]} />
            <Text style={[styles.txText, { color: txColor }]}>{txLabel}</Text>
          </View>
        </View>

        {/* Ticker + amount */}
        <View style={styles.tradeDetails}>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>TICKER</Text>
            <Text style={styles.tickerText}>{item.ticker || '---'}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>AMOUNT</Text>
            <Text style={styles.detailValue}>{item.amount_range || 'N/A'}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>GAP</Text>
            <Text style={[styles.detailValue, item.reporting_gap_days > 45 && { color: '#DC2626' }]}>
              {item.reporting_gap_days != null ? `${item.reporting_gap_days}d` : '---'}
            </Text>
          </View>
        </View>

        {/* Dates */}
        <View style={styles.dateRow}>
          {item.transaction_date && (
            <Text style={styles.dateText}>
              Trade: {new Date(item.transaction_date).toLocaleDateString()}
            </Text>
          )}
          {item.disclosure_date && (
            <Text style={styles.dateText}>
              Disclosed: {new Date(item.disclosure_date).toLocaleDateString()}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search by politician or ticker..."
        />
      </View>

      <PillTabBar
        tabs={TYPE_FILTERS}
        activeTab={typeFilter}
        onTabChange={setTypeFilter}
      />

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {trades.length === 0 ? 'No trades found' : `${trades.length} of ${total} trades`}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : trades.length === 0 ? (
        <EmptyState title="No trades found" message="Try adjusting your search or filters." />
      ) : (
        <FlatList
          data={trades}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderTrade}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={UI_COLORS.ACCENT} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.SECONDARY_BG,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  countText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  partyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  partyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  txBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  txDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  txText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tradeDetails: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  detailCol: {
    flex: 1,
    gap: 2,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: UI_COLORS.TEXT_MUTED,
    letterSpacing: 0.5,
  },
  tickerText: {
    fontSize: 16,
    fontWeight: '800',
    color: UI_COLORS.ACCENT,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.TEXT_PRIMARY,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 16,
  },
  dateText: {
    fontSize: 11,
    color: UI_COLORS.TEXT_MUTED,
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
