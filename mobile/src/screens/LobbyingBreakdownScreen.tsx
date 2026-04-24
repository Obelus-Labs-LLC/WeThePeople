import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_COLORS } from '../constants/colors';
import { LoadingSpinner, EmptyState } from '../components/ui';

import { apiClient } from '../api/client';
const ACCENT = '#F59E0B';
const log = (msg: string, err: unknown) => console.warn(`[LobbyingBreakdownScreen] ${msg}:`, err);

// Tech-sector lobbying by issue — mirrors
// frontend/src/pages/LobbyingBreakdownPage.tsx. Aggregates per-company
// filings across the top 30 tech companies by lobbying_count.

interface IssueRow {
  issue: string;
  totalIncome: number;
  filingCount: number;
  companyCount: number;
  topCompanies: string[];
}

function fmtDollar(n: number): string {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// Split a multi-issue filing string into distinct issues. The LDA format
// uses commas and semicolons; we de-duplicate and trim.
function parseIssues(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

export default function LobbyingBreakdownScreen() {
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    try {
      const compRes = await apiClient.getTechCompanies({ limit: 200 });
      const companies = ((compRes as any).companies || [])
        .filter((c: any) => (c.lobbying_count || 0) > 0)
        .sort((a: any, b: any) => (b.lobbying_count || 0) - (a.lobbying_count || 0))
        .slice(0, 30);

      const perIssue = new Map<string, IssueRow>();
      await Promise.all(
        companies.map(async (co: any) => {
          try {
            const r = await apiClient.getTechCompanyLobbying(co.company_id, { limit: 100 });
            const filings = (r as any).filings || [];
            for (const f of filings) {
              const issues = parseIssues(f.lobbying_issues);
              const income = Number(f.income || 0) + Number(f.expenses || 0);
              for (const issue of issues) {
                const existing = perIssue.get(issue);
                if (existing) {
                  existing.totalIncome += income;
                  existing.filingCount += 1;
                  if (!existing.topCompanies.includes(co.display_name)) {
                    existing.topCompanies.push(co.display_name);
                    existing.companyCount += 1;
                  }
                } else {
                  perIssue.set(issue, {
                    issue,
                    totalIncome: income,
                    filingCount: 1,
                    companyCount: 1,
                    topCompanies: [co.display_name],
                  });
                }
              }
            }
          } catch (e) {
            log(`lobbying fetch ${co.company_id}`, e);
          }
        }),
      );

      const sorted = Array.from(perIssue.values())
        .sort((a, b) => b.totalIncome - a.totalIncome)
        .slice(0, 40);
      setRows(sorted);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load lobbying breakdown');
      log('load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const grandTotal = useMemo(
    () => rows.reduce((s, r) => s + r.totalIncome, 0),
    [rows],
  );

  if (loading) return <LoadingSpinner message="Aggregating tech-sector lobbying..." />;
  if (error) return <EmptyState title="Error" message={error} />;

  const renderRow = ({ item: r }: { item: IssueRow }) => {
    const isExpanded = expanded === r.issue;
    const pct = grandTotal > 0 ? (r.totalIncome / grandTotal) * 100 : 0;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => setExpanded(isExpanded ? null : r.issue)}
      >
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.issueName} numberOfLines={isExpanded ? 99 : 2}>{r.issue}</Text>
            <Text style={styles.meta}>
              {r.filingCount} filing{r.filingCount === 1 ? '' : 's'} {'\u00B7'} {r.companyCount} compan{r.companyCount === 1 ? 'y' : 'ies'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.amount, { color: ACCENT }]}>{fmtDollar(r.totalIncome)}</Text>
            <Text style={styles.pct}>{pct.toFixed(1)}%</Text>
          </View>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.min(pct * 3, 100)}%`, backgroundColor: ACCENT }]} />
        </View>
        {isExpanded && r.topCompanies.length > 0 && (
          <View style={styles.expansion}>
            <Text style={styles.expansionLabel}>Lobbying companies</Text>
            <View style={styles.chipRow}>
              {r.topCompanies.slice(0, 8).map((name) => (
                <View key={name} style={styles.chip}>
                  <Ionicons name="business" size={11} color={ACCENT} />
                  <Text style={styles.chipText} numberOfLines={1}>{name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F59E0B', '#D97706', '#92400E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <Ionicons name="megaphone" size={22} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Tech Lobbying Breakdown</Text>
        </View>
        <Text style={styles.heroSubtitle}>
          What tech companies lobby the government about, ranked by total spend.
        </Text>
        <View style={styles.heroStats}>
          <Text style={styles.heroStat}>{rows.length}</Text>
          <Text style={styles.heroStatLabel}>issues</Text>
          <View style={styles.heroDivider} />
          <Text style={styles.heroStat}>{fmtDollar(grandTotal)}</Text>
          <Text style={styles.heroStatLabel}>total</Text>
        </View>
      </LinearGradient>

      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={(r) => r.issue}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        ListEmptyComponent={<EmptyState title="No lobbying issues found" />}
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
  cardHead: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  issueName: { fontSize: 13, fontWeight: '700', color: UI_COLORS.TEXT_PRIMARY, lineHeight: 18 },
  meta: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '800' },
  pct: { fontSize: 11, color: UI_COLORS.TEXT_MUTED, marginTop: 2 },
  barTrack: { height: 4, backgroundColor: UI_COLORS.BORDER, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  expansion: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: UI_COLORS.BORDER_LIGHT },
  expansionLabel: { fontSize: 10, fontWeight: '700', color: UI_COLORS.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ACCENT + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: ACCENT + '30' },
  chipText: { fontSize: 11, fontWeight: '600', color: ACCENT, maxWidth: 120 },
});
