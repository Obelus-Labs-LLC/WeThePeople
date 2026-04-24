import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#10B981';
const log = (msg: string, err: unknown) => console.warn(`[ContractTimelineScreen] ${msg}:`, err);

// Tech-sector contracts by year — mirrors frontend/src/pages/ContractTimelinePage.tsx.

interface YearBucket {
  year: string;
  totalAmount: number;
  count: number;
  topCompanies: Array<{ name: string; total: number }>;
}

function fmtDollar(n: number): string {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function yearOf(date?: string): string | null {
  if (!date) return null;
  const m = date.match(/^(\d{4})/);
  return m ? m[1] : null;
}

export default function ContractTimelineScreen() {
  const [buckets, setBuckets] = useState<YearBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    try {
      const compRes = await apiClient.getTechCompanies({ limit: 200 });
      const companies = ((compRes as any).companies || [])
        .filter((c: any) => (c.contract_count || 0) > 0)
        .sort((a: any, b: any) => (b.contract_count || 0) - (a.contract_count || 0))
        .slice(0, 30);

      const perYear = new Map<string, YearBucket>();
      await Promise.all(
        companies.map(async (co: any) => {
          try {
            const r = await apiClient.getTechCompanyContracts(co.company_id, { limit: 100 });
            const contracts = (r as any).contracts || [];
            for (const ct of contracts) {
              const year = yearOf(ct.start_date) || yearOf(ct.end_date);
              if (!year) continue;
              const amount = Number(ct.award_amount || 0);
              const existing = perYear.get(year);
              if (existing) {
                existing.totalAmount += amount;
                existing.count += 1;
                const co_existing = existing.topCompanies.find((t) => t.name === co.display_name);
                if (co_existing) {
                  co_existing.total += amount;
                } else {
                  existing.topCompanies.push({ name: co.display_name, total: amount });
                }
              } else {
                perYear.set(year, {
                  year,
                  totalAmount: amount,
                  count: 1,
                  topCompanies: [{ name: co.display_name, total: amount }],
                });
              }
            }
          } catch (e) {
            log(`contracts fetch ${co.company_id}`, e);
          }
        }),
      );

      const sorted = Array.from(perYear.values())
        .sort((a, b) => Number(b.year) - Number(a.year));
      // Sort top companies inside each bucket and cap.
      sorted.forEach((b) => {
        b.topCompanies.sort((a, c) => c.total - a.total);
        b.topCompanies = b.topCompanies.slice(0, 5);
      });
      setBuckets(sorted);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load contract timeline');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const maxAmount = useMemo(
    () => buckets.reduce((m, b) => Math.max(m, b.totalAmount), 0),
    [buckets],
  );
  const grandTotal = useMemo(
    () => buckets.reduce((s, b) => s + b.totalAmount, 0),
    [buckets],
  );
  const totalContracts = useMemo(
    () => buckets.reduce((s, b) => s + b.count, 0),
    [buckets],
  );

  if (loading) return <LoadingSpinner message="Aggregating contract timeline..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  const renderRow = ({ item: b }: { item: YearBucket }) => {
    const isExpanded = expanded === b.year;
    const pct = maxAmount > 0 ? (b.totalAmount / maxAmount) * 100 : 0;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => setExpanded(isExpanded ? null : b.year)}
      >
        <View style={styles.cardHead}>
          <View style={styles.yearPill}>
            <Text style={styles.yearText}>{b.year}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.amount, { color: ACCENT }]}>{fmtDollar(b.totalAmount)}</Text>
            <Text style={styles.meta}>
              {b.count} contract{b.count === 1 ? '' : 's'} {'\u00B7'} {b.topCompanies.length} compan{b.topCompanies.length === 1 ? 'y' : 'ies'}
            </Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={UI_COLORS.TEXT_MUTED}
          />
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: ACCENT }]} />
        </View>
        {isExpanded && b.topCompanies.length > 0 && (
          <View style={styles.expansion}>
            <Text style={styles.expansionLabel}>Top recipients</Text>
            {b.topCompanies.map((c) => (
              <View key={c.name} style={styles.expRow}>
                <Text style={styles.expName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.expValue}>{fmtDollar(c.total)}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#10B981', '#059669', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <Ionicons name="calendar" size={22} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Tech Contract Timeline</Text>
        </View>
        <Text style={styles.heroSubtitle}>
          Government contracts awarded to tech companies, aggregated by year.
        </Text>
        <View style={styles.heroStats}>
          <Text style={styles.heroStat}>{totalContracts.toLocaleString()}</Text>
          <Text style={styles.heroStatLabel}>contracts</Text>
          <View style={styles.heroDivider} />
          <Text style={styles.heroStat}>{fmtDollar(grandTotal)}</Text>
          <Text style={styles.heroStatLabel}>total</Text>
        </View>
      </LinearGradient>

      <FlatList
        data={buckets}
        renderItem={renderRow}
        keyExtractor={(b) => b.year}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No contracts with dated awards found" />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 18, margin: 16, borderRadius: 16, overflow: 'hidden' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroStat: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  heroDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 6 },
  card: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  yearPill: { backgroundColor: ACCENT + '15', borderColor: ACCENT + '40', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  yearText: { fontSize: 13, fontWeight: '800', color: ACCENT, letterSpacing: 0.5 },
  amount: { fontSize: 17, fontWeight: '800' },
  meta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  barTrack: { height: 5, backgroundColor: UI_COLORS.BORDER, borderRadius: 2, overflow: 'hidden', marginTop: 10 },
  barFill: { height: '100%', borderRadius: 2 },
  expansion: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER_LIGHT },
  expansionLabel: { fontSize: 10, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  expName: { flex: 1, fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY, marginRight: 8 },
  expValue: { fontSize: 13, fontWeight: '700', color: ACCENT },
});
