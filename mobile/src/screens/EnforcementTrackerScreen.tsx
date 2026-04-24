import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#DC2626';
const log = (msg: string, err: unknown) => console.warn(`[EnforcementTrackerScreen] ${msg}:`, err);

// Tech-sector enforcement tracker — mirrors frontend/src/pages/EnforcementTrackerPage.tsx.
// Hits /tech/companies + per-company /enforcement and aggregates into a
// severity-ranked feed.

interface Action {
  id: number;
  case_title?: string;
  description?: string;
  penalty_amount: number | null;
  case_date?: string;
  case_url?: string;
  agency?: string;
  company_id: string;
  company_name: string;
}

type Severity = 'all' | 'high' | 'medium' | 'low';

function severityOf(n?: number | null): Exclude<Severity, 'all'> {
  if (!n) return 'low';
  if (n >= 1e9) return 'high';
  if (n >= 1e8) return 'medium';
  return 'low';
}

const SEVERITY_COLORS: Record<Exclude<Severity, 'all'>, string> = {
  high: '#DC2626',
  medium: '#F59E0B',
  low: '#10B981',
};

function fmtDollar(n?: number | null): string {
  if (n == null || n === 0) return '-';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(s?: string): string {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
}

export default function EnforcementTrackerScreen() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sev, setSev] = useState<Severity>('all');

  const load = async () => {
    try {
      // Fetch all tech companies, then fan-out per-company enforcement.
      // Capped at 50 companies to keep the mobile experience snappy.
      const compRes = await apiClient.getTechCompanies({ limit: 200 });
      const companies = (compRes as any).companies || [];
      const withEnforcement = companies.filter((c: any) => (c.enforcement_count || 0) > 0).slice(0, 50);

      const results: Action[] = [];
      await Promise.all(
        withEnforcement.map(async (co: any) => {
          try {
            const r = await apiClient.getTechCompanyEnforcement(co.company_id, { limit: 20 });
            const items = (r as any).actions || [];
            for (const a of items) {
              results.push({
                ...a,
                company_id: co.company_id,
                company_name: co.display_name || co.company_id,
              });
            }
          } catch (e) {
            log(`enforcement fetch ${co.company_id}`, e);
          }
        }),
      );

      results.sort((a, b) => (b.penalty_amount || 0) - (a.penalty_amount || 0));
      setActions(results);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load enforcement data');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    if (sev === 'all') return actions;
    return actions.filter((a) => severityOf(a.penalty_amount) === sev);
  }, [actions, sev]);

  const stats = useMemo(() => {
    const totalPenalties = filtered.reduce((s, a) => s + (a.penalty_amount || 0), 0);
    const byCompany: Record<string, { name: string; count: number; total: number }> = {};
    filtered.forEach((a) => {
      const k = a.company_id;
      if (!byCompany[k]) byCompany[k] = { name: a.company_name, count: 0, total: 0 };
      byCompany[k].count += 1;
      byCompany[k].total += a.penalty_amount || 0;
    });
    const topCompanies = Object.values(byCompany)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    return { totalPenalties, topCompanies };
  }, [filtered]);

  if (loading) return <LoadingSpinner message="Loading enforcement tracker..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  const renderRow = ({ item: a }: { item: Action }) => {
    const s = severityOf(a.penalty_amount);
    const color = SEVERITY_COLORS[s];
    return (
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}
        onPress={() => a.case_url && Linking.openURL(a.case_url).catch((e) => log('open case', e))}
        disabled={!a.case_url}
      >
        <View style={styles.cardHead}>
          <View style={[styles.sevBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.sevText, { color }]}>{s.toUpperCase()}</Text>
          </View>
          {a.penalty_amount != null && a.penalty_amount > 0 && (
            <Text style={[styles.penalty, { color }]}>{fmtDollar(a.penalty_amount)}</Text>
          )}
        </View>
        <Text style={styles.company}>{a.company_name}</Text>
        {a.case_title && <Text style={styles.caseTitle} numberOfLines={2}>{a.case_title}</Text>}
        {a.description && <Text style={styles.desc} numberOfLines={3}>{a.description}</Text>}
        <View style={styles.cardFoot}>
          {a.agency && <Text style={styles.date}>{a.agency}</Text>}
          {a.case_date && <Text style={styles.date}>{fmtDate(a.case_date)}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#DC2626', '#B91C1C', '#7F1D1D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <Ionicons name="warning" size={22} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Tech Enforcement Tracker</Text>
        </View>
        <View style={styles.heroStats}>
          <Text style={styles.heroStat}>{filtered.length}</Text>
          <Text style={styles.heroStatLabel}>actions</Text>
          <View style={styles.heroDivider} />
          <Text style={styles.heroStat}>{fmtDollar(stats.totalPenalties)}</Text>
          <Text style={styles.heroStatLabel}>penalties</Text>
        </View>
      </LinearGradient>

      {stats.topCompanies.length > 0 && (
        <View style={styles.topSection}>
          <Text style={styles.topLabel}>Most-penalized companies</Text>
          {stats.topCompanies.map((t, i) => (
            <View key={t.name} style={styles.topRow}>
              <Text style={styles.topRank}>#{i + 1}</Text>
              <Text style={styles.topName} numberOfLines={1}>{t.name}</Text>
              <Text style={styles.topValue}>{fmtDollar(t.total)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.filterRow}>
        {(['all', 'high', 'medium', 'low'] as Severity[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, sev === s && styles.filterChipActive]}
            onPress={() => setSev(s)}
          >
            <Text style={[styles.filterText, sev === s && styles.filterTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        renderItem={renderRow}
        keyExtractor={(a, i) => `${a.company_id}:${a.id}:${i}`}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No enforcement actions at this severity" />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.SECONDARY_BG },
  hero: { padding: 18, margin: 16, borderRadius: 16, overflow: 'hidden' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroStat: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  heroDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 6 },
  topSection: { marginHorizontal: 16, marginBottom: 12, backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  topLabel: { fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  topRank: { fontSize: 12, fontWeight: '800', color: UI_COLORS.TEXT_MUTED, width: 22 },
  topName: { flex: 1, fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_PRIMARY },
  topValue: { fontSize: 13, fontWeight: '800', color: ACCENT },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER, backgroundColor: UI_COLORS.CARD_BG },
  filterChipActive: { backgroundColor: ACCENT + '20', borderColor: ACCENT + '50' },
  filterText: { fontSize: 11, fontWeight: '700', color: UI_COLORS.TEXT_SECONDARY, textTransform: 'uppercase' },
  filterTextActive: { color: ACCENT },
  card: { backgroundColor: UI_COLORS.CARD_BG, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: UI_COLORS.BORDER_LIGHT },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sevBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sevText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  penalty: { fontSize: 17, fontWeight: '800' },
  company: { fontSize: 14, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, marginTop: 2 },
  caseTitle: { fontSize: 13, fontWeight: '600', color: UI_COLORS.TEXT_SECONDARY, marginTop: 4 },
  desc: { fontSize: 12, color: UI_COLORS.TEXT_SECONDARY, lineHeight: 17, marginTop: 6 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  date: { fontSize: 11, color: UI_COLORS.TEXT_MUTED },
});
