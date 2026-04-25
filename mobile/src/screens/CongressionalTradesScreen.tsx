import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const log = (msg: string, err: unknown) => console.warn(`[CongressionalTradesScreen] ${msg}:`, err);
const ACCENT = '#2563EB';

interface Trade {
  person_id: string;
  person_name?: string;
  ticker: string;
  asset_name: string;
  transaction_type: string; // "purchase" | "sale"
  amount_range: string;
  disclosure_date: string;
  transaction_date: string;
  owner: string;
  reporting_gap: number;
}

interface TradesResponse {
  trades: Trade[];
  total: number;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function CongressionalTradesScreen() {
  const navigation = useNavigation<any>();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const data = await apiClient.getCongressionalTrades({ limit: 50 });
      setTrades((data as any).trades || []);
      setTotal((data as any).total || 0);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load trades');
      log('loadData', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) return <LoadingSpinner message="Loading congressional trades..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  const isBuy = (t: Trade) => t.transaction_type?.toLowerCase() === 'purchase';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#2563EB', '#1D4ED8', '#1E40AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroOrb} />
        <View style={styles.heroInner}>
          <View style={styles.heroIconRow}>
            <Ionicons name="trending-up" size={24} color="#FFFFFF" />
            <Text style={styles.heroTitle}>Congressional Trades</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Recent stock trades disclosed by members of Congress
          </Text>
          <View style={styles.heroStatRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{total.toLocaleString()}</Text>
              <Text style={styles.heroStatLabel}>Total Trades</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{trades.length}</Text>
              <Text style={styles.heroStatLabel}>Showing</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Trade Cards */}
      <View style={styles.section}>
        <View style={[styles.sectionTitleRow, { marginBottom: 12 }]}>
          <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
          <Text style={styles.sectionTitle}>Recent Trades</Text>
        </View>

        {trades.length === 0 ? (
          <EmptyState title="No Trades" message="No congressional trades found." />
        ) : (
          trades.map((trade, idx) => {
            const buy = isBuy(trade);
            const lateReport = trade.reporting_gap > 45;
            return (
              <TouchableOpacity
                key={`${trade.person_id}-${trade.ticker}-${idx}`}
                style={styles.tradeCard}
                activeOpacity={0.8}
                onPress={() => {
                  if (trade.person_id) {
                    navigation.navigate('PersonDetail', { person_id: trade.person_id });
                  }
                }}
              >
                {/* Top row: ticker + buy/sell badge */}
                <View style={styles.tradeTopRow}>
                  <View style={styles.tickerWrap}>
                    <Text style={styles.ticker}>{trade.ticker || '—'}</Text>
                    <Text style={styles.assetName} numberOfLines={1}>
                      {trade.asset_name}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.txBadge,
                      { backgroundColor: buy ? '#10B98115' : '#DC262615', borderColor: buy ? '#10B98130' : '#DC262630' },
                    ]}
                  >
                    <Ionicons
                      name={buy ? 'arrow-up-circle' : 'arrow-down-circle'}
                      size={14}
                      color={buy ? '#10B981' : '#DC2626'}
                    />
                    <Text style={[styles.txBadgeText, { color: buy ? '#10B981' : '#DC2626' }]}>
                      {buy ? 'Buy' : 'Sell'}
                    </Text>
                  </View>
                </View>

                {/* Person name */}
                <Text style={styles.personName}>{trade.person_name || trade.person_id}</Text>

                {/* Details row */}
                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Amount</Text>
                    <Text style={styles.detailValue}>{trade.amount_range || '—'}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Trade Date</Text>
                    <Text style={styles.detailValue}>{formatDate(trade.transaction_date)}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Disclosed</Text>
                    <Text style={styles.detailValue}>{formatDate(trade.disclosure_date)}</Text>
                  </View>
                </View>

                {/* Owner + Reporting gap */}
                <View style={styles.bottomRow}>
                  {trade.owner && (
                    <Text style={styles.ownerText}>Owner: {trade.owner}</Text>
                  )}
                  {trade.reporting_gap != null && (
                    <View
                      style={[
                        styles.gapBadge,
                        lateReport
                          ? { backgroundColor: '#D4A01715', borderColor: '#D4A01730' }
                          : { backgroundColor: '#10B98110', borderColor: '#10B98120' },
                      ]}
                    >
                      <Ionicons
                        name={lateReport ? 'warning' : 'checkmark-circle'}
                        size={12}
                        color={lateReport ? '#D4A017' : '#10B981'}
                      />
                      <Text
                        style={[
                          styles.gapText,
                          { color: lateReport ? '#D4A017' : '#10B981' },
                        ]}
                      >
                        {trade.reporting_gap}d gap{lateReport ? ' (late)' : ''}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Data: Congressional Stock Trade Disclosures (STOCK Act)</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  scrollContent: { paddingBottom: 24 },
  hero: {
    borderRadius: 16, padding: 20, marginHorizontal: 16, marginTop: 12,
    overflow: 'hidden', position: 'relative',
  },
  heroOrb: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180,
    borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroInner: { position: 'relative' },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  heroStatRow: { flexDirection: 'row', gap: 24 },
  heroStat: {},
  heroStatValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  section: { paddingHorizontal: 16, marginTop: 12, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentBar: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY },
  tradeCard: {
    backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: UI_COLORS.BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  tradeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  tickerWrap: { flex: 1, marginRight: 8 },
  ticker: { fontSize: 16, fontWeight: '800', color: UI_COLORS.TEXT_PRIMARY },
  assetName: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, marginTop: 1 },
  txBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1,
  },
  txBadgeText: { fontSize: 12, fontWeight: '700' },
  personName: { fontSize: 14, fontWeight: '600', color: ACCENT, marginBottom: 8 },
  detailsRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  detailItem: {},
  detailLabel: { fontSize: 10, fontWeight: '600', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.3 },
  detailValue: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginTop: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ownerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
  gapBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1,
  },
  gapText: { fontSize: 10, fontWeight: '600' },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
