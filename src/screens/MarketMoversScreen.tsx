import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList,
  StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { apiClient } from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/ui';

function fmtDollar(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  return `$${val.toFixed(2)}`;
}

function fmtPct(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export default function MarketMoversScreen() {
  const [movers, setMovers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.getMarketMovers();
      const items = res?.movers || res?.gainers || res?.items || (Array.isArray(res) ? res : []);
      // If response has gainers and losers separately, merge them
      if (res?.gainers && res?.losers) {
        setMovers([...res.gainers, ...res.losers]);
      } else {
        setMovers(items);
      }
    } catch (e: any) {
      console.error('Market movers load failed:', e);
      setError(e.message || 'Failed to load market movers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) return <LoadingSpinner message="Loading market movers..." />;

  const renderMover = ({ item }: { item: any }) => {
    const change = item.change_pct || item.change_percent || item.percent_change || 0;
    const isPositive = change >= 0;
    const changeColor = isPositive ? '#10B981' : '#DC2626';

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <Text style={styles.ticker}>{item.ticker || item.symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>{item.name || item.company_name}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.price}>{fmtDollar(item.price || item.last_price)}</Text>
          <View style={[styles.changeBadge, { backgroundColor: changeColor + '15' }]}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={12}
              color={changeColor}
            />
            <Text style={[styles.changeText, { color: changeColor }]}>{fmtPct(change)}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      <LinearGradient
        colors={['#10B981', '#0F766E', '#065F46']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="trending-up" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Market Movers</Text>
          </View>
          <Text style={styles.heroSubtitle}>Top gaining and losing tracked stocks</Text>
        </View>
      </LinearGradient>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={movers}
          keyExtractor={(item, idx) => item.ticker || item.symbol || `mover-${idx}`}
          renderItem={renderMover}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI_COLORS.ACCENT} />}
          ListEmptyComponent={<EmptyState title="No market data" message="Market mover data is not available yet." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: {
    borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    overflow: 'hidden', position: 'relative',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  cardLeft: { flex: 1 },
  ticker: { fontSize: 16, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY, letterSpacing: 0.5 },
  name: { fontSize: 12, color: UI_COLORS.TEXT_MUTED, marginTop: 1 },
  cardRight: { alignItems: 'flex-end' },
  price: { fontSize: 15, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginTop: 3 },
  changeText: { fontSize: 12, fontWeight: '700' },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14 },
});
